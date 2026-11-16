// SPDX-License-Identifier: GPL-3.0-or-later
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { actionIntent } = require('../integrations/sirocco/review-actions');
const item = { _id: 'record', reviewVersion: 2, revision: 'revision', snapshotHash: 'snapshot' };
const task = { id: 'task-1', taskDefinitionKey: 'review', assignee: 'reviewer' };
const input = { actor: 'reviewer', action: 'verified', reason: 'Đã đối chiếu nguồn và đơn vị', revision: 'revision', snapshotHash: 'snapshot' };

test('ý định gắn task và nội dung; retry ổn định, quyết định đối nghịch cùng task phải được phát hiện', () => {
  const first = actionIntent(item, task, input);
  assert.deepEqual(actionIntent(item, task, input), first);
  const other = actionIntent(item, task, { ...input, action: 'rejected' });
  assert.equal(other.operationId, first.operationId);
  assert.notEqual(other.digest, first.digest);
  assert.notEqual(actionIntent(item, { ...task, id: 'task-2' }, input).operationId, first.operationId);
  assert.equal(first.terminal, true);
});
test('quyền task, lý do và phiên bản đã xem là bắt buộc', () => {
  for (const patch of [{ actor: 'other' }, { revision: 'stale' }, { snapshotHash: 'changed' },
    { reason: '' }, { reason: 'x'.repeat(2001) }, { action: 'submit_supplement' }]) {
    assert.throws(() => actionIntent(item, task, { ...input, ...patch }));
  }
  assert.throws(() => actionIntent({ ...item, reviewVersion: 1 }, task, input));
});
test('vòng bổ sung chuyển về đúng người, không được dùng thao tác kết luận ở task bổ sung', () => {
  assert.equal(actionIntent(item, task, { ...input, action: 'request_supplement' }).nextTask, 'supplement');
  const supplement = { ...task, taskDefinitionKey: 'supplement' };
  assert.equal(actionIntent(item, supplement, { ...input, action: 'submit_supplement' }).nextTask, 'review');
  assert.throws(() => actionIntent(item, supplement, input), { code: 'REVIEW_ACTION_INVALID' });
});
