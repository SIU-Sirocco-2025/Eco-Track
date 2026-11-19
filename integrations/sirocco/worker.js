// SPDX-License-Identifier: GPL-3.0-or-later
const { setTimeout: sleep } = require('node:timers/promises');
const { randomUUID } = require('node:crypto');
const { dispatch, complete } = require('./outbox');
const { performAction } = require('./review-actions');
const { hash } = require('./source');
const { completionPending } = require('./case-operations');
const { publishPendingDecisions } = require('./decision-archive');

function sharedCooldown(state, client) {
  const _id = hash({ gateway: client.url });
  return {
    async remaining() {
      const row = await state.findOne({ _id });
      return Math.max(0, +(row?.resumeAt ?? 0) - Date.now());
    },
    async pause(delay) {
      await state.updateOne({ _id }, { $max: { resumeAt: new Date(Date.now() + delay) } }, { upsert: true });
    },
  };
}

async function recoverCompletions(collection, client, limit = 20, cooldown) {
  const now = new Date();
  const due = { $and: [completionPending,
    { $or: [{ recoveryReadyAt: { $exists: false } }, { recoveryReadyAt: { $lte: now } }] },
    { $or: [{ 'recovery.nextAt': { $exists: false } }, { 'recovery.nextAt': { $lte: now } }] },
    { $or: [{ 'recovery.until': { $exists: false } }, { 'recovery.until': { $lte: now } }] },
  ], 'recovery.blocked': { $ne: true } };
  const items = await collection.find(due, { projection: { _id: 1 } })
    .sort({ createdAt: 1, _id: 1 }).limit(limit).toArray();
  for (const { _id } of items) {
    const remaining = await cooldown?.remaining();
    if (remaining > 0) return remaining;
    const owner = randomUUID();
    const claimedAt = new Date();
    const item = await collection.findOneAndUpdate({ _id, ...due }, [{
      $set: { 'recovery.owner': owner, 'recovery.until': new Date(+claimedAt + 600000),
        'recovery.startedAt': { $ifNull: ['$recovery.startedAt', claimedAt] },
        'recovery.attempts': { $add: [{ $ifNull: ['$recovery.attempts', 0] }, 1] } },
    }], { returnDocument: 'after' });
    if (!item) continue;
    const taskId = item.pendingAction ?? item.completion?.taskId;
    const saved = item.actions?.[taskId];
    const guard = { _id, 'recovery.owner': owner };
    if (item.recovery.attempts > 10 || +claimedAt >= +item.recovery.startedAt + 86400000) {
      await collection.updateOne(guard, {
        $set: { 'recovery.blocked': true, 'recovery.code': 'RECOVERY_BUDGET_EXHAUSTED' },
        $unset: { 'recovery.owner': '', 'recovery.until': '' },
      });
      continue;
    }
    try {
      if (item.reviewVersion === 2) {
        if (!saved) throw Object.assign(new Error('Missing action'), { code: 'REVIEW_ACTION_MISSING' });
        await performAction(collection, client, _id, saved);
      } else await complete(collection, client, _id, item.completion.actor, item.completion.decision);
      await collection.updateOne(guard, { $unset: { recovery: '' } });
    } catch (error) {
      const attempts = item.recovery.attempts;
      const delay = Math.max(error.retryAfterMs || 0, 1000 * 2 ** Math.min(attempts, 9) * (1 + Math.random() / 4));
      const lastAt = new Date();
      const startedAt = item.recovery?.startedAt ?? lastAt;
      const nextAt = new Date(+lastAt + delay);
      const mongoUnavailable = ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError'].includes(error.name);
      const retryable = mongoUnavailable || error.retryable ||
        ['REVIEW_ACTION_PENDING', 'REVIEW_ACTION_UNCONFIRMED', 'OUTBOX_COMPLETION_UNCONFIRMED'].includes(error.code);
      const blocked = !retryable || attempts >= 10 || +nextAt > +startedAt + 86400000;
      const code = mongoUnavailable ? 'RECOVERY_DATABASE_UNAVAILABLE' :
        /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '') ? error.code : 'RECOVERY_FAILED';
      // Một lượt xử lý UI có thể đã hoàn tất hoặc chuyển sang task khác trong lúc worker chạy.
      const currentTask = item.reviewVersion === 2 ? { pendingAction: taskId } : { 'completion.taskId': taskId, status: 'active' };
      const recorded = await collection.updateOne({ ...guard, ...currentTask }, {
        $set: { recovery: { attempts, startedAt, lastAt, code, blocked, ...(blocked ? {} : { nextAt }) } },
      });
      if (!recorded.matchedCount) await collection.updateOne(guard, { $unset: { recovery: '' } });
      if (error.status === 429) {
        await cooldown?.pause(delay);
        return delay;
      }
    }
  }
  return 0;
}

async function drainReady(collection, client, limit = 20, cooldown) {
  const now = new Date();
  const items = await collection.find({
    status: { $in: ['pending', 'retry'] },
    nextAttemptAt: { $lte: now },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }, { projection: { _id: 1 } }).sort({ nextAttemptAt: 1, createdAt: 1, _id: 1 }).limit(limit).toArray();
  const results = [];
  for (const item of items) {
    if (await cooldown?.remaining() > 0) break;
    const result = await dispatch(collection, client, item._id);
    if (result) results.push(result);
    // Dừng batch khi Core yêu cầu giảm tải, tránh thử liên tiếp trên từng hồ sơ.
    if (result?.lastHttpStatus === 429) {
      await cooldown?.pause(Math.max(1000, +(result.rateLimitUntil ?? 0) - Date.now()));
      break;
    }
  }
  return results;
}

async function runWorker(collection, client, signal, intervalMs = 3000, cooldown, archive = false) {
  while (!signal.aborted) {
    let delay = intervalMs;
    try {
      const results = await drainReady(collection, client, 20, cooldown);
      const limited = results.find(result => result.lastHttpStatus === 429);
      if (limited?.nextAttemptAt) delay = Math.max(delay, +limited.nextAttemptAt - Date.now());
      if (!limited) {
        const recoveryDelay = await recoverCompletions(collection, client, 20, cooldown);
        delay = Math.max(delay, recoveryDelay);
        if (archive && !recoveryDelay && !(await cooldown?.remaining()))
          await publishPendingDecisions(collection, client, 10, cooldown);
      }
      delay = Math.max(delay, (await cooldown?.remaining()) ?? 0);
    } catch {
      console.error('EcoTrack connector: không đọc được hàng đợi, sẽ thử lại.');
    }
    try { await sleep(Math.min(delay, 2147483647), undefined, { signal }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}

module.exports = { drainReady, recoverCompletions, runWorker, sharedCooldown };
