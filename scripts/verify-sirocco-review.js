// SPDX-License-Identifier: GPL-3.0-or-later
const assert=require('node:assert/strict');
const {readFileSync,writeFileSync}=require('node:fs');
const {createRequire}=require('node:module');
const eco=createRequire(require('node:path').resolve(__dirname,'../package.json'));
const mongoose=eco('mongoose');
const {Connector}=eco('./integrations/sirocco/client');
const {initOutbox,dispatch}=eco('./integrations/sirocco/outbox');
const {enqueueReview,performAction,reserveSourceAction,actionIntent}=eco('./integrations/sirocco/review-actions');
const {replayPendingReviews}=eco('./integrations/sirocco/review-rules');
const {cleanRecord,aggregateByHour}=eco('./services/openaqRecords');
const Hour=eco('./models/hcmcAirHour.model');
const env=process.env;
const users=[{sub:env.SIROCCO_REVIEWER_ID},{sub:env.SIROCCO_SUPPLEMENTER_ID}];
const definitionId=env.SIROCCO_REVIEW_DEFINITION_ID;
async function main(){
 assert.equal(env.SIROCCO_INTEGRATION_TEST,'local-synthetic');
 const target=new URL(env.MONGODB_URL);
 assert.ok(['127.0.0.1','localhost'].includes(target.hostname));
 assert.equal(target.pathname,'/ecotrack_sirocco_tests');
 assert.ok(users.every(u=>typeof u.sub==='string' && u.sub.length>0));
 assert.ok(definitionId);
 await mongoose.connect(env.MONGODB_URL);const db=mongoose.connection.db, collection=await initOutbox(db);
 const client=new Connector({url:env.CORE_API_URL,token:env.CORE_CONNECTOR_TOKEN});
 const config={definitionId,reviewer:users[0].sub,supplementer:users[1].sub,reason:'Cần kiểm tra số đo theo cấu hình mẫu',ruleVersion:'adverse-v1'};
 async function source(){
  const from=new Date(Date.UTC(2010,0,1)+Math.floor(Math.random()*1000000)*3600000),to=new Date(+from+3600000);
  const raw={value:12.5,parameter:{name:'pm25',units:'µg/m³'},period:{datetimeFrom:{utc:from.toISOString()},datetimeTo:{utc:to.toISOString()}}};
  const record={raw,cleaned:cleanRecord(raw),sensorId:Math.floor(Math.random()*100000000)+600000000,provider:'openaq',mode:'synthetic',collectedAt:to.toISOString()};
  const [entry]=aggregateByHour([record]);return Hour.create(entry);
 }
 async function start(){const doc=await source(), hour=await Hour.findById(doc._id).select('+sourceRecords').lean();const {id}=await enqueueReview(collection,hour,hour.sourceRecords[0],config);await dispatch(collection,client,id);const item=await collection.findOne({_id:id});const tasks=await client.workflow({operation:'tasks.list',processId:item.steps.processId});return {hour,item,task:tasks.data[0],input:{taskId:tasks.data[0].id,actor:users[0].sub,action:'verified',reason:'Đã đối chiếu nguồn và dữ liệu',revision:item.revision,snapshotHash:item.snapshotHash}};}
 const checks=[];
 const stale=await start();await Hour.updateOne({_id:stale.hour._id},{$set:{'sourceRecords.0.raw.value':13}});
 await assert.rejects(performAction(collection,client,stale.item._id,stale.input),{code:'REVIEW_REVISION_CONFLICT'});
 const rejected=await collection.findOne({_id:stale.item._id});assert.equal(rejected.pendingAction,undefined);assert.equal(rejected.reviewState,'source_changed');
 assert.equal((await client.workflow({operation:'tasks.list',processId:stale.item.steps.processId})).data[0].id,stale.task.id);checks.push('changed-source-rejected-before-Core-no-pending-wedge');
 await assert.rejects(performAction(collection,client,stale.item._id,{...stale.input,obsoleteAck:true}),{code:'REVIEW_ACTION_INVALID'});
 const closed=await performAction(collection,client,stale.item._id,{...stale.input,action:'rejected',obsoleteAck:true,reason:'Từ chối bản cũ vì nguồn đã thay đổi'});
 assert.equal(closed.status,'rejected');assert.equal(closed.result.obsoleteAck,true);assert.equal(closed.rejectedActionHistory.length,1);
 assert.equal((await client.workflow({operation:'processes.finished',processId:stale.item.steps.processId})).data.length,1);
 checks.push('stale-review-explicit-rejection-finishes-Core-preserves-history');
 await assert.rejects(performAction(collection,client,stale.item._id,{...stale.input,action:'rejected',obsoleteAck:true,reason:'Một quyết định mới cho hồ sơ đã đóng'}),{code:'REVIEW_ACTION_CONFLICT'});
 const missing=await start();
 await Hour.collection.deleteOne({_id:missing.hour._id});
 await assert.rejects(performAction(collection,client,missing.item._id,missing.input),{code:'REVIEW_SOURCE_MISSING'});
 const missingClosed=await performAction(collection,client,missing.item._id,{...missing.input,action:'rejected',obsoleteAck:true,reason:'Không thể xác nhận vì nguồn đã bị xóa'});
 assert.equal(missingClosed.status,'rejected');
 assert.equal((await client.workflow({operation:'processes.finished',processId:missing.item.steps.processId})).data.length,1);
 checks.push('missing-source-closes-explicitly-and-terminal-rejects-conflicting-action');
 const supplement=await start();
 await performAction(collection,client,supplement.item._id,{...supplement.input,action:'request_supplement'});
 await Hour.updateOne({_id:supplement.hour._id},{$set:{'sourceRecords.0.raw.value':16}});
 const waiting=await client.workflow({operation:'tasks.list',processId:supplement.item.steps.processId});
 const reply={...supplement.input,taskId:waiting.data[0].id,actor:users[1].sub,action:'submit_supplement',reason:'Nguồn đã thay đổi trong lúc bổ sung'};
 await assert.rejects(performAction(collection,client,supplement.item._id,reply),{code:'REVIEW_REVISION_CONFLICT'});
 await performAction(collection,client,supplement.item._id,{...reply,obsoleteAck:true});
 const returned=await client.workflow({operation:'tasks.list',processId:supplement.item.steps.processId});
 const finalInput={...supplement.input,taskId:returned.data[0].id,action:'rejected',obsoleteAck:true,reason:'Từ chối số đo cũ sau thông báo bổ sung'};
 assert.equal((await performAction(collection,client,supplement.item._id,finalInput)).status,'rejected');
 checks.push('stale-supplement-explicit-return-and-reviewer-rejection');
 const crash=await start();const intent=actionIntent(crash.item,crash.task,crash.input);
 await reserveSourceAction(crash.item,intent); // Tiến trình có thể dừng tại đây, trước ghi intent outbox.
 await Hour.findOneAndUpdate({_id:crash.hour._id},{$set:{'sourceRecords.0.raw.value':15}});
 assert.ok((await Hour.collection.findOne({_id:crash.hour._id})).reviewReservations);
 assert.equal((await performAction(collection,client,crash.item._id,crash.input)).status,'verified');checks.push('reservation-survives-model-update-and-retry-after-source-change');
 const race=await start();
 await assert.rejects(performAction(collection,client,race.item._id,{...race.input,actor:users[1].sub}),{code:'REVIEW_TASK_FORBIDDEN'});
 const results=await Promise.allSettled([performAction(collection,client,race.item._id,race.input),performAction(collection,client,race.item._id,{...race.input,action:'rejected'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(Object.keys((await collection.findOne({_id:race.item._id})).actions).length,1);checks.push('wrong-actor-blocked-one-opposing-decision-wins');
 const doc=await source();await Hour.updateOne({_id:doc._id},{$set:{sourceReviewPending:true}}); // Dừng ngay sau source save, chưa enqueue.
 const poison=await source();
 await Hour.updateOne({_id:poison._id},{$set:{sourceReviewPending:true,'sourceRecords.0.raw.value':-10}});
 const ruleEnv={...env,SIROCCO_REVIEW_DEFINITION_ID:definitionId,SIROCCO_REVIEWER_ID:users[0].sub,SIROCCO_SUPPLEMENTER_ID:users[1].sub,
  SIROCCO_REVIEW_RULE:JSON.stringify({version:'durable-v1',parameter:'pm25',unit:'µg/m³',max:10})};
 const scan=await replayPendingReviews(db,ruleEnv);
 assert.equal(scan.evaluated,1);assert.ok(scan.errors.some(e=>e.id===String(poison._id)));
 assert.equal((await Hour.collection.findOne({_id:poison._id})).sourceReviewPending,true);
 assert.equal((await replayPendingReviews(db,ruleEnv)).evaluated,0);
 assert.equal(await collection.countDocuments({'variables.sensorId':String(doc.sourceRecords[0].sensorId)}),1);checks.push('saved-source-marker-replayed-exactly-one-intent','poison-hour-kept-with-error-valid-hour-continues');
 // Giữ A ngay trước source CAS, để B thử xử lý khi nguồn đổi rồi quay về bản cũ.
 for(const expire of [false,true]) {
  const fixture=await start();let release,entered;
  const paused=new Promise(r=>{entered=r;}), barrier=new Promise(r=>{release=r;});
  const original=Hour.collection.updateOne.bind(Hour.collection);
  let intercepted=false;
  Hour.collection.updateOne=async function(query,update,...rest){
   if(!intercepted && String(query._id)===String(fixture.hour._id) && Object.keys(update.$set||{}).some(k=>k.startsWith('reviewReservations.'))) {
    intercepted=true;entered();await barrier;
   }
   return original(query,update,...rest);
  };
  try {
   const a=performAction(collection,client,fixture.item._id,fixture.input).then(value=>({value}),error=>({error}));
   await paused;
   await original({_id:fixture.hour._id},{$set:{'sourceRecords.0.raw.value':77}});
   if(expire) await collection.updateOne({_id:fixture.item._id},{$set:{reservationUntil:new Date(0)}});
   await assert.rejects(performAction(collection,client,fixture.item._id,fixture.input),{code:expire?'REVIEW_REVISION_CONFLICT':'REVIEW_ACTION_PENDING'});
   await original({_id:fixture.hour._id},{$set:{'sourceRecords.0.raw.value':12.5}});
   release();const result=await a;
   const saved=await collection.findOne({_id:fixture.item._id});
   if(expire) {
    assert.ok(['REVIEW_ACTION_PENDING','REVIEW_REVISION_CONFLICT'].includes(result.error?.code));assert.equal(saved.reviewState,'source_changed');
    assert.equal((await client.workflow({operation:'tasks.list',processId:saved.steps.processId})).data.length,1);
   }else {assert.equal(result.value?.status,'verified');assert.equal(saved.status,'verified');}
   checks.push(expire?'expired-fence-stops-ABA-Core-side-effect':'live-fence-serializes-ABA-reservation');
  }finally{release();Hour.collection.updateOne=original;}
 }
 const badHours=[];
 for(let i=0;i<101;i++){
  const from=new Date(-Date.now()-i*3600000);
  badHours.push({from,to:new Date(+from+3600000),sourceRecords:[{raw:{value:-1}}],sourceReviewPending:true});
 }
 await Hour.collection.insertMany(badHours);
 const behind=await source();await Hour.updateOne({_id:behind._id},{$set:{sourceReviewPending:true}});
 const firstScan=await replayPendingReviews(db,ruleEnv),secondScan=await replayPendingReviews(db,ruleEnv);
 assert.equal(firstScan.evaluated+secondScan.evaluated,1);
 assert.equal((await Hour.collection.findOne({_id:behind._id})).sourceReviewPending,false);
 checks.push('over-100-poison-hours-do-not-starve-new-valid-hour');
 if (process.argv[2] === '--output' && process.argv[3]) writeFileSync(process.argv[3],JSON.stringify({status:'passed',checks},null,2),{flag:'wx'});console.log(JSON.stringify({checks}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>mongoose.disconnect());
