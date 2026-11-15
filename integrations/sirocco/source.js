// SPDX-License-Identifier: GPL-3.0-or-later
const { createHash } = require('node:crypto');
const { cleanRecord } = require('../../services/openaqRecords');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const encode = value => JSON.stringify(canonical(value));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : encode(value)).digest('hex');
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function instant(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('SOURCE_TIME_INVALID');
  return new Date(value).toISOString();
}
function observation(record, hour) {
  if (!record || record.provider !== 'openaq' || !['observed', 'replay', 'synthetic'].includes(record.mode) ||
      !Number.isSafeInteger(record.sensorId) || record.sensorId <= 0 || !record.raw) fail('SOURCE_PROVENANCE_MISSING');
  const m = cleanRecord(record.raw);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/.test(m.parameter) || m.parameter === 'unknown' ||
      typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value < 0 ||
      typeof m.unit !== 'string' || !m.unit.trim() || m.unit.length > 40 || /[$#]\{/.test(m.unit)) fail('SOURCE_MEASUREMENT_INVALID');
  const from = instant(m.from), to = instant(m.to), collectedAt = instant(record.collectedAt);
  const expectedEndpoint = `https://api.openaq.org/v3/sensors/${record.sensorId}/hours`;
  if (record.mode !== 'synthetic' && record.sourceEndpoint !== expectedEndpoint) fail('SOURCE_ENDPOINT_UNVERIFIED');
  if (Date.parse(collectedAt) < Date.parse(to)) fail('SOURCE_WINDOW_INCOMPLETE');
  if (Date.parse(to) - Date.parse(from) !== 3600000 || new Date(hour.from).toISOString() !== from || new Date(hour.to).toISOString() !== to)
    fail('SOURCE_WINDOW_INVALID');
  const source = { provider: record.provider, mode: record.mode, sensorId: record.sensorId,
    parameter: m.parameter, from, to };
  const sourceKey = hash(source);
  const content = { ...source, value: m.value, unit: m.unit, raw: record.raw };
  // Thời điểm lấy lại cùng dữ liệu không tạo revision mới.
  const revision = hash(content);
  const snapshot = { schema: 'ecotrack.observation@1', sourceKey, revision,
    sourceDocumentId: String(hour._id), collectedAt, ...content,
    ageAtCollectionSeconds: Math.floor((Date.parse(collectedAt) - Date.parse(to)) / 1000),
    sourceEndpoint: record.mode === 'synthetic' ? null : record.sourceEndpoint };
  if (Buffer.byteLength(encode(snapshot)) > 512000) fail('SOURCE_TOO_LARGE');
  return { sourceKey, revision, snapshot };
}
module.exports = { encode, hash, observation, fail };
