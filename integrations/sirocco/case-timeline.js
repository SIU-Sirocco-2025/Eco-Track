// SPDX-License-Identifier: GPL-3.0-or-later
const actionLabels = {
  request_supplement: 'Yêu cầu bổ sung',
  submit_supplement: 'Nộp thông tin bổ sung',
  verified: 'Xác minh nguồn',
  rejected: 'Từ chối nguồn',
};
const errorDescriptions = {
  INVALID_CONNECTOR: 'Core không chấp nhận credential của EcoTrack. Báo người quản trị kiểm quyền kết nối.',
  CONNECTOR_HTTP_401: 'Core không chấp nhận credential của EcoTrack. Báo người quản trị kiểm quyền kết nối.',
  CONNECTOR_SCOPE_DENIED: 'Credential của EcoTrack thiếu quyền cần thiết. Báo người quản trị kiểm quyền kết nối.',
  CONNECTOR_HTTP_429: 'Core đang giới hạn tốc độ nhận yêu cầu.',
  CONNECTOR_TIMEOUT: 'EcoTrack chưa nhận phản hồi kịp thời từ Core.',
  CONNECTOR_UNAVAILABLE: 'EcoTrack tạm thời không kết nối được với Core.',
  OUTBOX_DATABASE_UNAVAILABLE: 'EcoTrack chưa ghi được bước xử lý vào cơ sở dữ liệu.',
  RECOVERY_DATABASE_UNAVAILABLE: 'EcoTrack chưa ghi được kết quả đối soát vào cơ sở dữ liệu.',
  RECOVERY_BUDGET_EXHAUSTED: 'Đã hết số lần hoặc thời gian tự thử lại.',
};

function timestamp(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(+date) ? date.toISOString() : null;
}

function caseTimeline(item, source) {
  const steps = item.steps ?? {};
  const operations = item.operations ?? {};
  const events = [];
  const add = (title, at, status, details = {}) => events.push({ title, at: timestamp(at), status, ...details });
  add('Thu số đo từ nguồn', source.collectedAt, 'Đã ghi nhận', { description: source.sourceEndpoint ?? source.provider });
  add('Tạo yêu cầu xác minh', item.createdAt, 'Đã ghi nhận', { description: item.reviewReason, reference: item._id });
  if (steps.uploaded) add('Gửi chứng cứ tới Core', steps.uploadedAt, 'Đã gửi', { reference: operations.upload });
  if (steps.receipt) add('Quét chứng cứ', steps.receipt.scannedAt, 'Đã qua kiểm tra', { reference: steps.receipt.id });
  if (steps.processId) add('Tạo công việc trong Core', steps.startedAt, 'Đã tạo', { reference: steps.processId });
  for (const action of [...(item.rejectedActionHistory ?? []), ...Object.values(item.actions ?? {})]
    .sort((a, b) => (timestamp(a.createdAt) ?? '').localeCompare(timestamp(b.createdAt) ?? ''))) {
    const title = actionLabels[action.action];
    if (!title) continue;
    const status = action.rejectedBeforeDispatch ? 'Chưa gửi vì nguồn thay đổi' :
      action.appliedAt ? 'Đã đối soát' : 'Đang chờ đối soát';
    add(title, action.appliedAt ?? action.createdAt, status, {
      actor: action.actor, description: action.reason, reference: action.operationId,
    });
  }
  if (item.result) {
    const result = item.result;
    add('Ghi kết quả về EcoTrack', result.reconciledAt ?? item.actions?.[result.taskId]?.appliedAt,
      actionLabels[result.decision] ?? 'Đã ghi kết quả', {
        actor: result.reportedActor, description: result.reason, reference: result.taskId,
      });
  }
  if (item.status === 'retry' || item.status === 'blocked' || item.recovery?.code) {
    const blocked = item.status === 'blocked' || item.recovery?.blocked;
    add('Gửi hoặc đối soát với Core', item.recovery?.lastAt ?? item.lastAttemptAt,
      blocked ? 'Cần người xử lý' : 'Đang chờ gửi lại', {
        reference: item.recovery?.code ?? item.lastError,
        description: errorDescriptions[item.recovery?.code ?? item.lastError],
        nextAt: timestamp(item.recovery?.nextAt ?? item.nextAttemptAt),
      });
  }
  return events;
}

module.exports = { caseTimeline };
