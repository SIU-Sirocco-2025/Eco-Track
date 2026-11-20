// SPDX-License-Identifier: GPL-3.0-or-later
const { hash, fail } = require('./source');
const { exportCaseEvidence, verifyCaseEvidence } = require('./case-evidence');

const collectionName = 'observation-decisions';
const sha256 = /^[a-f0-9]{64}$/;
const schema = {
  version: 1,
  requireEvidence: true,
  fields: Object.fromEntries(Object.entries({
    caseId: 'string', sourceRevision: 'string', value: 'number', unit: 'string',
    ruleVersion: 'string', decision: 'string', closedAt: 'timestamp',
  }).map(([name, type]) => [name, { type, required: true }])),
};

function archiveIntent(item, action, closedAt) {
  const source = JSON.parse(item.snapshotText);
  const applied = Object.values({ ...item.actions, [action.taskId]: { ...action, appliedAt: closedAt } })
    .filter(entry => entry.appliedAt);
  if (!item.steps.receipt?.id || applied.length > 31 || applied.some(entry => !entry.evidence?.receiptId))
    return { status: 'blocked', attempts: 0, code: 'ARCHIVE_REFERENCES_MISSING' };
  const files = applied
    .map(entry => ({
      key: entry.evidence.objectKey, receiptId: entry.evidence.receiptId, sha256: entry.evidence.checksum,
    }));
  files.push({ key: item.objectKey, receiptId: item.steps.receipt.id, sha256: item.snapshotHash });
  files.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    status: 'pending', attempts: 0, nextAt: new Date(closedAt),
    operationId: hash({ archive: collectionName, caseId: item._id }) + '_archive',
    body: {
      schemaVersion: schema.version,
      data: { caseId: item._id, sourceRevision: item.revision, value: source.value, unit: source.unit,
        ruleVersion: item.ruleVersion, decision: action.action, closedAt },
      evidence: { completionOperationId: action.operationId, processId: item.steps.processId,
        taskId: action.taskId, files },
    },
  };
}

const recordPath = sourceKey => '/records/' + collectionName + '/' + sourceKey;

async function publishDecision(queue, client, id) {
  let item = await queue.findOne({ _id: id, 'decisionArchive.status': 'pending' });
  if (!item) return;
  const path = recordPath(item.sourceKey);
  const guard = { _id: id, 'decisionArchive.status': 'pending', 'decisionArchive.operationId': item.decisionArchive.operationId };
  if (item.decisionArchive.expectedVersion === undefined) {
    let head = 0;
    try { head = (await client.request(path)).version; }
    catch (error) { if (error.status !== 404 || error.code !== 'RECORD_NOT_FOUND') throw error; }
    await queue.updateOne({ ...guard, 'decisionArchive.expectedVersion': { $exists: false } },
      { $set: { 'decisionArchive.expectedVersion': head } });
    item = await queue.findOne(guard);
    if (!item) return;
  }
  const archive = item.decisionArchive;
  if (archive.expectedVersion === undefined) return;
  const attempt = { ...guard, 'decisionArchive.expectedVersion': archive.expectedVersion };
  let record;
  try {
    record = await client.request(path, { ...archive.body, expectedVersion: archive.expectedVersion },
      { 'X-Core-Operation-Id': archive.operationId });
  } catch (error) {
    if (error.status === 412 && error.code === 'RECORD_VERSION_CHANGED') {
      await queue.updateOne(attempt, { $unset: { 'decisionArchive.expectedVersion': '' } });
    }
    throw error;
  }
  if (record.recordKey !== item.sourceKey || record.version !== archive.expectedVersion + 1 ||
      record.schemaVersion !== archive.body.schemaVersion || hash(record.data) !== hash(archive.body.data) ||
      hash(record.evidence) !== hash(archive.body.evidence)) fail('ARCHIVE_RECEIPT_INVALID');
  // Một worker khác có thể đã hết lượt thử trong khi phản hồi thành công đang về.
  await queue.updateOne({ ...attempt, 'decisionArchive.status': { $in: ['pending', 'blocked'] } }, {
    $set: { 'decisionArchive.status': 'archived', 'decisionArchive.version': record.version,
      'decisionArchive.recordedAt': record.recordedAt },
    $unset: { 'decisionArchive.code': '', 'decisionArchive.nextAt': '' },
  });
  return record;
}

async function publishPendingDecisions(queue, client, limit = 10, cooldown) {
  const due = await queue.find({
    'decisionArchive.status': 'pending', 'decisionArchive.nextAt': { $lte: new Date() },
  }, { projection: { decisionArchive: 1 } }).sort({ 'decisionArchive.nextAt': 1, _id: 1 }).limit(limit).toArray();
  for (const item of due) {
    if (await cooldown?.remaining() > 0) break;
    try { await publishDecision(queue, client, item._id); }
    catch (error) {
      const attempts = item.decisionArchive.attempts + 1;
      const wait = Math.max(error.retryAfterMs || 0, 1000 * 2 ** Math.min(attempts, 9));
      const retry = (error.retryable || error.code === 'RECORD_VERSION_CHANGED' ||
        ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError'].includes(error.name)) && attempts < 20;
      const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '') ? error.code : 'ARCHIVE_WRITE_FAILED';
      await queue.updateOne({ _id: item._id, 'decisionArchive.status': 'pending',
        'decisionArchive.attempts': item.decisionArchive.attempts }, {
        $set: { 'decisionArchive.status': retry ? 'pending' : 'blocked',
          'decisionArchive.attempts': attempts, 'decisionArchive.code': code,
          'decisionArchive.nextAt': retry ? new Date(Date.now() + wait) : null },
      });
      if (error.status === 429) {
        await cooldown?.pause(wait);
        break;
      }
    }
  }
}

async function readDecisionHistory(client, sourceKey, before) {
  if (typeof sourceKey !== 'string' || !sha256.test(sourceKey) ||
      (before !== undefined && (!Number.isInteger(before) || before < 1))) fail('ARCHIVE_SOURCE_KEY_INVALID');
  const page = await client.request(recordPath(sourceKey) + '/history' + (before === undefined ? '' : '?before=' + before));
  return { sourceKey, scope: 'core-committed-versions', ...page };
}

async function exportArchivedDecision(client, sourceKey, version) {
  if (typeof sourceKey !== 'string' || !sha256.test(sourceKey) || !Number.isInteger(version) || version < 1)
    fail('ARCHIVE_SOURCE_KEY_INVALID');
  const record = await client.request(recordPath(sourceKey) + '/versions/' + version);
  const { caseId, sourceRevision, decision } = record.data;
  if (record.recordKey !== sourceKey || record.version !== version || !sha256.test(caseId) ||
      !sha256.test(sourceRevision) || !record.evidence?.files?.length) fail('ARCHIVE_RECEIPT_INVALID');
  const objectKey = `observations/${caseId}.json`;
  const source = record.evidence.files.find(file => file.key === objectKey);
  if (!source) fail('ARCHIVE_RECEIPT_INVALID');
  const actions = {};
  const prefix = `reviews/${caseId}/`;
  const finalTask = record.evidence.taskId;
  for (const file of record.evidence.files) {
    if (file === source) continue;
    const taskId = file.key.slice(prefix.length, -5);
    if (!file.key.startsWith(prefix) || !file.key.endsWith('.json') ||
        !/^[a-zA-Z0-9-][a-zA-Z0-9_-]{0,119}$/.test(taskId) || taskId === 'constructor') fail('ARCHIVE_RECEIPT_INVALID');
    actions[taskId] = { appliedAt: record.data.closedAt, action: taskId === finalTask ? decision : undefined,
      evidence: { objectKey: file.key, checksum: file.sha256 } };
  }
  if (!Object.hasOwn(actions, finalTask)) fail('ARCHIVE_RECEIPT_INVALID');
  const bundle = await exportCaseEvidence({ _id: caseId, revision: sourceRevision, objectKey,
    snapshotHash: source.sha256, reviewVersion: 2, result: { decision }, actions }, client);
  verifyArchivedDecision({ record, bundle });
  return { record, bundle };
}

function verifyArchivedDecision(exported) {
  const { record, bundle } = exported ?? {};
  const verified = verifyCaseEvidence(bundle);
  const { data, evidence } = record ?? {};
  if (data?.caseId !== verified.caseId || data.sourceRevision !== verified.revision ||
      verified.scope !== 'source-and-actions' || !['verified', 'rejected'].includes(verified.decision) ||
      data.decision !== verified.decision || !Number.isSafeInteger(record.version) || record.version < 1 ||
      !Number.isFinite(Date.parse(data.closedAt)) || !Number.isFinite(Date.parse(record.recordedAt)) ||
      !Array.isArray(evidence?.files) || evidence.files.length !== verified.entries)
    fail('ARCHIVE_RECEIPT_INVALID');
  const sourceKey = `observations/${verified.caseId}.json`;
  const expected = new Map(bundle.manifest.entries.map(entry => [
    entry.path === 'source.json' ? sourceKey : `reviews/${verified.caseId}/${entry.path.slice('actions/'.length)}`,
    entry.sha256,
  ]));
  for (const file of evidence.files) {
    if (!file || !expected.has(file.key) || expected.get(file.key) !== file.sha256 ||
        typeof file.receiptId !== 'string' || !file.receiptId) fail('ARCHIVE_RECEIPT_INVALID');
    expected.delete(file.key);
  }
  const source = JSON.parse(Buffer.from(bundle.content['source.json'], 'base64'));
  const terminalBytes = bundle.content[`actions/${evidence.taskId}.json`];
  const terminal = terminalBytes && JSON.parse(Buffer.from(terminalBytes, 'base64'));
  if (source.sourceKey !== record.recordKey || source.value !== data.value || source.unit !== data.unit ||
      terminal?.action !== data.decision) fail('ARCHIVE_RECEIPT_INVALID');
  return { ...verified, sourceKey: record.recordKey, version: record.version, closedAt: data.closedAt,
    recordedAt: record.recordedAt, source: { provider: source.provider, mode: source.mode, sensorId: source.sensorId,
      parameter: source.parameter, from: source.from, to: source.to, value: source.value, unit: source.unit } };
}

async function compareArchivedDecisions(client, sourceKey, versionA, versionB) {
  if (!Number.isSafeInteger(versionA) || !Number.isSafeInteger(versionB) ||
      versionA < 1 || versionB < 1 || versionA === versionB)
    fail('ARCHIVE_VERSION_INVALID');
  const versions = await Promise.all([versionA, versionB].map(version => exportArchivedDecision(client, sourceKey, version)));
  const entries = versions.map(({ record, bundle }) => {
    const action = JSON.parse(Buffer.from(bundle.content[`actions/${record.evidence.taskId}.json`], 'base64'));
    if (!Number.isFinite(Date.parse(record.data.closedAt)) || !Number.isFinite(Date.parse(record.recordedAt)))
      fail('ARCHIVE_RECEIPT_INVALID');
    return { ...record.data, version: record.version, recordedAt: record.recordedAt,
      reason: action.reason, manifestSha256: bundle.manifestSha256 };
  });
  const [first, second] = entries;
  if (first.caseId === second.caseId || first.sourceRevision === second.sourceRevision)
    fail('ARCHIVE_DUPLICATE_SOURCE_REVISION');
  const closeDelta = Date.parse(second.closedAt) - Date.parse(first.closedAt);
  const comparableUnit = first.unit === second.unit;
  return { sourceKey, scope: 'selected-core-committed-versions', entries,
    closeOrder: closeDelta === 0 ? 'tie' : closeDelta > 0 ? 'a-before-b' : 'b-before-a',
    sourceOrder: 'unknown', comparableUnit, valueDelta: comparableUnit ? second.value - first.value : null };
}

module.exports = { collectionName, schema, archiveIntent, publishDecision, publishPendingDecisions,
  readDecisionHistory, exportArchivedDecision, verifyArchivedDecision, compareArchivedDecisions };
