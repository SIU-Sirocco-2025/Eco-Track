// SPDX-License-Identifier: GPL-3.0-or-later
const { fail } = require('./source');
const manifest = require('./manifest.json');

async function workflowImpact(collection, connector, currentId, proposedId) {
  const valid = id => typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(id);
  if (!valid(currentId) || !valid(proposedId)) fail('WORKFLOW_IMPACT_DEFINITION_REQUIRED');
  async function definition(definitionId) {
    let info;
    try { info = await connector.workflow({ operation: 'definitions.get', definitionId }); }
    catch (error) {
      if (error.status === 404) fail('WORKFLOW_IMPACT_DEFINITION_UNAVAILABLE');
      throw error;
    }
    if (info?.id !== definitionId || !valid(info.key) || !Number.isSafeInteger(info.version) || info.version < 1)
      fail('WORKFLOW_IMPACT_DEFINITION_INVALID');
    return { definitionId, processKey: info.key, version: info.version };
  }
  const current = await definition(currentId);
  const proposed = currentId === proposedId ? current : await definition(proposedId);
  if (current.processKey !== proposed.processKey) fail('WORKFLOW_IMPACT_PROCESS_KEY_MISMATCH');
  const openByDefinition = await collection.aggregate([
    { $match: { clientId: manifest.id, reviewVersion: 2, status: { $in: ['pending', 'retry', 'blocked', 'active'] }, superseded: { $ne: true } } },
    { $group: { _id: { definitionId: '$definitionId', status: '$status' }, count: { $sum: 1 } } },
    { $sort: { '_id.definitionId': 1, '_id.status': 1 } },
  ], { maxTimeMS: 5000 }).toArray();
  return { status: 'preview', mode: 'read-only', capturedAt: new Date().toISOString(), current, proposed,
    openByDefinition: openByDefinition.map(row => ({ definitionId: valid(row._id.definitionId) ? row._id.definitionId : null,
      status: row._id.status, count: row.count })),
    scope: 'Chỉ đếm hồ sơ v2 chưa đóng hoặc thay thế trong MongoDB EcoTrack đang kết nối.',
    next: 'Hồ sơ đã tạo giữ định nghĩa đã lưu. Chạy lại phép xem trước ngay trước khi người vận hành đổi cấu hình cho hồ sơ mới.',
  };
}

module.exports = { workflowImpact };
