// SPDX-License-Identifier: GPL-3.0-or-later
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { Connector } = require('./client');
const { hash, fail } = require('./source');
const { initOutbox, enqueueHour, complete, reconcileCompletion, summary } = require('./outbox');
const { drainReady, runWorker, sharedCooldown } = require('./worker');
const { workflowImpact } = require('./workflow-impact');
require('dotenv').config({ quiet: true });
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' && args.length === 0) return {
    commands: ['check', 'install', 'install-review', 'workflow-impact DEFINITION_ID', 'enqueue-review MONGO_HOUR_ID SENSOR_ID REASON', 'enqueue MONGO_HOUR_ID', 'drain', 'worker', 'metrics', 'status EVENT_ID',
      'complete EVENT_ID REVIEWER_ID verified|rejected', 'reconcile EVENT_ID', 'retry EVENT_ID'],
    environment: ['CORE_API_URL', 'CORE_CONNECTOR_TOKEN', 'MONGODB_URL', 'SIROCCO_DEFINITION_ID', 'SIROCCO_REVIEWER_ID'],
    guide: 'integrations/sirocco/README.md',
  };
  const counts = { check: 0, install: 0, 'install-review': 0, 'workflow-impact': 1, 'enqueue-review': 3, enqueue: 1, drain: 0, worker: 0, metrics: 0, status: 1, complete: 3, reconcile: 1, retry: 1 };
  if (!(command in counts) || args.length !== counts[command]) fail('USAGE_CHECK_INSTALL_ENQUEUE_DRAIN_STATUS_COMPLETE_RECONCILE_RETRY');
  const client = new Connector({ url: process.env.CORE_API_URL, token: process.env.CORE_CONNECTOR_TOKEN, deploy: ['install', 'install-review'].includes(command) });
  if (command === 'check') {
    const contract = await client.negotiate();
    const services = ['workflow', 'storage', 'scanner'];
    if (contract.serviceReadiness === true) {
      for (const service of services) {
        try { await client.request('/ready/' + service); }
        catch (error) { throw Object.assign(error, { service }); }
      }
    } else await client.request('/ready');
    return { status: 'ready', clientId: contract.clientId, contractVersion: contract.version, mode: 'server-integration',
      readiness: contract.serviceReadiness === true ? 'per-service' : 'aggregate', services };
  }
  if (['install', 'install-review'].includes(command)) {
    const xml = await readFile(path.join(__dirname, command === 'install' ? 'source-review.bpmn20.xml' : 'review-v2.bpmn20.xml'), 'utf8');
    const digest = hash(xml);
    const result = await client.request('/deployments', { name: 'source-review-' + digest.slice(0,32), xml }, { 'X-Core-Operation-Id': digest + '_deploy' });
    const definitionVariable = command === 'install-review' ? 'SIROCCO_REVIEW_DEFINITION_ID' : 'SIROCCO_DEFINITION_ID';
    return { definitionId: result.id, workflowSha256: digest, definitionVariable,
      next: `Quản trị Core giảm quyền bằng restrict, sau đó đặt ${definitionVariable}.` };
  }
  if (!process.env.MONGODB_URL) fail('MONGODB_URL_REQUIRED');
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 });
  try {
    if (command === 'workflow-impact') return await workflowImpact(mongoose.connection.db.collection('sirocco_outbox'),
      client, process.env.SIROCCO_REVIEW_DEFINITION_ID, args[0]);
    const collection = await initOutbox(mongoose.connection.db);
    const cooldown = sharedCooldown(mongoose.connection.db.collection('sirocco_connector_cooldowns'), client);
    if (command === 'enqueue-review') {
      if (!mongoose.isObjectIdOrHexString(args[0]) || !/^\d+$/.test(args[1])) fail('SOURCE_DOCUMENT_ID_INVALID');
      const Hour = require('../../models/hcmcAirHour.model');
      const hour = await Hour.findById(args[0]).select('+sourceRecords').lean();
      const record = hour?.sourceRecords?.find(r => r.sensorId === Number(args[1]));
      if (!record) fail('SOURCE_PROVENANCE_MISSING');
      return await require('./review-actions').enqueueReview(collection, hour, record, {
        definitionId: process.env.SIROCCO_REVIEW_DEFINITION_ID, reviewer: process.env.SIROCCO_REVIEWER_ID,
        supplementer: process.env.SIROCCO_SUPPLEMENTER_ID, ruleVersion: process.env.SIROCCO_RULE_VERSION, reason: args[2] });
    }
    if (command === 'metrics') {
      const counts = await collection.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, oldestCreatedAt: { $min: '$createdAt' },
          totalAttempts: { $sum: '$attempts' } } },
        { $sort: { _id: 1 } },
      ]).toArray();
      const errors = await collection.aggregate([
        { $match: { status: { $in: ['blocked', 'retry'] } } },
        { $group: { _id: '$lastError', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 20 },
      ]).toArray();
      return { capturedAt: new Date().toISOString(), counts, errors };
    }
    if (command === 'enqueue') {
      if (!mongoose.isObjectIdOrHexString(args[0])) fail('SOURCE_DOCUMENT_ID_INVALID');
      const Hour = require('../../models/hcmcAirHour.model');
      const hour = await Hour.findById(args[0]).select('+sourceRecords').lean();
      return await enqueueHour(collection, hour, { definitionId: process.env.SIROCCO_DEFINITION_ID, reviewer: process.env.SIROCCO_REVIEWER_ID });
    }
    if (command === 'drain') {
      const results = await drainReady(collection, client, 20, cooldown);
      if (results.some(result => ['blocked', 'retry'].includes(result.status))) process.exitCode = 2;
      return results;
    }
    if (command === 'worker') {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try { await runWorker(collection, client, controller.signal, 3000, cooldown); }
      finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
      }
      return { status: 'stopped' };
    }
    if (command === 'status') return summary(await collection.findOne({ _id: args[0] }));
    if (command === 'complete') return await complete(collection, client, ...args);
    if (command === 'reconcile') return await reconcileCompletion(collection, client, args[0]);
    if (command === 'retry') {
      const now = new Date();
      await collection.updateOne({ _id: args[0], status: { $in: ['retry', 'blocked'] },
        $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
        { $set: { status: 'pending', nextAttemptAt: new Date(0), attempts: 0, retryWindowStartedAt: new Date() } });
      await collection.updateOne({ _id: args[0], status: 'active', 'recovery.blocked': true,
        $or: [{ 'recovery.until': { $exists: false } }, { 'recovery.until': { $lte: now } }] },
        { $unset: { recovery: '' } });
      return summary(await collection.findOne({ _id: args[0] }));
    }
  } finally { await mongoose.disconnect(); }
}
main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  const code = /^[A-Z][A-Z0-9_]{0,99}$/.test(error.code || '') ? error.code : 'INTEGRATION_FAILED';
  console.error(JSON.stringify({ status: 'failed', code, ...(error.service && { service: error.service }) }));
  process.exitCode = 1;
});
