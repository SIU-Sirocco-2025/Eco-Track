// SPDX-License-Identifier: GPL-3.0-or-later
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const { MongoStore } = require('connect-mongo');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { Connector } = require('./client');
const { complete } = require('./outbox');
const { performAction, reconcileAction } = require('./review-actions');
const { caseTimeline } = require('./case-timeline');
const { exportCaseEvidence } = require('./case-evidence');
const { exportArchivedDecision, compareArchivedDecisions } = require('./decision-archive');
const { hash } = require('./source');
const { operationsFilter, caseStatus } = require('./case-operations');

const root = '/sirocco/review';
const cookieName = 'ecotrack.review';
const randomToken = () => randomBytes(32).toString('hex');
const sessionCall = (req, method) => new Promise((resolve, reject) => {
  req.session[method](error => error ? reject(error) : resolve());
});

function trustedUrl(value, originOnly = false) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) {
    throw new Error('URL SSO không hợp lệ');
  }
  return url;
}

function createReviewRouter(env) {
  const router = express.Router();
  const issuer = trustedUrl(env.SIROCCO_OIDC_ISSUER);
  const origin = trustedUrl(env.SIROCCO_REVIEW_ORIGIN, true);
  const callback = origin.origin + root + '/callback';
  const { SIROCCO_OIDC_CLIENT_ID: clientId, SIROCCO_OIDC_CLIENT_SECRET: clientSecret,
    SIROCCO_REVIEW_SESSION_SECRET: secret } = env;
  if (!clientId || !clientSecret || !secret || secret.length < 32) throw new Error('Thiếu cấu hình SSO EcoTrack');
  const connector = new Connector({ url: env.CORE_API_URL, token: env.CORE_CONNECTOR_TOKEN });
  const secure = origin.protocol === 'https:';
  const cookies = { path: root, httpOnly: true, secure, sameSite: 'lax' };
  const collection = () => mongoose.connection.db.collection('sirocco_outbox');
  const store = MongoStore.create({
    clientPromise: mongoose.connection.asPromise().then(connection => connection.getClient()),
    collectionName: 'sirocco_review_sessions',
    ttl: 15 * 60,
    autoRemove: 'native',
  });
  store.on('error', () => console.error('EcoTrack review: SESSION_STORE_UNAVAILABLE'));
  let discovery;
  async function provider() {
    const oidc = await import('openid-client');
    discovery ??= oidc.discovery(issuer, clientId, clientSecret, undefined, {
      execute: [oidc.enableNonRepudiationChecks, ...(issuer.protocol === 'http:' ? [oidc.allowInsecureRequests] : [])],
    }).catch(error => { discovery = undefined; throw error; });
    return { oidc, config: await discovery };
  }
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  router.use(session({ name: cookieName, secret, store, resave: false, saveUninitialized: false,
    cookie: { ...cookies, maxAge: 15 * 60_000 } }));
  const render = (res, locals = {}, status = 200) => res.status(status).render('sirocco-review', { root, ...locals });

  router.get('/login', async (req, res) => {
    const { oidc, config } = await provider();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    req.session.login = { verifier, state, nonce, expires: Date.now() + 5 * 60_000 };
    const url = oidc.buildAuthorizationUrl(config, {
      scope: 'openid', redirect_uri: callback, state, nonce,
      code_challenge_method: 'S256', code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    });
    await sessionCall(req, 'save');
    res.redirect(url.href);
  });
  router.get('/callback', async (req, res) => {
    const login = req.session.login;
    if (!login || login.expires <= Date.now() || req.query.state !== login.state) {
      return render(res, { error: 'Phiên đăng nhập không hợp lệ. Hãy bắt đầu lại.' }, 400);
    }
    delete req.session.login;
    await sessionCall(req, 'save');
    const { oidc, config } = await provider();
    const url = new URL(callback);
    url.search = req.originalUrl.split('?').slice(1).join('?');
    let claims;
    try {
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        expectedState: login.state, expectedNonce: login.nonce, pkceCodeVerifier: login.verifier, idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch {
      return render(res, { error: 'Không xác nhận được phiên Keycloak. Hãy thử đăng nhập lại.' }, 401);
    }
    if (typeof claims?.sub !== 'string' || !claims.sub || !Number.isFinite(claims.exp) ||
        !Array.isArray(claims.ecotrack_roles) || !claims.ecotrack_roles.includes('ecotrack-reviewer')) {
      await sessionCall(req, 'destroy');
      res.clearCookie(cookieName, cookies);
      return render(res, { error: 'Tài khoản chưa được cấp quyền xác minh EcoTrack.' }, 403);
    }
    await sessionCall(req, 'regenerate');
    req.session.reviewer = { sub: claims.sub, expires: Math.min(claims.exp * 1000, Date.now() + 5 * 60_000) };
    req.session.csrf = randomToken();
    await sessionCall(req, 'save');
    res.redirect(root);
  });

  router.use(express.urlencoded({ extended: false, limit: '16kb' }));
  const actor = req => req.session.reviewer?.expires > Date.now() ? req.session.reviewer.sub : undefined;
  function csrf(req, res, next) {
    const expected = req.session.csrf, received = req.body?.csrf;
    if (!actor(req) || typeof expected !== 'string' || typeof received !== 'string' ||
        Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
      return render(res, { error: 'Phiên thao tác đã hết hạn hoặc yêu cầu không hợp lệ.' }, 403);
    }
    next();
  }
  router.post('/logout', csrf, async (req, res) => {
    await sessionCall(req, 'destroy');
    res.clearCookie(cookieName, cookies);
    res.redirect(303, root);
  });
  router.get('/', async (req, res) => {
    const reviewer = actor(req);
    if (!reviewer) return render(res);
    const filter = { $or: [{ reviewer }, { reviewVersion: 2, supplementer: reviewer }], status: { $in: visibleStatuses } };
    if (visibleStatuses.includes(req.query.status)) filter.status = req.query.status;
    const operation = operationsFilter(req.query.status);
    const query = operation ? { $and: [filter, operation] } : filter;
    const items = await collection().find(query,
      { projection: { status: 1, variables: 1, reviewVersion: 1, reviewState: 1, pendingAction: 1, 'completion.taskId': 1 } })
      .sort({ createdAt: -1 }).limit(30).toArray();
    render(res, { items: items.map(item => ({ ...item, displayStatus: caseStatus(item) })), selectedStatus: req.query.status, csrf: req.session.csrf });
  });
  const visibleStatuses = ['pending', 'retry', 'blocked', 'active', 'verified', 'rejected'];
  const actionableStatuses = ['active', 'verified', 'rejected'];
  function owned(req, statuses = visibleStatuses) {
    if (!actor(req) || !/^[a-f0-9]{64}$/.test(req.params.id)) return null;
    return collection().findOne({ _id: req.params.id, $or: [{ reviewer: actor(req) }, { reviewVersion: 2, supplementer: actor(req) }],
      status: { $in: statuses } });
  }
  async function evidence(item) {
    const bytes = await connector.request('/objects', undefined, { 'X-Core-Object': item.objectKey, 'X-Core-Clean': 'true' }, true);
    if (createHash('sha256').update(bytes).digest('hex') !== item.snapshotHash)
      throw Object.assign(new Error('Checksum sai'), { code: 'CASE_EVIDENCE_MISMATCH' });
    return JSON.parse(bytes.toString('utf8'));
  }
  router.get('/:id/evidence.json', async (req, res) => {
    if (!actor(req)) return render(res, { error: 'Hãy đăng nhập để tải chứng cứ.' }, 401);
    const item = await owned(req);
    if (!item) return render(res, { error: 'Không tìm thấy việc xác minh được giao cho bạn.' }, 404);
    if (!item.steps?.receipt) return render(res, { error: 'Chứng cứ đang chờ quét tại Core.' }, 409);
    let bundle;
    try { bundle = await exportCaseEvidence(item, connector); }
    catch (error) {
      if (error.code === 'CASE_EVIDENCE_NOT_READY')
        return render(res, { error: 'Kết quả đang được đối soát. Hãy tải lại hồ sơ trước khi xuất chứng cứ.' }, 409);
      throw error;
    }
    res.attachment(`ecotrack-${item._id}.json`).json(bundle);
  });
  router.get('/:id/archive.json', async (req, res) => {
    if (!actor(req)) return render(res, { error: 'Hãy đăng nhập để tải hồ sơ đã lưu tại Core.' }, 401);
    const item = await owned(req, ['verified', 'rejected']);
    if (!item) return render(res, { error: 'Không tìm thấy việc xác minh được giao cho bạn.' }, 404);
    if (item.decisionArchive?.status !== 'archived')
      return render(res, { error: 'Hồ sơ chưa có phiên bản đã xác nhận tại Core.' }, 409);
    const exported = await exportArchivedDecision(connector, item.sourceKey, item.decisionArchive.version);
    if (exported.record.data.caseId !== item._id)
      return render(res, { error: 'Phiên bản lưu tại Core không khớp hồ sơ này.' }, 409);
    res.attachment(`ecotrack-core-${item._id}.json`).json(exported);
  });
  async function priorArchivedCase(item, reviewer) {
    if (item.decisionArchive?.status !== 'archived' || item.decisionArchive.version <= 1) return null;
    return collection().findOne({
      sourceKey: item.sourceKey, reviewVersion: 2,
      $or: [{ reviewer }, { supplementer: reviewer }],
      status: { $in: ['verified', 'rejected'] },
      'decisionArchive.status': 'archived',
      'decisionArchive.version': { $lt: item.decisionArchive.version },
    }, { projection: { 'decisionArchive.version': 1 }, sort: { 'decisionArchive.version': -1 } });
  }
  router.get('/:id/compare', async (req, res) => {
    const reviewer = actor(req);
    if (!reviewer) return render(res, { error: 'Hãy đăng nhập để so sánh hồ sơ.' }, 401);
    const item = await owned(req, ['verified', 'rejected']);
    const prior = item && await priorArchivedCase(item, reviewer);
    if (!prior) return render(res, { error: 'Chưa có hai phiên bản đã lưu mà bạn được phép xem.' }, 404);
    const comparison = await compareArchivedDecisions(connector, item.sourceKey,
      prior.decisionArchive.version, item.decisionArchive.version);
    if (comparison.entries[0].caseId !== prior._id || comparison.entries[1].caseId !== item._id)
      return render(res, { error: 'Phiên bản lưu tại Core không khớp hồ sơ này.' }, 409);
    const outstanding = await collection().findOne({
      sourceKey: item.sourceKey, $or: [{ reviewer }, { supplementer: reviewer }],
      'decisionArchive.status': { $in: ['pending', 'blocked'] },
    }, { projection: { _id: 1 } });
    return render(res, { comparison, archiveGaps: Boolean(outstanding), caseId: item._id, csrf: req.session.csrf });
  });
  router.get('/:id', async (req, res) => {
    if (!actor(req)) return res.redirect(root);
    const item = await owned(req);
    if (!item) return render(res, { error: 'Không tìm thấy việc xác minh được giao cho bạn.' }, 404);
    let task, pending;
    let coreStatus = 'unchecked';
    if (item.reviewVersion === 2 && item.status === 'active') {
      pending = item.pendingAction && item.actions?.[item.pendingAction];
      if (!pending) {
        try {
          const tasks = await connector.workflow({ operation: 'tasks.list', processId: item.steps.processId });
          task = tasks.data?.find(t => t.assignee === actor(req));
          coreStatus = 'confirmed';
        } catch { coreStatus = 'unavailable'; }
      }
    }
    if (typeof item.snapshotText !== 'string' || hash(item.snapshotText) !== item.snapshotHash)
      throw Object.assign(new Error('Chứng cứ nguồn không khớp'), { code: 'CASE_EVIDENCE_INVALID' });
    let source = JSON.parse(item.snapshotText);
    if (item.steps?.receipt && coreStatus !== 'unavailable') {
      try { source = await evidence(item); coreStatus = 'confirmed'; }
      catch (error) {
        coreStatus = error.code === 'CASE_EVIDENCE_MISMATCH' ? 'mismatch' : 'unavailable';
        task = undefined;
      }
    }
    const canRetry = pending?.actor === actor(req) && ['unchecked', 'confirmed'].includes(coreStatus);
    const reconciliation = req.session.reconciliation?.caseId === item._id ? req.session.reconciliation.result : null;
    if (reconciliation) delete req.session.reconciliation;
    render(res, { item, task, pending, canRetry, source, coreStatus, displayStatus: caseStatus(item),
      canReconcile: canRetry && Boolean(pending.evidence),
      reconciliation, canCompareArchive: Boolean(await priorArchivedCase(item, actor(req))),
      timeline: caseTimeline(item, source), csrf: req.session.csrf });
  });
  router.post('/:id/reconcile', csrf, async (req, res) => {
    const item = await owned(req, ['active']);
    const pending = item?.reviewVersion === 2 && item.pendingAction && item.actions?.[item.pendingAction];
    if (!pending || pending.actor !== actor(req) || !pending.evidence || pending.taskId !== req.body.taskId)
      return render(res, { error: 'Không tìm thấy yêu cầu đang chờ đối soát do bạn gửi.' }, 404);
    const detail = root + '/' + item._id;
    try {
      await evidence(item);
      await reconcileAction(collection(), connector, item._id, pending.taskId);
      req.session.reconciliation = { caseId: item._id, result: 'confirmed' };
    } catch (error) {
      if (error.code === 'CASE_EVIDENCE_MISMATCH')
        return render(res, { error: 'Chứng cứ ở Core không khớp bản ghi của EcoTrack.' }, 409);
      if (error.status !== 404 && !error.retryable && error.code !== 'REVIEW_ACTION_UNCONFIRMED') throw error;
      req.session.reconciliation = { caseId: item._id, result: 'waiting' };
    }
    return res.redirect(303, detail);
  });
  router.post('/:id', csrf, async (req, res) => {
    const item = await owned(req, actionableStatuses);
    if (!item) return render(res, { error: 'Không tìm thấy việc xác minh được giao cho bạn.' }, 404);
    const { decision } = req.body;
    if (item.reviewVersion === 2) {
      await evidence(item);
      try {
        await performAction(collection(), connector, item._id, { actor: actor(req), taskId: req.body.taskId,
          action: decision, reason: req.body.reason, revision: req.body.revision, snapshotHash: req.body.snapshotHash,
          obsoleteAck: req.body.obsoleteAck === 'true' });
      } catch (error) {
        const messages = { REVIEW_REVISION_CONFLICT: 'Số đo đã thay đổi. Mở lại nguồn và tạo việc cho phiên bản mới trước khi kết luận.',
          REVIEW_SOURCE_MISSING: 'Nguồn không còn khả dụng. Mở lại hồ sơ để xử lý phiên bản cũ.',
          REVIEW_NOT_ACTIVE: 'Hồ sơ đã kết thúc. Mở lại để xem quyết định đã lưu.',
          REVIEW_ACTION_INVALID: 'Thao tác không phù hợp với trạng thái hiện tại của hồ sơ.',
          REVIEW_ACTION_CONFLICT: 'Tác vụ đã có yêu cầu khác. Mở lại để xem kết quả.',
          REVIEW_ACTION_PENDING: 'Yêu cầu trước đang chờ đối soát. Người đã gửi cần mở lại hồ sơ và gửi lại cùng yêu cầu.',
          REVIEW_REASON_REQUIRED: 'Hãy nhập lý do từ 5 đến 2000 ký tự.', REVIEW_TASK_FORBIDDEN: 'Bạn không được giao bước xử lý này.' };
        if (messages[error.code]) return render(res, { error: messages[error.code] }, error.code === 'REVIEW_REASON_REQUIRED' ? 400 : 409);
        throw error;
      }
      return res.redirect(303, root + '/' + item._id);
    }
    if (!['verified', 'rejected'].includes(decision)) return render(res, { error: 'Hãy chọn kết quả xác minh.' }, 400);
    await evidence(item);
    try {
      await complete(collection(), connector, item._id, actor(req), decision);
    } catch (error) {
      if (error.code === 'OUTBOX_COMPLETION_CONFLICT') {
        return render(res, { error: 'Công việc đã có quyết định khác. Mở lại để xem trạng thái.' }, 409);
      }
      throw error;
    }
    res.redirect(303, root + '/' + item._id);
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('EcoTrack review:', error.code || error.name);
    render(res, { error: 'Chưa xác nhận được kết quả. Mở lại công việc và gửi lại cùng quyết định nếu cần.' }, 503);
  });
  return router;
}

module.exports = { createReviewRouter };
