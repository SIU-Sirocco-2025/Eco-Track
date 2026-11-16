// SPDX-License-Identifier: GPL-3.0-or-later
const { hash, fail, encode } = require('./source');
const { randomUUID } = require('node:crypto');

async function enqueueReview(collection, hour, record, config) {
  const { intentFor, summary } = require('./outbox');
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(config.supplementer || '') ||
      typeof config.reason !== 'string' || config.reason.trim().length < 5 || config.reason.length > 2000 ||
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(config.ruleVersion || '')) fail('REVIEW_CONFIGURATION_INVALID');
  const intent = intentFor(hour, record, config);
  Object.assign(intent, { reviewVersion: 2, supplementer: config.supplementer,
    reviewState: 'awaiting_review', reviewReason: config.reason.trim(), ruleVersion: config.ruleVersion,
    actions: {}, configurationHash: hash({ definitionId: config.definitionId, reviewer: config.reviewer,
      supplementer: config.supplementer, reason: config.reason.trim(), ruleVersion: config.ruleVersion }) });
  intent.variables.supplementer = config.supplementer;
  intent.variables.reviewRuleVersion = config.ruleVersion;
  try { await collection.insertOne(intent); } catch (error) { if (error.code !== 11000) throw error; }
  const saved = await collection.findOne({ _id: intent._id });
  if (!saved || saved.reviewVersion !== 2 || saved.configurationHash !== intent.configurationHash) fail('OUTBOX_CONFIGURATION_CONFLICT');
  return summary(saved);
}

async function reserveSourceAction(item, intent, retry = 0) {
  const Hour = require('../../models/hcmcAirHour.model');
  const { observation } = require('./source');
  const snapshot = JSON.parse(item.snapshotText);
  const key = hash({ taskId: intent.taskId, clientId: item.clientId });
  const field = `reviewReservations.${key}`;
  const rejectedField = `reviewRejections.${key}`;
  const hour = await Hour.collection.findOne({ _id: new (require('mongoose').Types.ObjectId)(snapshot.sourceDocumentId) });
  if (!hour) fail('REVIEW_SOURCE_MISSING');
  const existing = hour.reviewReservations?.[key];
  if (existing) {
    if (existing.digest !== intent.digest) fail('REVIEW_ACTION_CONFLICT');
    return existing;
  }
  if (hour.reviewRejections?.[key]) fail('REVIEW_REVISION_CONFLICT');
  const record = hour.sourceRecords?.find(r => r.sensorId === snapshot.sensorId &&
    require('../../services/openaqRecords').cleanRecord(r.raw || {}).parameter === snapshot.parameter);
  let currentSource;
  try { if (record) currentSource = observation(record, hour); } catch { /* Nguồn hiện tại không còn hợp lệ. */ }
  if (!currentSource || currentSource.sourceKey !== item.sourceKey || currentSource.revision !== item.revision) {
    const latest = await Hour.collection.findOne({ _id: hour._id });
    if (latest?.reviewReservations?.[key]?.digest === intent.digest) return latest.reviewReservations[key];
    const rejected = await Hour.collection.updateOne({ _id: hour._id, sourceRecords: hour.sourceRecords,
      from: hour.from, to: hour.to, [field]: { $exists: false } },
    { $set: { [rejectedField]: { digest: intent.digest, at: new Date().toISOString() } } });
    if (!rejected.matchedCount) fail('REVIEW_ACTION_PENDING');
    fail('REVIEW_REVISION_CONFLICT');
  }
  const reservation = { digest: intent.digest, revision: item.revision, snapshotHash: item.snapshotHash,
    reservedAt: new Date().toISOString() };
  // So và ghi trên chính document nguồn: thay đổi nguồn trước thời điểm này phải bị từ chối.
  const updated = await Hour.collection.updateOne({ _id: hour._id, from: hour.from, to: hour.to,
    sourceRecords: { $elemMatch: record }, [field]: { $exists: false }, [rejectedField]: { $exists: false } }, { $set: { [field]: reservation } });
  if (!updated.matchedCount) {
    const current = await Hour.collection.findOne({ _id: hour._id });
    if (current?.reviewReservations?.[key]?.digest === intent.digest) return current.reviewReservations[key];
    if (retry < 1) return reserveSourceAction(item, intent, retry + 1);
    fail('REVIEW_ACTION_PENDING');
  }
  return reservation;
}

function actionIntent(item, task, input) {
  if (item.reviewVersion !== 2 || !task || task.assignee !== input.actor) fail('REVIEW_TASK_FORBIDDEN');
  const choices = task.taskDefinitionKey === 'review' ? ['verified', 'rejected', 'request_supplement'] :
    task.taskDefinitionKey === 'supplement' ? ['submit_supplement'] : [];
  if (!choices.includes(input.action)) fail('REVIEW_ACTION_INVALID');
  if (input.obsoleteAck && !['rejected', 'submit_supplement'].includes(input.action)) fail('REVIEW_ACTION_INVALID');
  if (input.revision !== item.revision || input.snapshotHash !== item.snapshotHash) fail('REVIEW_REVISION_CONFLICT');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 5 || reason.length > 2000) fail('REVIEW_REASON_REQUIRED');
  const terminal = ['verified', 'rejected'].includes(input.action);
  const intent = { taskId: task.id, taskKey: task.taskDefinitionKey, actor: input.actor,
    action: input.action, reason, revision: item.revision, snapshotHash: item.snapshotHash,
    obsoleteAck: input.obsoleteAck === true,
    terminal, nextTask: terminal ? null : input.action === 'request_supplement' ? 'supplement' : 'review' };
  return { ...intent, digest: hash(intent), operationId: hash({ id: item._id, taskId: task.id, obsolete: intent.obsoleteAck }) + '_review' };
}

async function reconcileAction(collection, client, id, taskId) {
  const item = await collection.findOne({ _id: id });
  const intent = item?.actions?.[taskId];
  if (!intent || !item.steps?.processId) fail('REVIEW_ACTION_MISSING');
  const journal = await client.request('/operations/' + intent.operationId);
  const ended = await client.workflow({ operation: 'tasks.ended', processId: item.steps.processId, taskId });
  if (journal.state !== 'applied' || journal.resource?.taskId !== taskId ||
      journal.resource?.processId !== item.steps.processId ||
      !ended.data?.some(t => t.id === taskId && t.endTime && !t.deleteReason)) fail('REVIEW_ACTION_UNCONFIRMED');
  if (intent.terminal) {
    const finished = await client.workflow({ operation: 'processes.finished', processId: item.steps.processId });
    if (!finished.data?.some(p => p.id === item.steps.processId)) fail('REVIEW_ACTION_UNCONFIRMED');
  } else {
    const tasks = await client.workflow({ operation: 'tasks.list', processId: item.steps.processId });
    const expectedActor = intent.nextTask === 'review' ? item.reviewer : item.supplementer;
    if (tasks.data?.length !== 1 || tasks.data[0].taskDefinitionKey !== intent.nextTask ||
        tasks.data[0].assignee !== expectedActor) fail('REVIEW_ACTION_UNCONFIRMED');
  }
  const patch = { [`actions.${taskId}.appliedAt`]: new Date().toISOString() };
  if (intent.terminal) {
    patch.status = intent.action;
    patch.result = { decision: intent.action, reason: intent.reason, revision: intent.revision,
      snapshotHash: intent.snapshotHash, obsoleteAck: intent.obsoleteAck, reportedActor: intent.actor, taskId, processId: item.steps.processId };
  } else patch.reviewState = intent.obsoleteAck ? 'source_changed' : intent.nextTask === 'review' ? 'awaiting_review' : 'awaiting_supplement';
  // Chỉ một action đang chờ được phép cập nhật state; retry action cũ không quay lùi hồ sơ.
  const applied = await collection.updateOne({ _id: id, pendingAction: taskId }, { $set: patch, $unset: { pendingAction: '' } });
  const current = await collection.findOne({ _id: id });
  if (!applied.matchedCount && !current?.actions?.[taskId]?.appliedAt) fail('REVIEW_ACTION_UNCONFIRMED');
  return current;
}

async function performAction(collection, client, id, input) {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(input.taskId || '')) fail('REVIEW_TASK_INVALID');
  let item = await collection.findOne({ _id: id });
  if (!item || item.reviewVersion !== 2) fail('REVIEW_VERSION_INVALID');
  let saved = item.actions?.[input.taskId];
  if (item.reviewState === 'source_changed' && !saved && input.obsoleteAck !== true) fail('REVIEW_ACTION_INVALID');
  if (input.obsoleteAck === true && (!saved || saved.rejectedBeforeDispatch)) {
    if (item.pendingAction) fail('REVIEW_ACTION_PENDING');
    const tasks = await client.workflow({ operation: 'tasks.list', processId: item.steps.processId });
    const task = tasks.data?.find(t => t.id === input.taskId);
    const intent = actionIntent(item, task, input);
    if (item.reviewState !== 'source_changed') fail('REVIEW_ACTION_INVALID');
    const Hour = require('../../models/hcmcAirHour.model');
    const sourceId = JSON.parse(item.snapshotText).sourceDocumentId;
    const hour = await Hour.collection.findOne({ _id: new (require('mongoose').Types.ObjectId)(sourceId) });
    const key = hash({ taskId: input.taskId, clientId: item.clientId });
    if (hour?.reviewReservations?.[key]) fail('REVIEW_ACTION_CONFLICT');
    if (saved && hour && hour.reviewRejections?.[key]?.digest !== saved.digest) fail('REVIEW_ACTION_PENDING');
    const query = { _id: id, status: 'active', superseded: { $ne: true }, pendingAction: { $exists: false }, reviewState: 'source_changed',
      ...(saved ? { [`actions.${input.taskId}.digest`]: saved.digest, [`actions.${input.taskId}.rejectedBeforeDispatch`]: true } :
        { [`actions.${input.taskId}`]: { $exists: false } }) };
    const replacement = { ...intent, createdAt: new Date().toISOString(),
      sourceReservation: { obsoleteAck: true, acknowledgedAt: new Date().toISOString() } };
    const update = { $set: { [`actions.${input.taskId}`]: replacement, pendingAction: input.taskId } };
    if (saved) update.$push = { rejectedActionHistory: saved };
    await collection.updateOne(query, update);
    item = await collection.findOne({ _id: id });
    saved = item.actions?.[input.taskId];
    if (saved?.digest !== intent.digest) fail('REVIEW_ACTION_CONFLICT');
  }
  if (saved) {
    if (saved.rejectedBeforeDispatch) fail('REVIEW_REVISION_CONFLICT');
    const proposed = actionIntent(item, { id: input.taskId, taskDefinitionKey: saved.taskKey, assignee: saved.actor }, input);
    if (saved.digest !== proposed.digest) fail('REVIEW_ACTION_CONFLICT');
    if (saved.appliedAt) return item;
  } else {
    if (item.status !== 'active') fail('REVIEW_NOT_ACTIVE');
    if (item.pendingAction) fail('REVIEW_ACTION_PENDING');
    const tasks = await client.workflow({ operation: 'tasks.list', processId: item.steps.processId });
    const task = tasks.data?.find(t => t.id === input.taskId);
    const intent = actionIntent(item, task, input);
    await collection.updateOne({ _id: id, status: 'active', revision: input.revision,
      snapshotHash: input.snapshotHash, superseded: { $ne: true }, pendingAction: { $exists: false },
      [`actions.${input.taskId}`]: { $exists: false } },
    { $set: { [`actions.${input.taskId}`]: { ...intent, createdAt: new Date().toISOString() }, pendingAction: input.taskId } });
    item = await collection.findOne({ _id: id });
    saved = item.actions?.[input.taskId];
    if (!saved || saved.digest !== intent.digest) fail('REVIEW_ACTION_CONFLICT');
  }
  if (!saved.sourceReservation) {
    const fence = randomUUID();
    const acquired = await collection.updateOne({ _id: id, pendingAction: saved.taskId,
      $or: [{ reservationUntil: { $exists: false } }, { reservationUntil: { $lte: new Date() } }] },
    { $set: { reservationFence: fence, reservationUntil: new Date(Date.now() + 30000) } });
    if (!acquired.matchedCount) fail('REVIEW_ACTION_PENDING');
    let sourceReservation;
    try { sourceReservation = await reserveSourceAction(item, saved); }
    catch (error) {
      if (['REVIEW_REVISION_CONFLICT', 'REVIEW_SOURCE_MISSING'].includes(error.code)) {
        await collection.updateOne({ _id: id, pendingAction: saved.taskId, reservationFence: fence,
          [`actions.${saved.taskId}.sourceReservation`]: { $exists: false } },
        { $set: { [`actions.${saved.taskId}.rejectedBeforeDispatch`]: true, reviewState: 'source_changed' },
          $unset: { pendingAction: '', reservationFence: '', reservationUntil: '' } });
      }
      await collection.updateOne({ _id: id, reservationFence: fence }, { $unset: { reservationFence: '', reservationUntil: '' } });
      throw error;
    }
    const stored = await collection.updateOne({ _id: id, pendingAction: saved.taskId, reservationFence: fence,
      [`actions.${saved.taskId}.digest`]: saved.digest }, { $set: { [`actions.${saved.taskId}.sourceReservation`]: sourceReservation },
      $unset: { reservationFence: '', reservationUntil: '' } });
    if (!stored.matchedCount) fail('REVIEW_ACTION_PENDING');
  }
  if (!saved.evidence) {
    const payload = encode({ schema: 'ecotrack.review-action@1', sourceKey: item.sourceKey,
      revision: saved.revision, sourceSnapshotHash: saved.snapshotHash, taskId: saved.taskId,
      actor: saved.actor, action: saved.action, reason: saved.reason, obsoleteAck: saved.obsoleteAck });
    const bytes = Buffer.from(payload), checksum = hash(payload);
    const objectKey = `reviews/${id}/${saved.taskId}.json`;
    await client.request('/objects', bytes, { 'X-Core-Object': objectKey, 'X-Core-Operation-Id': saved.operationId + '_upload' });
    const receipt = await client.request('/objects/promote', bytes, { 'X-Core-Object': objectKey, 'X-Core-Operation-Id': saved.operationId + '_scan' });
    if (receipt.clientId !== item.clientId || receipt.objectKey !== objectKey || receipt.checksum !== checksum ||
        receipt.size !== bytes.length || !receipt.id) fail('REVIEW_EVIDENCE_INVALID');
    const readback = await client.request('/objects', undefined, { 'X-Core-Object': objectKey, 'X-Core-Clean': 'true' }, true);
    if (!readback.equals(bytes)) fail('REVIEW_EVIDENCE_INVALID');
    const checkpoint = await collection.updateOne({ _id: id, pendingAction: saved.taskId },
      { $set: { [`actions.${saved.taskId}.evidence`]: { objectKey, checksum, receiptId: receipt.id } } });
    if (!checkpoint.matchedCount) {
      const current = await collection.findOne({ _id: id });
      if (current?.actions?.[saved.taskId]?.appliedAt) return current;
      fail('REVIEW_ACTION_PENDING');
    }
  }
  await client.workflow({ operation: 'tasks.complete', taskId: saved.taskId,
    variables: { needsSupplement: saved.action === 'request_supplement',
      sourceVerified: saved.action === 'verified', reviewReason: saved.reason, reportedReviewer: saved.actor } }, saved.operationId);
  return reconcileAction(collection, client, id, saved.taskId);
}

module.exports = { enqueueReview, actionIntent, performAction, reconcileAction, reserveSourceAction };
