// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { Connector } = require('../integrations/sirocco/client');
const { drainReady, recoverCompletions, sharedCooldown } = require('../integrations/sirocco/worker');
const { dispatch } = require('../integrations/sirocco/outbox');
const { hash } = require('../integrations/sirocco/source');

test('lỗi ghi sau upload vẫn hẹn thử lại cho hồ sơ đã nằm chờ nhiều ngày',
  { skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL }, async () => {
    const mongoose = require('mongoose');
    const url = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/ecotrack_oidc_tests');
    const db = await mongoose.createConnection(url.href).asPromise();
    const queue = db.collection('dispatch_' + require('node:crypto').randomUUID());
    const payload = '{}';
    const checkpointFailure = new Proxy(queue, {
      get(target, key) {
        if (key === 'updateOne') return async (query, update) => {
          if (update.$set?.['steps.uploaded']) throw new mongoose.mongo.MongoNetworkError('Injected upload checkpoint failure');
          return target.updateOne(query, update);
        };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      await queue.insertOne({ _id: 'old', clientId: 'synthetic', status: 'pending', attempts: 0,
        snapshotText: payload, snapshotHash: hash(payload), steps: {},
        operations: { upload: 'saved-upload-intent' }, nextAttemptAt: new Date(0),
        createdAt: new Date(Date.now() - 3 * 86400000) });
      const uploadKeys = [];
      const client = {
        clientId: 'synthetic',
        async request(path, body, headers) {
          assert.equal(path, '/objects');
          uploadKeys.push(headers['X-Core-Operation-Id']);
          return { checksum: hash(payload), size: body.length };
        },
      };
      const result = await dispatch(checkpointFailure, client, 'old');
      assert.equal(result.status, 'retry');
      assert.equal(result.lastError, 'OUTBOX_DATABASE_UNAVAILABLE');
      assert.ok(result.nextAttemptAt > result.lastAttemptAt);
      await queue.updateOne({ _id: 'old' }, { $set: { nextAttemptAt: new Date(0) } });
      await dispatch(checkpointFailure, client, 'old');
      assert.deepEqual(uploadKeys, ['saved-upload-intent', 'saved-upload-intent']);
      await queue.updateOne({ _id: 'old' }, { $set: { attempts: 9, nextAttemptAt: new Date(0) } });
      const tenth = await dispatch(checkpointFailure, client, 'old');
      assert.equal(tenth.status, 'blocked');
      assert.equal(uploadKeys.length, 3);
      await queue.updateOne({ _id: 'old' }, { $set: { status: 'retry', nextAttemptAt: new Date(0) } });
      const eleventh = await dispatch(checkpointFailure, client, 'old');
      assert.equal(eleventh.lastError, 'OUTBOX_RETRY_BUDGET_EXHAUSTED');
      assert.equal(uploadKeys.length, 3);
    } finally {
      await queue.drop();
      await db.close();
    }
  });

test('hai worker giữ một ý định v1 khi Core đã hoàn tất nhưng ghi MongoDB lỗi',
  { skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL }, async () => {
    const mongoose = require('mongoose');
    const url = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/ecotrack_oidc_tests');
    const db = await mongoose.createConnection(url.href).asPromise();
    const name = 'recovery_' + require('node:crypto').randomUUID();
    const queue = db.collection(name);
    const decisions = new Set();
    let calls = 0;
    const client = {
      async request() { return { state: 'applied', resource: { taskId: 'task-1', processId: 'process-1' } }; },
      async workflow(input, operationId) {
        if (input.operation === 'tasks.complete') {
          calls++;
          decisions.add(operationId);
          return {};
        }
        if (input.operation === 'tasks.ended') return { data: [{ id: 'task-1', endTime: 'finished' }] };
        assert.equal(input.operation, 'processes.finished');
        return { data: [{ id: 'process-1' }] };
      },
    };
    const brokenWriter = new Proxy(queue, {
      get(target, key) {
        if (key === 'updateOne') return async (filter, update) => {
          if (update.$set?.status === 'verified') throw new mongoose.mongo.MongoNetworkError('Injected write failure');
          return target.updateOne(filter, update);
        };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      await queue.insertOne({ _id: 'review', status: 'active', createdAt: new Date(),
        recoveryReadyAt: new Date(Date.now() + 60000),
        reviewer: 'actor', steps: { processId: 'process-1' }, operations: { complete: 'same-intent' },
        completion: { taskId: 'task-1', actor: 'actor', decision: 'verified' } });
      await recoverCompletions(queue, client);
      assert.equal(calls, 0);
      await queue.updateOne({ _id: 'review' }, { $set: { recoveryReadyAt: new Date(0) } });
      await Promise.all([recoverCompletions(brokenWriter, client), recoverCompletions(brokenWriter, client)]);
      assert.equal(calls, 1);
      const waiting = await queue.findOne({ _id: 'review' });
      assert.equal(waiting.status, 'active');
      assert.equal(waiting.recovery.code, 'RECOVERY_DATABASE_UNAVAILABLE');
      assert.equal(waiting.recovery.blocked, false);
      await recoverCompletions(queue, client);
      assert.equal(calls, 1);
      await queue.updateOne({ _id: 'review' }, { $set: { 'recovery.nextAt': new Date(0) } });
      await queue.insertMany(Array.from({ length: 21 }, (_, index) => ({
        ...waiting, _id: 'new-' + index, createdAt: new Date(+waiting.createdAt + 1), recovery: undefined,
      })));
      await recoverCompletions(db.collection(name), client, 1);
      const verified = await queue.findOne({ _id: 'review' });
      assert.equal(verified.status, 'verified');
      assert.equal(verified.recovery, undefined);
      assert.deepEqual([...decisions], ['same-intent']);
      await queue.updateOne({ _id: 'review' }, { $set: { status: 'active',
        recovery: { attempts: 10, startedAt: new Date(), until: new Date(0) } } });
      await recoverCompletions(queue, client, 1);
      assert.equal(calls, 2);
      assert.equal((await queue.findOne({ _id: 'review' })).recovery.code, 'RECOVERY_BUDGET_EXHAUSTED');
    } finally {
      await queue.drop();
      await db.close();
    }
  });

test('worker mới cùng MongoDB chờ hết hạn 429 trước khi gửi hồ sơ khác',
  { skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL }, async () => {
    const mongoose = require('mongoose');
    const url = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/ecotrack_oidc_tests');
    const db = await mongoose.createConnection(url.href).asPromise();
    const suffix = require('node:crypto').randomUUID();
    const queue = db.collection('retry_queue_' + suffix);
    const state = db.collection('retry_state_' + suffix);
    const payload = '{}';
    let requests = 0;
    const server = createServer((req, res) => {
      requests++;
      res.writeHead(429, { 'Retry-After': '7' });
      res.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const options = { url: 'http://127.0.0.1:' + server.address().port + '/api/core/connector',
        token: 'synthetic-only-token'.repeat(3) };
      const first = new Connector(options);
      await queue.insertMany(['a', 'b'].map(_id => ({ _id, clientId: first.clientId, status: 'pending',
        snapshotText: payload, snapshotHash: require('../integrations/sirocco/source').hash(payload),
        steps: {}, operations: { upload: 'synthetic-upload-id' }, nextAttemptAt: new Date(0), createdAt: new Date() })));
      await drainReady(queue, first, 20, sharedCooldown(state, first));
      const next = new Connector(options);
      assert.deepEqual(await drainReady(queue, next, 20, sharedCooldown(state, next)), []);
      assert.equal(requests, 1);
      await state.updateMany({}, { $set: { resumeAt: new Date(0) } });
      await drainReady(queue, next, 20, sharedCooldown(state, next));
      assert.equal(requests, 2);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await queue.drop();
      await state.drop();
      await db.close();
    }
  });

test('connector giữ thời gian chờ của 429 và không lên lịch lại lỗi quyền', async () => {
  let status = 429;
  let retryAfter = '7';
  const server = createServer((req, res) => {
    res.writeHead(status, { 'Retry-After': retryAfter, 'Content-Type': 'application/json' });
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const connector = new Connector({
      url: 'http://127.0.0.1:' + server.address().port + '/api/core/connector',
      token: 'synthetic-only-token'.repeat(3),
    });
    await assert.rejects(connector.send('/ready'), error =>
      error.status === 429 && error.retryable && error.retryAfterMs === 7000);
    retryAfter = new Date(Date.now() + 10000).toUTCString();
    await assert.rejects(connector.send('/ready'), error => error.retryAfterMs > 0 && error.retryAfterMs <= 10000);
    retryAfter = 'invalid delay';
    await assert.rejects(connector.send('/ready'), error => error.retryAfterMs === 0);
    status = 401;
    await assert.rejects(connector.send('/ready'), error =>
      error.status === 401 && !error.retryable);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
