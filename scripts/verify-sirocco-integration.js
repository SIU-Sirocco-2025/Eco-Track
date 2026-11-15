// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { cleanRecord, aggregateByHour } = require('../services/openaqRecords');
const { Connector, ConnectorError } = require('../integrations/sirocco/client');
const { initOutbox, enqueueHour, dispatch, complete, summary } = require('../integrations/sirocco/outbox');

async function main() {
  assert.equal(process.env.SIROCCO_INTEGRATION_TEST, 'local-synthetic');
  const target = new URL(process.env.MONGODB_URL), core = new URL(process.env.CORE_API_URL);
  assert.equal(target.pathname, '/ecotrack_sirocco_tests');
  for (const url of [target, core]) assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.ok(process.env.CORE_OTHER_TOKEN);
  assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--output'));
  await mongoose.connect(process.env.MONGODB_URL);
  const passed = [], reports = [];
  const client = new Connector({ url: process.env.CORE_API_URL, token: process.env.CORE_CONNECTOR_TOKEN });
  const other = new Connector({ url: process.env.CORE_API_URL, token: process.env.CORE_OTHER_TOKEN, clientId: 'ecotrack-probe' });
  const config = { definitionId: process.env.SIROCCO_DEFINITION_ID, reviewer: 'synthetic-reviewer' };
  const collection = await initOutbox(mongoose.connection.db);
  const Hour = require('../models/hcmcAirHour.model');
  function source(sensorId) {
    const raw = { value: 12.5, parameter: { name: 'pm25', units: 'µg/m³' },
      period: { datetimeFrom: { utc: '2025-11-20T00:00:00Z' }, datetimeTo: { utc: '2025-11-20T01:00:00Z' } } };
    return { sensorId, raw, cleaned: cleanRecord(raw), provider: 'openaq', mode: 'synthetic', collectedAt: '2025-11-20T01:02:00Z' };
  }
  try {
    await client.negotiate(); await client.request('/ready');
    const gateway = await fetch(process.env.CORE_API_URL + '/contract', { headers: {
      Authorization: 'Bearer ' + process.env.CORE_CONNECTOR_TOKEN, 'X-Core-Contract-Version': '2.0' } });
    assert.equal(gateway.headers.get('x-sirocco-gateway'), 'APISIX');
    passed.push('gateway-and-real-dependencies');
    const sensor = randomInt(100000000, 900000000);
    const [input] = aggregateByHour([source(sensor), source(sensor + 1)]);
    // Mỗi lượt có cửa sổ riêng, không ghi đè dữ liệu của lượt diễn tập trước.
    const offsetHours = randomInt(1, 100000);
    for (const record of input.sourceRecords) {
      record.raw.period.datetimeFrom.utc = new Date(Date.parse(input.from) + offsetHours * 3600000).toISOString();
      record.raw.period.datetimeTo.utc = new Date(Date.parse(input.to) + offsetHours * 3600000).toISOString();
      record.collectedAt = new Date(Date.parse(record.raw.period.datetimeTo.utc) + 120000).toISOString();
    }
    const [seed] = aggregateByHour(input.sourceRecords.map(r => ({ ...r, cleaned: cleanRecord(r.raw) })));
    const saved = await Hour.create(seed);
    const hour = await Hour.findById(saved._id).select('+sourceRecords +raw').lean();
    assert.equal(hour.sourceRecords.length, 2);
    assert.equal(hour.raw.length, 2);
    const [a,b] = await Promise.all([enqueueHour(collection, hour, config), enqueueHour(collection, hour, config)]);
    assert.deepEqual(a.map(x=>x.id), b.map(x=>x.id));
    assert.equal(await collection.countDocuments({ _id: { $in: a.map(x=>x.id) } }), 2);
    passed.push('collector-model-mongo-provenance', 'concurrent-enqueue-idempotence');
    const id = a[0].id, interruptedId = a[1].id;
    await Promise.all([dispatch(collection, client, id), dispatch(collection, client, id)]);
    let item = await collection.findOne({ _id: id });
    assert.equal(item.status, 'active', item.lastError);
    assert.equal(item.attempts, 1);
    assert.equal((await client.workflow({ operation: 'processes.find', businessKey: item.businessKey })).data.length, 1);
    assert.equal(item.steps.receipt.clientId, 'ecotrack-2025');
    assert.match(item.steps.receipt.scanVersion, /ClamAV/i);
    passed.push('atomic-worker-lease', 'real-upload-scan-download-start');
    await assert.rejects(new Connector({ url: process.env.CORE_API_URL, token: process.env.CORE_OTHER_TOKEN }).negotiate(), { code: 'CONNECTOR_CLIENT_MISMATCH' });
    await assert.rejects(other.workflow({ operation: 'tasks.list', processId: item.steps.processId }), e=>e.status === 404);
    await assert.rejects(other.request('/objects', undefined, { 'X-Core-Object': item.objectKey }, true), e=>e.status === 404);
    const tasks = await client.workflow({ operation: 'tasks.list', processId: item.steps.processId });
    await assert.rejects(other.workflow({ operation: 'tasks.complete', taskId: tasks.data[0].id, variables: {} }, 'probe_' + randomUUID()), e=>e.status === 404);
    await assert.rejects(client.request('/deployments', { name: 'forbidden', xml: '<invalid/>' }, { 'X-Core-Operation-Id': 'forbidden_' + randomUUID() }), e=>e.status === 403);
    await assert.rejects(client.workflow({ operation: 'processes.start', definitionId: item.definitionId,
      businessKey: item.businessKey, variables: { ...item.variables, value: '999' } }, item.operations.start), e=>e.status === 409);
    passed.push('wrong-client-blocked', 'cross-client-process-task-file-denied', 'runtime-deploy-denied', 'operation-payload-conflict');
    const done = await complete(collection, client, id, config.reviewer, 'verified');
    assert.equal(done.status, 'verified');
    assert.equal((await complete(collection, client, id, config.reviewer, 'verified')).processId, done.processId);
    await assert.rejects(complete(collection, client, id, config.reviewer, 'rejected'), { code: 'OUTBOX_COMPLETION_CONFLICT' });
    reports.push(done);
    passed.push('completion-journal-history-and-return-to-mongo');
    let actualProcess;
    const lostResponseClient = {
      clientId: client.clientId,
      request: (...args) => client.request(...args),
      workflow: async (...args) => {
        const result = await client.workflow(...args);
        if (args[0].operation === 'processes.start') {
          actualProcess = result.id;
          throw new ConnectorError('CONNECTOR_UNAVAILABLE', undefined, true);
        }
        return result;
      },
    };
    const interrupted = await dispatch(collection, lostResponseClient, interruptedId);
    assert.equal(interrupted.status, 'retry');
    assert.ok(interrupted.receipt);
    assert.equal(interrupted.processId, undefined);
    await collection.updateOne({ _id: interruptedId }, { $set: { nextAttemptAt: new Date(0) } });
    const child = spawnSync(process.execPath, [path.join(__dirname, '../integrations/sirocco/cli.js'), 'drain'], {
      env: process.env, encoding: 'utf8', windowsHide: true, timeout: 180000,
    });
    assert.equal(child.status, 0, child.stderr);
    item = await collection.findOne({ _id: interruptedId });
    assert.equal(item.status, 'active', item.lastError);
    assert.equal(item.steps.processId, actualProcess);
    assert.equal((await client.workflow({ operation: 'processes.find', businessKey: item.businessKey })).data.length, 1);
    reports.push(await complete(collection, client, interruptedId, config.reviewer, 'rejected'));
    passed.push('lost-start-response-recovered-by-new-node-process');
    const originalSnapshot = (await collection.findOne({ _id: id })).snapshotText;
    await Hour.updateOne({ _id: hour._id }, { $set: { 'sourceRecords.0.raw.value': 13.5, 'raw.0.value': 13.5, 'measurements.pm25.value': 13.5 } });
    const revisedHour = await Hour.findById(hour._id).select('+sourceRecords').lean();
    revisedHour.sourceRecords = [revisedHour.sourceRecords[0]];
    const [revision] = await enqueueHour(collection, revisedHour, config);
    assert.notEqual(revision.id, id); assert.equal(revision.sourceKey, done.sourceKey);
    const refused = await dispatch(collection, {
      clientId: client.clientId, workflow: (...args) => client.workflow(...args),
      request: async (...args) => {
        if (args[0] === '/objects/promote') throw new ConnectorError('FILE_NOT_CLEAN', 409);
        return client.request(...args);
      },
    }, revision.id);
    assert.equal(refused.status, 'blocked'); assert.equal(refused.processId, undefined);
    const blocked = await collection.findOne({ _id: revision.id });
    assert.equal((await client.workflow({ operation: 'processes.find', businessKey: blocked.businessKey })).data.length, 0);
    await collection.updateOne({ _id: revision.id }, { $set: { status: 'pending', nextAttemptAt: new Date(0),
      leaseId: 'synthetic-dead-worker', leaseUntil: new Date(0) } });
    const revised = await dispatch(collection, client, revision.id);
    assert.equal(revised.status, 'active'); assert.notEqual(revised.processId, done.processId);
    passed.push('injected-scan-rejection-blocks-process', 'expired-worker-lease-recovered');
    await assert.rejects(complete(collection, {
      clientId: client.clientId, request: (...args) => client.request(...args),
      workflow: async (...args) => {
        const result = await client.workflow(...args);
        if (args[0].operation === 'tasks.complete') throw new ConnectorError('CONNECTOR_UNAVAILABLE', undefined, true);
        return result;
      },
    }, revision.id, config.reviewer, 'verified'), { code: 'CONNECTOR_UNAVAILABLE' });
    const completeChild = spawnSync(process.execPath, [path.join(__dirname, '../integrations/sirocco/cli.js'), 'complete', revision.id, config.reviewer, 'verified'], {
      env: process.env, encoding: 'utf8', windowsHide: true, timeout: 180000,
    });
    assert.equal(completeChild.status, 0, completeChild.stderr);
    reports.push(summary(await collection.findOne({ _id: revision.id })));
    assert.equal(reports.at(-1).status, 'verified');
    passed.push('lost-completion-response-recovered-by-new-node-process');
    assert.equal((await collection.findOne({ _id: id })).snapshotText, originalSnapshot);
    await assert.rejects(enqueueHour(collection, { ...hour, sourceRecords: [] }, config), { code: 'SOURCE_PROVENANCE_MISSING' });
    passed.push('source-revision-keeps-separate-process', 'legacy-without-provenance-rejected');
    const result = { status: 'passed', dataMode: 'synthetic', checks: passed, records: reports,
      limitations: ['Chưa lấy OpenAQ live.', 'Mất response và scanner từ chối được tiêm tại adapter; đường thành công dùng Core và ClamAV thật, CLI retry chạy trong process Node mới.',
        'CLI complete là thao tác vận hành kỹ thuật với actor khai báo, chưa phải SSO/UI người dùng.', 'Không thay đổi SchoolOps.'], completedAt: new Date().toISOString() };
    if (process.argv.length === 4) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: result.status, checks: passed, processes: reports.map(r=>r.processId) }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
