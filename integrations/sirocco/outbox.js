// SPDX-License-Identifier: GPL-3.0-or-later
const { randomUUID } = require('node:crypto');
const { encode, hash, observation, fail } = require('./source');
const { ConnectorError } = require('./client');
const manifest = require('./manifest.json');
const identifier = /^[a-zA-Z0-9_.:-]{1,200}$/;

function intentFor(hour, record, { definitionId, reviewer }) {
  if (!identifier.test(definitionId || '') || !identifier.test(reviewer || '')) fail('OUTBOX_CONFIGURATION');
  const { sourceKey, revision, snapshot } = observation(record, hour);
  const id = hash({ clientId: manifest.id, sourceKey, revision });
  const snapshotText = encode(snapshot), snapshotHash = hash(snapshotText);
  const objectKey = `observations/${id}.json`;
  return {
    _id: id, clientId: manifest.id, sourceKey, revision,
    configurationHash: hash({ definitionId, reviewer }),
    snapshotText, snapshotHash, objectKey, definitionId, reviewer,
    businessKey: `eco-${id}`,
    operations: Object.fromEntries(['upload', 'promote', 'start', 'complete'].map(step => [step, `${id}_${step}`])),
    variables: { reviewer, sourceKey, sourceRevision: revision, sensorId: String(snapshot.sensorId),
      sourceMode: snapshot.mode, parameter: snapshot.parameter, value: String(snapshot.value), unit: snapshot.unit,
      windowFrom: snapshot.from, windowTo: snapshot.to, evidenceKey: objectKey, evidenceSha256: snapshotHash },
    status: 'pending', steps: {}, attempts: 0, nextAttemptAt: new Date(0), createdAt: new Date(),
  };
}
async function initOutbox(db) {
  const collection = db.collection('sirocco_outbox');
  await collection.createIndex({ sourceKey: 1, revision: 1 }, { unique: true });
  await collection.createIndex({ status: 1, nextAttemptAt: 1 });
  return collection;
}
async function enqueueHour(collection, hour, config) {
  if (!hour || !Array.isArray(hour.sourceRecords) || !hour.sourceRecords.length) fail('SOURCE_PROVENANCE_MISSING');
  // Kiểm toàn bộ giờ trước khi thêm intent; mỗi revision có khóa duy nhất khi ghi.
  const intents = hour.sourceRecords.map(record => intentFor(hour, record, config));
  const results = [];
  for (const intent of intents) {
    try { await collection.insertOne(intent); }
    catch (error) { if (error.code !== 11000) throw error; }
    const saved = await collection.findOne({ _id: intent._id });
    if (!saved || saved.configurationHash !== intent.configurationHash) fail('OUTBOX_CONFIGURATION_CONFLICT');
    results.push(summary(saved));
  }
  return results;
}
function summary(item) {
  if (!item) return null;
  return { id: item._id, sourceKey: item.sourceKey, revision: item.revision, status: item.status,
    lastHttpStatus: item.lastHttpStatus, lastAttemptAt: item.lastAttemptAt, nextAttemptAt: item.nextAttemptAt,
    rateLimitUntil: item.rateLimitUntil,
    recovery: item.recovery && { lastAt: item.recovery.lastAt, nextAt: item.recovery.nextAt,
      attempts: item.recovery.attempts, blocked: item.recovery.blocked, code: item.recovery.code },
    processId: item.steps.processId, objectKey: item.objectKey, snapshotHash: item.snapshotHash,
    receipt: item.steps.receipt, attempts: item.attempts, lastError: item.lastError,
    completion: item.completion, result: item.result };
}
function verifyReceipt(receipt, item) {
  if (receipt?.clientId !== item.clientId || receipt.objectKey !== item.objectKey || receipt.checksum !== item.snapshotHash ||
      receipt.objectVersion !== item.snapshotHash || receipt.size !== Buffer.byteLength(item.snapshotText) ||
      typeof receipt.id !== 'string' || !receipt.id || typeof receipt.scanVersion !== 'string' || !receipt.scanVersion ||
      !Number.isFinite(Date.parse(receipt.scannedAt))) fail('CONNECTOR_RECEIPT_INVALID');
}
async function dispatch(collection, client, id, now = new Date()) {
  const leaseId = randomUUID();
  const item = await collection.findOneAndUpdate({
    _id: id, status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now },
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }, { $set: { leaseId, leaseUntil: new Date(now.getTime() + 300000) }, $inc: { attempts: 1 } }, { returnDocument: 'after' });
  if (!item) return summary(await collection.findOne({ _id: id }));
  async function checkpoint(patch) {
    const result = await collection.updateOne({ _id: id, leaseId }, { $set: patch });
    if (!result.matchedCount) throw new ConnectorError('OUTBOX_LEASE_LOST', undefined, true);
  }
  try {
    if (item.attempts > 10 || (item.retryWindowStartedAt && +now >= +item.retryWindowStartedAt + 86400000))
      fail('OUTBOX_RETRY_BUDGET_EXHAUSTED');
    if (client.clientId !== item.clientId) fail('CONNECTOR_CLIENT_MISMATCH');
    const bytes = Buffer.from(item.snapshotText);
    if (hash(item.snapshotText) !== item.snapshotHash) fail('OUTBOX_PAYLOAD_CORRUPT');
    if (!item.steps.uploaded) {
      const upload = await client.request('/objects', bytes, { 'X-Core-Object': item.objectKey, 'X-Core-Operation-Id': item.operations.upload });
      if (upload.checksum !== item.snapshotHash || upload.size !== bytes.length) fail('CONNECTOR_UPLOAD_INVALID');
      await checkpoint({ 'steps.uploaded': true });
    }
    if (!item.steps.receipt) {
      const receipt = await client.request('/objects/promote', bytes, { 'X-Core-Object': item.objectKey, 'X-Core-Operation-Id': item.operations.promote });
      verifyReceipt(receipt, item);
      await checkpoint({ 'steps.receipt': receipt });
    } else verifyReceipt(item.steps.receipt, item);
    const downloaded = await client.request('/objects', undefined, { 'X-Core-Object': item.objectKey, 'X-Core-Clean': 'true' }, true);
    if (!downloaded.equals(bytes)) fail('CONNECTOR_DOWNLOAD_INVALID');
    let processId = item.steps.processId;
    if (!processId) {
      const process = await client.workflow({ operation: 'processes.start', definitionId: item.definitionId,
        businessKey: item.businessKey, variables: item.variables }, item.operations.start);
      if (!identifier.test(process?.id || '')) fail('CONNECTOR_PROCESS_INVALID');
      processId = process.id;
      await checkpoint({ 'steps.processId': processId });
    }
    await checkpoint({ status: 'active', lastError: null, lastHttpStatus: null, rateLimitUntil: null, lastAttemptAt: new Date() });
  } catch (error) {
    const mongoUnavailable = ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError'].includes(error.name);
    const code = mongoUnavailable ? 'OUTBOX_DATABASE_UNAVAILABLE' :
      /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '') ? error.code : 'OUTBOX_UNEXPECTED_ERROR';
    const failedAt = Date.now();
    const backoff = Math.min(900000, 1000 * 2 ** Math.min(item.attempts, 9));
    const delay = Math.max(error.retryAfterMs || 0, Math.floor(backoff * (1 + Math.random() / 4)));
    const nextAttempt = failedAt + delay;
    const retryWindowStartedAt = item.retryWindowStartedAt ?? new Date(failedAt);
    const retry = (mongoUnavailable || error.retryable) && item.attempts < 10 &&
      nextAttempt <= +retryWindowStartedAt + 86400000;
    await collection.updateOne({ _id: id, leaseId }, { $set: {
      status: retry ? 'retry' : 'blocked', lastError: code,
      retryWindowStartedAt,
      lastHttpStatus: error.status ?? null, lastAttemptAt: new Date(failedAt), nextAttemptAt: retry ? new Date(nextAttempt) : null,
      rateLimitUntil: error.status === 429 ? new Date(nextAttempt) : null,
    } });
  } finally {
    await collection.updateOne({ _id: id, leaseId }, { $unset: { leaseId: '', leaseUntil: '' } });
  }
  return summary(await collection.findOne({ _id: id }));
}
async function reconcileCompletion(collection, client, id) {
  const item = await collection.findOne({ _id: id });
  if (!item?.completion || !item.steps.processId) fail('OUTBOX_COMPLETION_MISSING');
  const journal = await client.request('/operations/' + item.operations.complete);
  const ended = await client.workflow({ operation: 'tasks.ended', processId: item.steps.processId, taskId: item.completion.taskId });
  const finished = await client.workflow({ operation: 'processes.finished', processId: item.steps.processId });
  if (journal.state !== 'applied' || journal.resource?.taskId !== item.completion.taskId ||
      journal.resource?.processId !== item.steps.processId ||
      !ended.data?.some(t => t.id === item.completion.taskId && t.endTime && !t.deleteReason) ||
      !finished.data?.some(p => p.id === item.steps.processId)) fail('OUTBOX_COMPLETION_UNCONFIRMED');
  await collection.updateOne({ _id: id, 'completion.taskId': item.completion.taskId }, { $set: {
    status: item.completion.decision, result: { decision: item.completion.decision, reportedActor: item.completion.actor,
      processId: item.steps.processId, taskId: item.completion.taskId, reconciledAt: new Date().toISOString() },
  }, $unset: { recovery: '' } });
  return summary(await collection.findOne({ _id: id }));
}
async function complete(collection, client, id, actor, decision) {
  let item = await collection.findOne({ _id: id });
  if (!item || !['active', 'verified', 'rejected'].includes(item.status) || !item.steps.processId) fail('OUTBOX_NOT_ACTIVE');
  if (actor !== item.reviewer || !['verified', 'rejected'].includes(decision)) fail('OUTBOX_REVIEWER_INVALID');
  if (!item.completion) {
    const tasks = await client.workflow({ operation: 'tasks.list', processId: item.steps.processId });
    if (tasks.data?.length !== 1 || tasks.data[0].taskDefinitionKey !== 'review' || tasks.data[0].assignee !== actor) fail('OUTBOX_TASK_CONFLICT');
    const completion = { taskId: tasks.data[0].id, actor, decision };
    await collection.updateOne({ _id: id, completion: { $exists: false } }, { $set: { completion } });
    item = await collection.findOne({ _id: id });
  }
  if (item.completion.actor !== actor || item.completion.decision !== decision) fail('OUTBOX_COMPLETION_CONFLICT');
  await client.workflow({ operation: 'tasks.complete', taskId: item.completion.taskId,
    variables: { sourceVerified: decision === 'verified', reportedReviewer: actor } }, item.operations.complete);
  return reconcileCompletion(collection, client, id);
}
module.exports = { intentFor, initOutbox, enqueueHour, dispatch, complete, reconcileCompletion, summary };
