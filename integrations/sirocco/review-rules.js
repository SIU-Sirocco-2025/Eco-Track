// SPDX-License-Identifier: GPL-3.0-or-later
const { observation, fail } = require('./source');
const { enqueueReview } = require('./review-actions');

function readRule(env) {
  let rule;
  try { rule = JSON.parse(env.SIROCCO_REVIEW_RULE || 'null'); } catch { fail('REVIEW_RULE_INVALID'); }
  if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(rule.version || '') ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/.test(rule.parameter || '') ||
      typeof rule.unit !== 'string' || !rule.unit.trim() || rule.unit.length > 40 ||
      !['min', 'max', 'maxAgeSeconds'].some(k => rule[k] !== undefined) ||
      ['min', 'max', 'maxAgeSeconds'].some(k => rule[k] !== undefined && (!Number.isFinite(rule[k]) || rule[k] < 0)) ||
      (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) ||
      Object.keys(rule).some(k => !['version','parameter','unit','min','max','maxAgeSeconds'].includes(k))) fail('REVIEW_RULE_INVALID');
  return rule;
}
function reviewReason(snapshot, rule) {
  if (snapshot.parameter !== rule.parameter || snapshot.unit !== rule.unit) return null;
  const reasons = [];
  if (rule.min !== undefined && snapshot.value < rule.min) reasons.push(`Giá trị ${snapshot.value} thấp hơn mốc kiểm tra ${rule.min} ${rule.unit}`);
  if (rule.max !== undefined && snapshot.value > rule.max) reasons.push(`Giá trị ${snapshot.value} cao hơn mốc kiểm tra ${rule.max} ${rule.unit}`);
  if (rule.maxAgeSeconds !== undefined && snapshot.ageAtCollectionSeconds > rule.maxAgeSeconds)
    reasons.push(`Dữ liệu được thu sau cửa sổ đo ${snapshot.ageAtCollectionSeconds} giây`);
  return reasons.length ? reasons.join('. ') + '. Cần người xác minh; đây không phải kết luận về an toàn môi trường.' : null;
}
async function enqueueFlaggedHour(db, hour, env) {
  const rule = readRule(env);
  const collection = await require('./outbox').initOutbox(db);
  const results = [];
  for (const record of hour.sourceRecords || []) {
    const { snapshot } = observation(record, hour);
    const reason = reviewReason(snapshot, rule);
    if (reason) results.push(await enqueueReview(collection, hour, record, {
      definitionId: env.SIROCCO_REVIEW_DEFINITION_ID, reviewer: env.SIROCCO_REVIEWER_ID,
      supplementer: env.SIROCCO_SUPPLEMENTER_ID, ruleVersion: rule.version, reason,
      archive: env.SIROCCO_REVIEW_ARCHIVE === 'true' }));
  }
  return results;
}
async function replayPendingReviews(db, env) {
  const hours = db.collection('hcmc_air_hours');
  const cursor = hours.find({ sourceReviewPending: true }).sort({ sourceReviewAttemptAt: 1, from: 1 }).limit(100);
  let evaluated = 0;
  const errors = [];
  for await (const hour of cursor) {
    try {
      await hours.updateOne({ _id: hour._id, sourceRecords: hour.sourceRecords, from: hour.from, to: hour.to },
        { $set: { sourceReviewAttemptAt: new Date() } });
      await enqueueFlaggedHour(db, hour, env);
      const result = await hours.updateOne({ _id: hour._id, sourceRecords: hour.sourceRecords,
        from: hour.from, to: hour.to, sourceReviewPending: true }, { $set: { sourceReviewPending: false }, $unset: { sourceReviewError: '' } });
      evaluated += result.modifiedCount;
    } catch (error) {
      const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '') ? error.code : 'REVIEW_SCAN_FAILED';
      errors.push({ id: String(hour._id), code });
      await hours.updateOne({ _id: hour._id, sourceRecords: hour.sourceRecords, from: hour.from, to: hour.to },
        { $set: { sourceReviewError: { code, at: new Date() } } });
    }
  }
  return { evaluated, errors };
}
module.exports = { readRule, reviewReason, enqueueFlaggedHour, replayPendingReviews };
