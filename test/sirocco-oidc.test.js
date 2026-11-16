// SPDX-License-Identifier: GPL-3.0-or-later
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const { createReviewRouter } = require('../integrations/sirocco/review-routes');
const { hash, encode } = require('../integrations/sirocco/source');

test('OIDC từ chối chữ ký/issuer/audience/nonce/thời hạn sai và callback dùng lại', {
  skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL, timeout: 60000,
}, async t => {
  const database = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
  assert.equal(database.pathname, '/ecotrack_oidc_tests');
  await mongoose.connect(database.href);
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const goodKey = await generateKeyPair('RS256'), wrongKey = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(goodKey.publicKey), kid: 'fixture-signing-key', use: 'sig', alg: 'RS256' };
  let mode = 'valid', nonce, tokenRequests = 0;
  const provider = express();
  const providerServer = provider.listen(0, '127.0.0.1');
  await once(providerServer, 'listening');
  const issuer = 'http://127.0.0.1:' + providerServer.address().port;
  provider.get('/.well-known/openid-configuration', (_req, res) => res.json({
    issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks',
    response_types_supported: ['code'], subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
  }));
  provider.get('/jwks', (_req, res) => res.json({ keys: [jwk] }));
  provider.post('/token', async (_req, res) => {
    tokenRequests++;
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({ sub: 'fixture-reviewer',
      iss: mode === 'wrong-issuer' ? issuer + '/other' : issuer,
      aud: mode === 'wrong-audience' ? 'another-client' : 'fixture-client',
      exp: mode === 'expired' ? now - 600 : now + 300, iat: now,
      nonce: mode === 'wrong-nonce' ? 'incorrect' : nonce,
      ecotrack_roles: ['ecotrack-reviewer'],
    }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(mode === 'wrong-signature' ? wrongKey.privateKey : goodKey.privateKey);
    res.json({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 300, id_token: jwt });
  });
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'pug');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const core = express();
  core.use(express.json());
  const coreRequests = [];
  let unavailable = false;
  const snapshotText = encode({ parameter: 'pm25', value: 10, unit: 'ug/m3', sensorId: 1, mode: 'synthetic',
    from: '2026-11-01T00:00:00Z', to: '2026-11-01T01:00:00Z', collectedAt: '2026-11-01T01:02:00Z', ageAtCollectionSeconds: 120 });
  core.use('/api/core/connector', (req, res) => {
    coreRequests.push([req.method, req.path, req.body?.operation]);
    if (unavailable) return res.sendStatus(503);
    if (req.path === '/contract') return res.json({ contract: 'sirocco.connector', version: '2.0',
      authentication: 'server-credential', isolation: 'application-resources', clientId: 'ecotrack-2025',
      capabilities: ['operations.journal', 'workflow.typed.scoped', 'workflow.process.start', 'workflow.task.complete',
        'objects.read.scoped', 'objects.quarantine', 'objects.promote.verified', 'objects.scan.receipt'] });
    if (req.path === '/objects') return res.type('application/octet-stream').send(snapshotText);
    if (req.path.startsWith('/operations/')) return res.json({ state: 'applied', resource: { taskId: 'task-1', processId: 'process-1' } });
    if (req.body?.operation === 'tasks.ended') return res.json({ data: { data: [{ id: 'task-1', endTime: '2026-11-01T01:03:00Z' }] } });
    if (req.body?.operation === 'processes.finished') return res.json({ data: { data: [{ id: 'process-1' }] } });
    return res.sendStatus(400);
  });
  const coreServer = core.listen(0, '127.0.0.1');
  await once(coreServer, 'listening');
  app.use('/sirocco/review', createReviewRouter({
    SIROCCO_OIDC_ISSUER: issuer, SIROCCO_REVIEW_ORIGIN: origin,
    SIROCCO_OIDC_CLIENT_ID: 'fixture-client', SIROCCO_OIDC_CLIENT_SECRET: 'synthetic-client-secret-12345678901234567890',
    SIROCCO_REVIEW_SESSION_SECRET: 'synthetic-session-secret-12345678901234567890',
    CORE_API_URL: `http://127.0.0.1:${coreServer.address().port}/api/core/connector`, CORE_CONNECTOR_TOKEN: 'synthetic-connector-token-12345678901234567890',
  }));
  async function begin() {
    const response = await fetch(origin + '/sirocco/review/login', { redirect: 'manual' });
    assert.equal(response.status, 302);
    const authorization = new URL(response.headers.get('location'));
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    nonce = authorization.searchParams.get('nonce');
    return { cookie: response.headers.getSetCookie()[0].split(';')[0], state: authorization.searchParams.get('state') };
  }
  async function callback(login, state = login.state) {
    return fetch(origin + '/sirocco/review/callback?code=fixture-code&state=' + encodeURIComponent(state), {
      redirect: 'manual', headers: { Cookie: login.cookie },
    });
  }
  try {
    for (const invalid of ['wrong-signature', 'wrong-issuer', 'wrong-audience', 'wrong-nonce', 'expired']) {
      await t.test(invalid, async () => {
        mode = invalid;
        const response = await callback(await begin());
        assert.equal(response.status, 401);
      });
    }
    await t.test('state sai chặn trước token endpoint', async () => {
      const login = await begin(), before = tokenRequests;
      assert.equal((await callback(login, 'wrong-state')).status, 400);
      assert.equal(tokenRequests, before);
    });
    await t.test('phiên hợp lệ chỉ dùng callback một lần', async () => {
      mode = 'valid';
      const login = await begin();
      const accepted = await callback(login);
      assert.equal(accepted.status, 302);
      assert.equal(accepted.headers.get('location'), '/sirocco/review');
      assert.equal((await callback(login)).status, 400);
    });
    await t.test('chỉ người gửi đối soát được hồ sơ đang chờ và không gửi lại quyết định lên Core', async () => {
      const login = await callback(await begin());
      const cookie = login.headers.getSetCookie()[0].split(';')[0];
      const root = origin + '/sirocco/review';
      const collection = mongoose.connection.db.collection('sirocco_outbox');
      const id = hash('fixture-operations-reconcile');
      const other = hash('fixture-operations-other');
      const draft = { status: 'active', reviewVersion: 2, reviewer: 'fixture-reviewer', supplementer: 'fixture-supplementer',
        reviewState: 'awaiting_review', reviewReason: 'Kiểm tra nguồn thử', ruleVersion: 'fixture', revision: hash('revision'),
        snapshotHash: hash(snapshotText), snapshotText, variables: { parameter: 'pm25', sensorId: 1 },
        objectKey: 'fixture.json', steps: { processId: 'process-1', receipt: {} }, pendingAction: 'task-1', actions: {
          'task-1': { taskId: 'task-1', actor: 'fixture-reviewer', action: 'verified', reason: 'Đã kiểm số đo',
            operationId: hash('operation') + '_review', terminal: true, evidence: { checksum: hash('fixture evidence') },
            createdAt: '2026-11-01T01:03:00Z' },
        } };
      try {
        await collection.insertMany([{ _id: id, ...draft }, { _id: other, ...draft,
          actions: { 'task-1': { ...draft.actions['task-1'], actor: 'fixture-supplementer' } } }]);
        const get = url => fetch(root + url, { headers: { Cookie: cookie } });
        const detail = await get('/' + id);
        assert.equal(detail.status, 200);
        const html = await detail.text();
        assert.match(html, /Chờ đồng bộ kết quả/);
        const csrf = html.match(/name="csrf" value="([a-f0-9]{64})"/)[1];
        const post = (target, token = csrf) => fetch(`${root}/${target}/reconcile`, { method: 'POST', redirect: 'manual',
          headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: token, taskId: 'task-1' }) });
        assert.equal((await post(other)).status, 404);
        assert.equal((await post(id, 'wrong')).status, 403);
        assert.match(await (await get('/?status=reconciling')).text(), new RegExp(id));
        assert.doesNotMatch(await (await get('/?status=awaiting-person')).text(), new RegExp(id));
        unavailable = true;
        const degraded = await get('/' + id);
        assert.equal(degraded.status, 200);
        assert.match(await degraded.text(), /Trang đang hiển thị bản ghi đã lưu ở EcoTrack/);
        unavailable = false;
        coreRequests.length = 0;
        const results = await Promise.all([post(id), post(id)]);
        assert.ok(results.some(response => response.status === 303));
        assert.ok(results.every(response => [303, 404].includes(response.status)));
        assert.ok(coreRequests.every(([method, path, operation]) => method === 'GET' && path.startsWith('/operations/') ||
          method === 'POST' && path === '/workflow' && ['tasks.ended', 'processes.finished'].includes(operation)));
        assert.equal((await collection.findOne({ _id: id })).status, 'verified');
        assert.equal((await collection.findOne({ _id: other })).status, 'active');
      } finally {
        unavailable = false;
        await collection.deleteMany({ _id: { $in: [id, other] } });
      }
    });
  } finally {
    for (const listener of [server, providerServer, coreServer]) listener.closeAllConnections();
    await Promise.all([server, providerServer, coreServer].map(listener => new Promise(resolve => listener.close(resolve))));
    await mongoose.disconnect();
  }
});
