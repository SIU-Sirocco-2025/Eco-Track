// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { exportCaseEvidence, verifyCaseEvidence } = require('../integrations/sirocco/case-evidence');
const { verifyArchivedDecision, verifyDecisionHistory, historyFormat } = require('../integrations/sirocco/decision-archive');
const { caseTimeline } = require('../integrations/sirocco/case-timeline');
const { hash, encode } = require('../integrations/sirocco/source');

test('gói chứng cứ khớp phiên bản và không chấp nhận sửa byte, thiếu tệp hoặc mã neo sai', async () => {
  const identity = { provider: 'openaq', mode: 'synthetic', sensorId: 1,
    parameter: 'pm25', from: '2026-01-01T00:00:00Z', to: '2026-01-01T01:00:00Z' };
  const measured = { ...identity, value: 12.5, unit: 'µg/m³', raw: { value: 12.5 } };
  const revision = hash(measured);
  const sourceKey = hash(identity);
  const observation = encode({ schema: 'ecotrack.observation@1', ...measured, revision, sourceKey });
  const action = encode({ schema: 'ecotrack.review-action@1', taskId: 'task-1',
    revision, sourceKey, sourceSnapshotHash: hash(observation), action: 'verified',
    actor: 'reviewer', reason: 'Đã đối chiếu nguồn dữ liệu', obsoleteAck: false });
  const item = { _id: hash({clientId:'ecotrack-2025',sourceKey,revision}), reviewVersion: 2,
    revision, objectKey: 'source-key', snapshotHash: hash(observation),
    result: { decision: 'verified' }, actions: { 'task-1': { action: 'verified', appliedAt: new Date().toISOString(),
      evidence: { objectKey: 'action-key', checksum: hash(action) } } } };
  const client = { request: async (path, body, headers) => {
    assert.equal(headers['X-Core-Clean'], 'true');
    return Buffer.from(headers['X-Core-Object'] === 'source-key' ? observation : action);
  } };
  const bundle = await exportCaseEvidence(item, client);
  const archive = { bundle, record: { recordKey: sourceKey, version: 2, recordedAt: '2026-01-01T01:03:00Z',
    data: { caseId: item._id, sourceRevision: revision, value: 12.5, unit: 'µg/m³', decision: 'verified',
      closedAt: '2026-01-01T01:02:00Z' }, evidence: { taskId: 'task-1', files: [
      { key: `observations/${item._id}.json`, receiptId: 'source-receipt', sha256: hash(observation) },
      { key: `reviews/${item._id}/task-1.json`, receiptId: 'action-receipt', sha256: hash(action) },
    ] } } };
  assert.equal(verifyArchivedDecision(archive).source.value, measured.value);
  const prior = structuredClone(archive);
  prior.record.version = 1;
  const history = { schema: historyFormat, sourceKey, before: 3, next: null, versions: [archive, prior] };
  assert.deepEqual(verifyDecisionHistory(history).byUnit,
    [{ unit: 'µg/m³', count: 2, min: 12.5, max: 12.5, verified: 2, rejected: 0 }]);
  assert.throws(() => verifyDecisionHistory({ ...history, versions: [archive, archive] }), { code: 'ARCHIVE_HISTORY_INVALID' });
  assert.throws(() => verifyDecisionHistory({ ...history, versions: [archive] }), { code: 'ARCHIVE_HISTORY_INVALID' });
  assert.throws(() => verifyDecisionHistory({ ...history, before: 2 }), { code: 'ARCHIVE_HISTORY_INVALID' });
  for (const tamper of [
    x => { x.record.data.value++; },
    x => { x.record.evidence.files[0].sha256 = hash(action); },
    x => { x.record.evidence.files[0] = x.record.evidence.files[1]; },
    x => { x.record.evidence.taskId = 'another-task'; },
  ]) {
    const modified = structuredClone(archive);
    tamper(modified);
    assert.throws(() => verifyArchivedDecision(modified), { code: 'ARCHIVE_RECEIPT_INVALID' });
  }
  await assert.rejects(exportCaseEvidence({ ...item, result: undefined }, client), { code: 'CASE_EVIDENCE_NOT_READY' });
  await assert.rejects(exportCaseEvidence({ ...item, actions: {} }, client), { code: 'CASE_EVIDENCE_NOT_READY' });
  assert.equal(verifyCaseEvidence(bundle, bundle.manifestSha256).entries, 2);
  assert.throws(() => verifyCaseEvidence(bundle, hash('wrong-manifest')));
  const changed = structuredClone(bundle);
  changed.content['source.json'] = Buffer.from(observation.replace('observation','ObservatioN')).toString('base64');
  assert.throws(() => verifyCaseEvidence(changed), { code: 'CASE_EVIDENCE_INVALID' });
  const missing = structuredClone(bundle);
  delete missing.content['actions/task-1.json'];
  assert.throws(() => verifyCaseEvidence(missing), { code: 'CASE_EVIDENCE_INVALID' });
  const inconsistent = structuredClone(bundle);
  inconsistent.manifest.decision = 'rejected';
  inconsistent.manifestSha256 = hash(inconsistent.manifest);
  assert.throws(() => verifyCaseEvidence(inconsistent), { code: 'CASE_EVIDENCE_INVALID' });
  const stripped = structuredClone(bundle);
  stripped.manifest.entries = stripped.manifest.entries.filter(entry => entry.path === 'source.json');
  delete stripped.content['actions/task-1.json'];
  stripped.manifestSha256 = hash(stripped.manifest);
  assert.throws(() => verifyCaseEvidence(stripped));
  stripped.manifest.decision = null;
  stripped.manifestSha256 = hash(stripped.manifest);
  assert.throws(() => verifyCaseEvidence(stripped, bundle.manifestSha256));
  const legacy = await exportCaseEvidence({ ...item, reviewVersion: 1, actions: {} }, client);
  assert.equal(verifyCaseEvidence(legacy).scope, 'source-only');
  assert.equal(legacy.manifest.decision, null);
  const legacyWithActions = await exportCaseEvidence({ ...item, reviewVersion: 1 }, client);
  assert.equal(verifyCaseEvidence(legacyWithActions).entries, 1);
  function rewriteFile(original, path, mutate) {
    const copy = structuredClone(original);
    const document = JSON.parse(Buffer.from(copy.content[path], 'base64'));
    mutate(document);
    const text = encode(document);
    copy.content[path] = Buffer.from(text).toString('base64');
    const entry = copy.manifest.entries.find(row => row.path === path);
    entry.sha256 = hash(text);
    entry.size = Buffer.byteLength(text);
    copy.manifestSha256 = hash(copy.manifest);
    return copy;
  }
  for (const field of ['sourceKey', 'revision']) {
    assert.throws(() => verifyCaseEvidence(rewriteFile(bundle, 'source.json', document => {
      document[field] = hash('changed-field');
    })));
  }
  const wrongId = structuredClone(bundle);
  wrongId.manifest.caseId = hash('wrong-case');
  wrongId.manifestSha256 = hash(wrongId.manifest);
  assert.throws(() => verifyCaseEvidence(wrongId));
  for (const [field, value] of [['actor', ''], ['reason', ''], ['sourceSnapshotHash', hash('other')], ['obsoleteAck', true]]) {
    assert.throws(() => verifyCaseEvidence(rewriteFile(bundle, 'actions/task-1.json', document => {
      document[field] = value;
    })));
  }
});

test('lịch sử giữ trạng thái chờ gửi lại và thời điểm cũ chưa ghi riêng biệt', () => {
  const events = caseTimeline({ status: 'retry', steps: { uploaded: true }, nextAttemptAt: '2026-01-01T02:00:00Z' },
    { collectedAt: '2026-01-01T00:00:00Z', provider: 'openaq' });
  assert.equal(events.find(event => event.title === 'Gửi chứng cứ tới Core').at, null);
  assert.equal(events.at(-1).status, 'Đang chờ gửi lại');
  assert.equal(events.at(-1).nextAt, '2026-01-01T02:00:00.000Z');
});
