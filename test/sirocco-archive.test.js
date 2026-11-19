// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { publishDecision, publishPendingDecisions } = require('../integrations/sirocco/decision-archive');

test('một hồ sơ lùi lịch không chặn các hồ sơ đến hạn của cùng nguồn',
  { skip: !process.env.SIROCCO_OIDC_TEST_DATABASE_URL }, async () => {
    const mongoose = require('mongoose');
    const url = new URL(process.env.SIROCCO_OIDC_TEST_DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    assert.equal(url.pathname, '/ecotrack_oidc_tests');
    const db = await mongoose.createConnection(url.href).asPromise();
    const queue = db.collection('archive_test_' + randomUUID());
    const sourceKey = 'a'.repeat(64);
    const otherSource = 'b'.repeat(64);
    const versions = new Map();
    const client = {
      async request(path, body) {
        const recordKey = path.split('/').at(-1);
        const version = versions.get(recordKey) ?? 0;
        if (!body) return { version };
        assert.equal(body.expectedVersion, version);
        versions.set(recordKey, version + 1);
        return { recordKey, version: version + 1, schemaVersion: body.schemaVersion,
          data: body.data, evidence: body.evidence, recordedAt: new Date().toISOString() };
      },
    };
    const row = (id, key, nextAt) => ({
      _id: id, sourceKey: key, decisionArchive: { status: 'pending', attempts: 0, nextAt,
        closedAt: new Date(id === 'delayed' ? 0 : 1).toISOString(),
        operationId: randomUUID(), body: { schemaVersion: 1, data: { id }, evidence: {} } },
    });
    try {
      await queue.insertMany([
        row('delayed', sourceKey, new Date(Date.now() + 60000)),
        ...Array.from({ length: 10 }, (_, index) => row('same-' + index, sourceKey, new Date(0))),
        row('unrelated', otherSource, new Date(0)),
      ]);
      await publishPendingDecisions(queue, client, 10);
      await publishPendingDecisions(queue, client, 10);
      assert.equal(await queue.countDocuments({ 'decisionArchive.status': 'archived' }), 11);
      assert.equal((await queue.findOne({ _id: 'delayed' })).decisionArchive.status, 'pending');
      await queue.updateOne({ _id: 'delayed' }, { $set: { 'decisionArchive.nextAt': new Date(0) } });
      await publishPendingDecisions(queue, client, 10);
      assert.equal((await queue.findOne({ _id: 'delayed' })).decisionArchive.version, 11);

      await queue.insertOne(row('last-attempt', otherSource, new Date(0)));
      const lastResponse = { async request(path, body) {
        const result = await client.request(path, body);
        if (body) await queue.updateOne({ _id: 'last-attempt' },
          { $set: { 'decisionArchive.status': 'blocked', 'decisionArchive.code': 'CONNECTOR_TIMEOUT' } });
        return result;
      } };
      await publishDecision(queue, lastResponse, 'last-attempt');
      const confirmed = (await queue.findOne({ _id: 'last-attempt' })).decisionArchive;
      assert.equal(confirmed.status, 'archived');
      assert.equal(confirmed.version, 2);
      assert.equal(confirmed.code, undefined);
    } finally {
      try { await queue.drop(); } finally { await db.close(); }
    }
  });
