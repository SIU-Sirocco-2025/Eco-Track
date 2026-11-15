// SPDX-License-Identifier: GPL-3.0-or-later
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanRecord, aggregateByHour } = require('../services/openaqRecords');
const { intentFor } = require('../integrations/sirocco/outbox');
const { observation } = require('../integrations/sirocco/source');
const { Connector } = require('../integrations/sirocco/client');
function fixture(sensorId = 900000001) {
  const raw = { value: 12.5, parameter: { name: 'pm25', units: 'µg/m³' },
    period: { datetimeFrom: { utc: '2025-11-20T00:00:00Z' }, datetimeTo: { utc: '2025-11-20T01:00:00Z' } } };
  return { sensorId, provider: 'openaq', mode: 'synthetic', collectedAt: '2025-11-20T01:02:00Z', raw, cleaned: cleanRecord(raw) };
}
const config = { definitionId: 'review:1:abc', reviewer: 'fixture-reviewer' };
test('collector giữ hai sensor cùng parameter và raw mà không đổi measurements cũ', () => {
  const a = fixture(), b = fixture(900000002); b.raw.value = 14; b.cleaned = cleanRecord(b.raw);
  const [hour] = aggregateByHour([a,b]);
  assert.equal(hour.measurements.pm25.value, 12.5);
  assert.equal(hour.raw.length, 2);
  assert.deepEqual(hour.sourceRecords.map(r => r.sensorId), [a.sensorId, b.sensorId]);
  assert.notEqual(observation(hour.sourceRecords[0], hour).sourceKey, observation(hour.sourceRecords[1], hour).sourceKey);
});
test('retry và lấy lại cùng dữ liệu giữ ID; nội dung sửa đổi có revision riêng', () => {
  const record = fixture(), [hour] = aggregateByHour([record]); hour._id = 'fixture-hour';
  const first = intentFor(hour, record, config);
  const again = intentFor(hour, { ...record, collectedAt: '2025-11-20T01:10:00Z' }, config);
  assert.equal(again._id, first._id);
  assert.deepEqual(again.operations, first.operations);
  record.raw.value = 20;
  const revised = intentFor(hour, record, config);
  assert.equal(revised.sourceKey, first.sourceKey);
  assert.notEqual(revised.revision, first.revision);
  assert.notEqual(revised.businessKey, first.businessKey);
  assert.equal(JSON.parse(first.snapshotText).sourceEndpoint, null);
});
test('nguồn thiếu, số đo lỗi và cửa sổ không phải giờ bị từ chối', () => {
  const record = fixture(), [hour] = aggregateByHour([record]);
  for (const bad of [{ ...record, sensorId: undefined }, { ...record, mode: 'live-guessed' },
    { ...record, collectedAt: '2025-11-20 01:02:00' }, { ...record, raw: { ...record.raw, value: NaN } },
    { ...record, raw: { ...record.raw, value: -1 } } ]) assert.throws(() => observation(bad, hour));
  assert.throws(() => observation(record, { ...hour, to: '2025-11-20T02:00:00Z' }), { code: 'SOURCE_WINDOW_INVALID' });
});
test('connector không gửi secret đến URL tùy ý trong path, query hay redirect cấu hình', () => {
  const token = 'synthetic-only-token'.repeat(3);
  for (const url of ['http://example.com/api/core/connector', 'http://user:pass@localhost/api/core/connector',
    'http://localhost/api/core/connector?token=x', 'http://localhost/anything', 'ftp://localhost/api/core/connector'])
    assert.throws(() => new Connector({ url, token }), { code: 'CONNECTOR_CONFIGURATION' });
  assert.doesNotThrow(() => new Connector({ url: 'http://127.0.0.1:18088/api/core/connector', token }));
});
test('không tự gán nguồn OpenAQ cho API mirror hoặc cửa sổ đo chưa kết thúc', () => {
  const record = fixture(), [hour] = aggregateByHour([record]);
  const observed = { ...record, mode: 'observed' };
  assert.throws(() => observation(observed, hour), { code: 'SOURCE_ENDPOINT_UNVERIFIED' });
  assert.throws(() => observation({ ...observed, sourceEndpoint: 'https://mirror.invalid/sensors/1/hours' }, hour), { code: 'SOURCE_ENDPOINT_UNVERIFIED' });
  observed.sourceEndpoint = `https://api.openaq.org/v3/sensors/${observed.sensorId}/hours`;
  assert.equal(observation(observed, hour).snapshot.sourceEndpoint, observed.sourceEndpoint);
  assert.throws(() => observation({ ...observed, collectedAt: '2025-11-20T00:30:00Z' }, hour), { code: 'SOURCE_WINDOW_INCOMPLETE' });
});
module.exports = { fixture };
