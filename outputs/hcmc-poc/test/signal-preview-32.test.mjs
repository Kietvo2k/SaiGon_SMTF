import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewSignals32,frozenQueues32} from '../signal-preview-32.js';
import {createSignalController32} from '../traffic-controller-32.js';
import {scaleVehicleBox32,isMainVehicleCamera32} from '../vehicle-bounds-32.js';

function fixture() {
  const net={G:{nodes:[{id:366390689},{id:2}]},signal:[1,0],signalOffset:[0,0],Rz:[10,10],
    lanes:{to:[0,0,1],from:[1,1,0],st:[0,1,2],length:[100,100,100]},arriveGroup:[0,1,0],
    signalPlan:{signalNodes:[0],clusters:[{cluster_id:'HX-C1',nodeIds:[0],offset_s:0}],internalSt:new Set()}};
  const sim={N:2,active:Uint8Array.from([1,1]),lane:Int32Array.from([0,1]),s:Float32Array.from([75,75]),v:Float32Array.from([0,0]),counters:{t:0}};
  const controller=createSignalController32({net,sim,mode:'fixed'});
  return {net,sim,controller,rows:[{id:'HX-C1',nodeIds:['HX-01'],indexes:[0]}]};
}
test('dự báo fixed 60s có phân bổ đúng 34/16, không đổi controller hoặc xe thật',()=>{
  const f=fixture(), before=f.controller.stateHash(), arrays=JSON.stringify(f.sim);
  const out=previewSignals32(f), row=out.rows[0];
  assert.deepEqual(row.allocation,[34,16]); assert.deepEqual(row.queue,[1,1]);
  assert.equal(row.now.length,2);
  for(const n of row.now){assert.ok(['red','yellow','green'].includes(n.phase));assert.ok(Number.isFinite(n.remain_s));}
  assert.equal(row.now[0].phase,'green'); assert.equal(row.now[1].phase,'red'); assert.equal(row.now[1].greenAt_s,27);
  for(let t=0;t<60;t+=.1) assert.ok(row.segments.filter(s=>s.phase==='green' && s.start<=t && s.end>t).length<=1);
  assert.equal(f.controller.stateHash(),before); assert.equal(JSON.stringify(f.sim),arrays);
  for(const g of [0,1]) assert.equal(row.segments.filter(s=>s.group===g).reduce((sum,s)=>sum+s.end-s.start,0),60);
});
test('dự báo smart đáp ứng hàng chờ lệch và không tính lại nhánh nội bộ',()=>{
  const f=fixture(); f.sim.active[0]=0; f.controller.setMode('smart',{immediate:true});
  const a=previewSignals32(f).rows[0]; assert.ok(a.allocation[1]>a.allocation[0]);
  f.net.signalPlan.internalSt.add(1); assert.equal(frozenQueues32(f.net,f.sim).get(0)[1].count,0);
});
test('khung bao theo chiều dài/rộng/cao mà vẫn giữ vị trí và hướng pose',()=>{
  const m=Float32Array.from([0,0,1,0,0,1,0,0,-1,0,0,0,10,2,30,1]);
  scaleVehicleBox32(m,0,4.3,1.8,1.6);
  assert.ok(Math.abs(m[2]-4.3)<1e-6); assert.ok(Math.abs(m[5]-1.6)<1e-6); assert.ok(Math.abs(m[8]+1.8)<1e-6);
  assert.deepEqual(Array.from(m.slice(12)),[10,2,30,1]);
});
test('camera bằng chứng không được xóa khung bao của camera chính',()=>{
  const main={name:'main'}, evidence={name:'evidence'};
  assert.equal(isMainVehicleCamera32(main,main),true);
  assert.equal(isMainVehicleCamera32(evidence,main),false);
  assert.equal(isMainVehicleCamera32(null,main),false);
});
