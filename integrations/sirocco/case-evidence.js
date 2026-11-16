// SPDX-License-Identifier: GPL-3.0-or-later
const { createHash } = require('node:crypto');
const { hash, fail } = require('./source');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = /^[a-f0-9]{64}$/;
const maxBytes = 32 * 1024 * 1024;

async function exportCaseEvidence(item, client) {
  const source = { path: 'source.json', key: item.objectKey, sha256: item.snapshotHash };
  const files = [source];
  const actions = item.reviewVersion === 2 ? item.actions ?? {} : {};
  const terminal = Object.values(actions).filter(action => action.appliedAt && ['verified', 'rejected'].includes(action.action));
  if (item.reviewVersion === 2 && (item.result?.decision || terminal.length) &&
      (terminal.length !== 1 || item.result?.decision !== terminal[0].action))
    fail('CASE_EVIDENCE_NOT_READY');
  for (const [taskId, action] of Object.entries(actions)) {
    if (!action.appliedAt) continue;
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(taskId) || !action.evidence) fail('CASE_EVIDENCE_MISSING');
    files.push({ path: `actions/${taskId}.json`, key: action.evidence.objectKey, sha256: action.evidence.checksum });
  }
  if (files.length > 512) fail('CASE_EVIDENCE_INVALID');
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifest = { format: 'ecotrack-case-evidence@1', caseId: item._id, revision: item.revision,
    scope: item.reviewVersion === 2 ? 'source-and-actions' : 'source-only',
    decision: item.reviewVersion === 2 ? item.result?.decision ?? null : null, entries: [] };
  const content = {};
  let total = 0;
  for (const file of files) {
    const bytes = await client.request('/objects', undefined,
      { 'X-Core-Object': file.key, 'X-Core-Clean': 'true' }, true);
    total += bytes.length;
    if (total > maxBytes || digest(bytes) !== file.sha256) fail('CASE_EVIDENCE_INVALID');
    manifest.entries.push({ path: file.path, size: bytes.length, sha256: file.sha256 });
    content[file.path] = bytes.toString('base64');
  }
  const bundle = { manifest, manifestSha256: hash(manifest), content };
  verifyCaseEvidence(bundle);
  return bundle;
}

function verifyCaseEvidence(bundle, expectedManifestSha256) {
  const { manifest, manifestSha256, content } = bundle ?? {};
  if (manifest?.format !== 'ecotrack-case-evidence@1' || !sha256.test(manifest.caseId) ||
      !sha256.test(manifest.revision) || !sha256.test(manifestSha256) || hash(manifest) !== manifestSha256 ||
      (expectedManifestSha256 !== undefined && expectedManifestSha256 !== manifestSha256) ||
      !['source-only', 'source-and-actions'].includes(manifest.scope) ||
      ![null, 'verified', 'rejected'].includes(manifest.decision) || !Array.isArray(manifest.entries) ||
      manifest.entries.length > 512 || !content || typeof content !== 'object' || Array.isArray(content)) fail('CASE_EVIDENCE_INVALID');
  const seen = new Set();
  const actionDocs = [];
  let sourceDoc;
  let total = 0;
  for (const entry of manifest.entries) {
    if (!entry || !/^(?:source\.json|actions\/[a-zA-Z0-9_-]{1,120}\.json)$/.test(entry.path) ||
        seen.has(entry.path) || !sha256.test(entry.sha256) || !Number.isSafeInteger(entry.size) ||
        entry.size < 0 || entry.size > maxBytes - total) fail('CASE_EVIDENCE_INVALID');
    const data = Object.hasOwn(content, entry.path) && content[entry.path];
    if (typeof data !== 'string' || data.length !== 4 * Math.ceil(entry.size / 3)) fail('CASE_EVIDENCE_INVALID');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length !== entry.size || bytes.toString('base64') !== data || digest(bytes) !== entry.sha256)
      fail('CASE_EVIDENCE_INVALID');
    let document;
    try { document = JSON.parse(bytes.toString('utf8')); } catch { fail('CASE_EVIDENCE_INVALID'); }
    if (entry.path === 'source.json') sourceDoc = { document, sha256: entry.sha256 };
    else actionDocs.push({ document, path: entry.path });
    total += bytes.length;
    seen.add(entry.path);
  }
  if (!seen.has('source.json') || Object.keys(content).length !== seen.size) fail('CASE_EVIDENCE_INVALID');
  const source = sourceDoc?.document;
  if (source?.schema !== 'ecotrack.observation@1' || source.revision !== manifest.revision ||
      !sha256.test(source.sourceKey)) fail('CASE_EVIDENCE_INVALID');
  const sourceIdentity = { provider: source.provider, mode: source.mode, sensorId: source.sensorId,
    parameter: source.parameter, from: source.from, to: source.to };
  const sourceContent = { ...sourceIdentity, value: source.value, unit: source.unit, raw: source.raw };
  if (hash(sourceIdentity) !== source.sourceKey || hash(sourceContent) !== source.revision ||
      hash({ clientId: 'ecotrack-2025', sourceKey: source.sourceKey, revision: source.revision }) !== manifest.caseId)
    fail('CASE_EVIDENCE_INVALID');
  let finalAction;
  for (const { document, path } of actionDocs) {
    if (document?.schema !== 'ecotrack.review-action@1' || document.revision !== source.revision ||
        document.sourceKey !== source.sourceKey || document.sourceSnapshotHash !== sourceDoc.sha256 ||
        typeof document.actor !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(document.actor) ||
        typeof document.reason !== 'string' || document.reason.trim().length < 5 || document.reason.length > 2000 ||
        typeof document.obsoleteAck !== 'boolean' ||
        (document.obsoleteAck && !['rejected', 'submit_supplement'].includes(document.action)) ||
        path !== `actions/${document.taskId}.json`) fail('CASE_EVIDENCE_INVALID');
    if (['verified', 'rejected'].includes(document.action)) {
      if (finalAction) fail('CASE_EVIDENCE_INVALID');
      finalAction = document.action;
    } else if (!['request_supplement', 'submit_supplement'].includes(document.action)) fail('CASE_EVIDENCE_INVALID');
  }
  if ((finalAction ?? null) !== manifest.decision ||
      (manifest.scope === 'source-only' && (actionDocs.length || manifest.decision !== null)))
    fail('CASE_EVIDENCE_INVALID');
  return { caseId: manifest.caseId, revision: manifest.revision, scope: manifest.scope,
    decision: manifest.decision, entries: seen.size, manifestSha256 };
}

module.exports = { exportCaseEvidence, verifyCaseEvidence };
