// SPDX-License-Identifier: GPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readRule,reviewReason}=require('../integrations/sirocco/review-rules');
test('quy tắc từ chối cấu hình mơ hồ và mốc không hợp lệ',()=>{
 for(const rule of [{}, {version:'v1',parameter:'pm25',unit:'ug/m3'},
  {version:'v1',parameter:'pm25',unit:'ug/m3',min:20,max:10},
  {version:'v1',parameter:'pm25',unit:'ug/m3',maxAgeSeconds:-1}])
  assert.throws(()=>readRule({SIROCCO_REVIEW_RULE:JSON.stringify(rule)}));
});
test('mốc kiểm tra chỉ áp dụng đúng thông số và đơn vị, không tạo việc cho số đo hợp lệ',()=>{
 const rule=readRule({SIROCCO_REVIEW_RULE:JSON.stringify({version:'v1',parameter:'pm25',unit:'ug/m3',max:20,maxAgeSeconds:300})});
 const snapshot={parameter:'pm25',unit:'ug/m3',value:15,ageAtCollectionSeconds:60};
 assert.equal(reviewReason(snapshot,rule),null);
 assert.equal(reviewReason({...snapshot,unit:'mg/m3',value:100},rule),null);
 assert.match(reviewReason({...snapshot,value:25},rule),/Cần người xác minh/);
 assert.match(reviewReason({...snapshot,ageAtCollectionSeconds:600},rule),/600 giây/);
});
