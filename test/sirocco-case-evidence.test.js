// SPDX-License-Identifier: GPL-3.0-or-later
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { exportCaseEvidence, verifyCaseEvidence } = require('../integrations/sirocco/case-evidence');
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
  await assert.rejects(exportCaseEvidence({ ...item, result: undefined }, client), { code: 'CASE_EVIDENCE_NOT_READY' });
  assert.equal(verifyCaseEvidence(bundle, bundle.manifestSha256).entries, 2);
  assert.throws(() => verifyCaseEvidence(bundle, hash('wrong-manifest')));
  const changed = structuredClone(bundle);
  changed.content['source.json'] = Buffer.from(observation.replace('observation','ObservatioN')).toString('base64');
  assert.throws(() => verifyCaseEvidence(changed));
  const missing = structuredClone(bundle);
  delete missing.content['actions/task-1.json'];
  assert.throws(() => verifyCaseEvidence(missing));
  const inconsistent = structuredClone(bundle);
  inconsistent.manifest.decision = 'rejected';
  inconsistent.manifestSha256 = hash(inconsistent.manifest);
  assert.throws(() => verifyCaseEvidence(inconsistent));
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
