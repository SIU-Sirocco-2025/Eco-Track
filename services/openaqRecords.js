// SPDX-License-Identifier: GPL-3.0-or-later
// Giữ bản gốc và sensor cùng bản chuẩn hóa; không suy ra trạm từ tên quận.
function cleanRecord(raw) {
  const p = raw.parameter || {};
  const period = raw.period || {};
  return {
    parameter: p.name || p.key || p.displayName || p.parameter || 'unknown',
    value: raw.value,
    unit: p.units,
    from: period.datetimeFrom?.local || period.datetimeFrom?.utc,
    to: period.datetimeTo?.local || period.datetimeTo?.utc,
  };
}

function aggregateByHour(records) {
  const buckets = new Map();
  for (const rec of records) {
    const c = rec.cleaned;
    if (!c.from || !c.to) continue;
    if (!buckets.has(c.from)) buckets.set(c.from, {
      from: new Date(c.from), to: new Date(c.to),
      window: { fromLocal: c.from, toLocal: c.to }, measurements: {}, raw: [], sourceRecords: [],
    });
    const bucket = buckets.get(c.from);
    if (!bucket.measurements[c.parameter]) bucket.measurements[c.parameter] = c;
    bucket.raw.push(rec.raw);
    bucket.sourceRecords.push({
      sensorId: rec.sensorId, raw: rec.raw, collectedAt: rec.collectedAt,
      sourceEndpoint: rec.sourceEndpoint,
      provider: rec.provider || 'openaq', mode: rec.mode || 'observed',
    });
  }
  return [...buckets.values()];
}
module.exports = { cleanRecord, aggregateByHour };
