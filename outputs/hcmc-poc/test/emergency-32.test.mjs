import { test } from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../emergency-32.js').catch(() => null);

function fixture() {
  const net = { G: { nodes: [{id:10},{id:11},{id:12}] }, Rz: [10,10,10], signal: [0,1,0], arriveGroup: [0,1,0],
    lanes: { to:[1,1,2], from:[0,2,1], length:[200,200,100], st:[0,1,2] } };
  const sim = { N:3, active:[1,1,1], kind:[1,1,0], lane:[0,1,0], s:[100,100,20], gen:[0,0,0],
    len:[4.3,4.3,1.9], path:new Int32Array([2,-2,-2,-2,2,-2,-2,-2,2,-2,-2,-2]), counters:{t:0},
    finishStep(){}, setEmergencyPolicy(p){this.policy=p;} };
  const overrides = new Map(), calls=[];
  const controller={ stateOf(n){return {override:overrides.get(n)||null,phases:[]};},
    overridePhase(n,g,d,by,reason){ calls.push({n,g,d,by}); if(g===null) overrides.delete(n); else overrides.set(n,{group:g,by,reason,until_t_sim:sim.counters.t+d}); } };
  return {net,sim,controller,overrides,calls};
}
test('xe khẩn cấp chọn xe thật, giữ tuyến và yêu cầu đúng nhóm; hướng xung đột nhường',()=>{
  assert.ok(mod,'Thiếu mô phỏng xe khẩn cấp');
  const f=fixture(), e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  const st=e.start({kind:'ambulance'});
  assert.equal(st.slot,0); assert.equal(st.kind,'ambulance'); assert.equal(st.active,true);
  assert.equal(f.sim.policy,e); e.beforeStep(0);
  assert.equal(f.calls.at(-1).g,0); assert.equal(e.yieldStop(1,1,100),182);
  assert.equal(e.yieldStop(1,1,179.85),182,'xe chạm điểm nhường phải tiếp tục đứng chờ');
  assert.equal(e.yieldStop(2,0,20),Infinity); assert.equal(e.status().yielded,1);
  assert.equal(e.reviewContext({vehicle_id:'V-000001'}).priority_flag,true);
  assert.equal(e.reviewContext({vehicle_id:'V-000002'}).priority_flag,true,'xe đang nhường cũng cần xem xét');
  f.sim.gen[1]++; assert.deepEqual(e.reviewContext({vehicle_id:'V-000002'}),{},'không gắn cờ sang thế hệ xe mới');
  e.stop(); assert.equal(e.status().active,false); assert.equal(f.overrides.size,0);
  assert.equal(e.yieldStop(1,1,100),Infinity);
});
test('không cướp ghi đè cán bộ; không xóa ghi đè của người khác khi dừng',()=>{
  assert.ok(mod); const f=fixture(); f.overrides.set(1,{group:1,by:'commander1'});
  const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]}); e.start(); e.beforeStep(1);
  assert.equal(f.calls.length,0); assert.equal(e.status().blocked,true);
  e.stop(); assert.equal(f.overrides.get(1).by,'commander1');
});
test('ghi đè cán bộ ở nút khác cùng cụm cũng được tôn trọng; xe giữ khóa phải được thoát',()=>{
  assert.ok(mod); const f=fixture(); f.net.signalPlan={clusters:[{nodeIds:[1,2]}]};
  f.overrides.set(2,{group:1,by:'commander1'});
  const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]}); e.start();
  assert.equal(f.calls.length,0); assert.equal(e.status().blocked,true);
  f.overrides.clear(); e.beforeStep(2); f.sim.holdsNode=()=>true;
  assert.equal(e.yieldStop(1,1,100),Infinity,'không giữ xe đang chiếm khóa nút');
});
test('xe đã tái sinh hoặc hết thời gian phải nhả ưu tiên; loại lạ và không có xe không báo chạy',()=>{
  assert.ok(mod); const f=fixture(), e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  assert.throws(()=>e.start({kind:'ufo'}),RangeError); e.start({kind:'fire'});
  f.sim.gen[0]++; e.beforeStep(1); assert.equal(e.status().active,false); assert.equal(f.overrides.size,0);
  f.sim.active.fill(0); assert.throws(()=>e.start(),/Không có xe/);
});
test('reset xóa cả cờ xem xét và chuyến; timeout nhả ưu tiên',()=>{
  assert.ok(mod); const f=fixture(), e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  e.start(); assert.equal(e.reviewContext({vehicle_id:'V-000001'}).priority_flag,true);
  e.reset(); assert.deepEqual(e.reviewContext({vehicle_id:'V-000001'}),{}); assert.equal(e.status().active,false);
  e.start(); f.sim.counters.t=241; e.beforeStep(241); assert.equal(e.status().active,false); assert.equal(f.overrides.size,0);
});
test('ưu tiên điều slot đang chuyển động thay vì xe đang kẹt nếu có lựa chọn',()=>{
  assert.ok(mod); const f=fixture(); f.sim.v=[0,3,0];
  const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  assert.equal(e.start().slot,1);
});
test('máy thưa xe có thể kích hoạt một slot an toàn từ pool và trả lại khi dừng',()=>{
  assert.ok(mod); const f=fixture(); f.sim.active.fill(0); f.sim.isEligible=()=>true;
  f.sim.activateEmergencyVehicle=i=>{f.sim.active[i]=1;return true;};
  let released=-1; f.sim.releaseEmergencyVehicle=i=>{released=i;f.sim.active[i]=0;};
  const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  const st=e.start(); assert.equal(st.active,true); e.stop(); assert.equal(released,st.slot); assert.equal(f.sim.active[st.slot],0);
});

test('demo-v2 (P1-7): hệ số ưu tiên cứu thương > cứu hỏa > công an; giữ pha theo hệ số',()=>{
  assert.ok(mod);
  assert.equal(mod.priorityWeightOf32('ambulance'),3);
  assert.equal(mod.priorityWeightOf32('fire'),2);
  assert.equal(mod.priorityWeightOf32('police'),1);
  assert.throws(()=>mod.priorityWeightOf32('ufo'),RangeError);
  assert.equal(mod.priorityHoldSOf32('ambulance'),18);
  assert.equal(mod.priorityHoldSOf32('fire'),15);
  assert.equal(mod.priorityHoldSOf32('police'),12);
  // Giữ pha gọi đúng thời gian theo loại: xe cứu thương giữ 18 s.
  const f=fixture(); const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  e.start({kind:'ambulance'}); e.beforeStep(0);
  assert.equal(f.calls.at(-1).d,18);
  const e2=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  e2.start({kind:'police'}); e2.beforeStep(0);
  assert.equal(f.calls.at(-1).d,12);
  assert.equal(e.status().weight,3); assert.equal(e.status().hold_s,18);
});

test('demo-v2 (P1-7): nhãn cờ ghi đúng "Nghi nhường xe ưu tiên"',()=>{
  assert.ok(mod); const f=fixture(); const e=mod.createEmergency32({...f,nodeMap:[{osm_id:11,node_id:'HX-01'}]});
  e.start(); e.beforeStep(0);
  const rec=e.reviewContext({vehicle_id:'V-000001'});
  assert.equal(rec.priority_flag,true);
  assert.match(rec.priority_reason,/Nghi nhường xe ưu tiên/);
});

test('demo-v2 (P1-7): bảng VMS gần nút hiện mở làn khi ưu tiên, xoá khi dừng',()=>{
  assert.ok(mod); const f=fixture();
  const vmsCalls=[]; let flood=new Map();
  const vms={ setFlood:(id,lines)=>{vmsCalls.push(['set',id,...lines]); flood.set(id,lines);},
    clearFlood:id=>{vmsCalls.push(['clear',id]); flood.delete(id);} };
  const boards=[{id:'VMS-01',x:5,z:5},{id:'VMS-02',x:500,z:500}];
  const nodeMap=[{osm_id:11,node_id:'HX-01',x:6,z:6}];
  const e=mod.createEmergency32({...f,nodeMap,vms,boards});
  e.start({kind:'ambulance'}); e.beforeStep(0);
  const setCall=vmsCalls.find(c=>c[0]==='set');
  assert.ok(setCall,'phải có lệnh đặt bảng VMS khi bắt đầu ưu tiên');
  assert.equal(setCall[1],'VMS-01','chọn bảng gần nút đang ưu tiên');
  assert.match(setCall.join(' '),/MỞ LÀN CHO XE CẤP CỨU/);
  assert.match(setCall.join(' '),/XE CỨU THƯƠNG/);
  e.stop();
  assert.ok(vmsCalls.some(c=>c[0]==='clear'&&c[1]==='VMS-01'),'dừng ưu tiên phải xoá bảng');
  assert.equal(flood.size,0);
});
