// SPDX-License-Identifier: GPL-3.0-or-later
const completionPending = { status: 'active', $or: [
  { reviewVersion: 2, pendingAction: { $type: 'string' } },
  { reviewVersion: { $ne: 2 }, 'completion.taskId': { $type: 'string' } },
] };

function operationsFilter(status) {
  if (status === 'reconciling') return completionPending;
  if (status === 'awaiting-person') return { status: 'active', $nor: [completionPending] };
  return null;
}

function caseStatus(item) {
  if (item.status !== 'active') return item.status;
  if (item.reviewVersion === 2 ? item.pendingAction : item.completion?.taskId) return 'reconciling';
  return item.reviewState === 'awaiting_supplement' ? 'awaiting-supplement' : 'awaiting-person';
}

module.exports = { completionPending, operationsFilter, caseStatus };
