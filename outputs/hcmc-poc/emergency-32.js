// Xe khẩn cấp dùng một slot ô tô thật của sim: giữ IDM, tuyến, khóa nút và kiểm tra va chạm.
// Ưu tiên cuốn chiếu ở nút sắp tới; không teleport, không cho xe vượt đỏ hoặc xuyên hàng chờ.
export const EMERGENCY_KINDS_32 = Object.freeze({ ambulance: 'Xe cứu thương', fire: 'Xe chỉ huy cứu hỏa', police: 'Xe cảnh sát' });
const OWNER = 'EMERGENCY-32';
export function createEmergency32({ sim, net, controller, nodeMap = [], visual = null } = {}) {
  const controlled = new Map(nodeMap.map(m => [net.G.nodes.findIndex(n => Number(n.id) === Number(m.osm_id)), m.node_id]));
  let trip = null, last = { active: false, label: 'Chưa điều xe khẩn cấp' }, reserved = null, lastRequest = -Infinity;
  const gates = new Map(), yielded = new Set(), reviewUntil = new Map();
  const groupOf = l => net.arriveGroup[net.lanes.st[l]];
  function upcoming(i) {
    const route = [sim.lane[i], ...Array.from(sim.path.slice(i * 4, i * 4 + 4)).filter(x => x >= 0)];
    let distance = -sim.s[i];
    for (const lane of route) {
      distance += net.lanes.length[lane]; const n = net.lanes.to[lane];
      if (controlled.has(n)) return {n, group:groupOf(lane), distance};
    }
    return null;
  }
  function release() {
    if (reserved !== null && controller.stateOf(reserved, sim.counters.t).override?.by === OWNER)
      controller.overridePhase(reserved, null, 0, OWNER, 'Kết thúc ưu tiên');
    reserved = null; gates.clear();
  }
  function stop(reason = 'Đã dừng xe khẩn cấp') {
    if (trip) last = { ...status(), active: false, label: reason };
    if (trip && sim.releaseEmergencyVehicle) sim.releaseEmergencyVehicle(trip.slot, trip.gen);
    trip = null; release(); if (visual) visual.hide();
    return status();
  }
  function start({ kind = 'ambulance' } = {}) {
    if (!Object.hasOwn(EMERGENCY_KINDS_32, kind)) throw new RangeError('Loại xe khẩn cấp không hợp lệ');
    sim.finishStep();
    // Tận dụng pool xe, chọn xe trước vạch đủ xa; không đổi lộ trình hoặc kích thước trong mô hình va chạm.
    const candidates = [];
    for (let i = 0; i < sim.N; i++) {
      if (sim.kind[i] !== 1 || (!sim.active[i] && (!sim.activateEmergencyVehicle || !sim.isEligible(i)))) continue;
      const next = upcoming(i);
      if (next && next.distance >= 40)
        candidates.push({i, score: (!sim.active[i] ? 300 : (sim.v?.[i] ?? 1) < 0.5 ? 500 : 0) + (controlled.get(next.n) === 'HX-01' ? 0 : 50) + next.distance});
    }
    candidates.sort((a,b) => a.score - b.score || a.i - b.i);
    if (!candidates.length) throw new Error('Không có xe ô tô phù hợp trước nút; tăng mật độ hoặc chờ xe tới rồi thử lại');
    stop(); yielded.clear();
    const picked = candidates.find(c => sim.active[c.i] || sim.activateEmergencyVehicle(c.i));
    if (!picked) throw new Error('Chưa có chỗ trống an toàn để điều xe; chờ giao lộ thông rồi thử lại');
    const slot = picked.i;
    trip = { slot, kind, gen: sim.gen[slot], started: sim.counters.t, lane: sim.lane[slot], s: sim.s[slot], distance: 0, passed: 0, blocked: false };
    lastRequest = -Infinity; beforeStep(sim.counters.t); return status();
  }
  function beforeStep(t) {
    for (const [i, review] of reviewUntil) if (review.until < t || review.gen !== sim.gen[i]) reviewUntil.delete(i);
    if (!trip) return;
    const i = trip.slot, l = sim.lane[i];
    if (!sim.active[i] || sim.gen[i] !== trip.gen) { stop('Xe kết thúc tuyến hoặc tái sinh; đã nhả ưu tiên'); return; }
    if (l !== trip.lane) {
      trip.distance += Math.max(0, net.lanes.length[trip.lane] - trip.s) + sim.s[i];
      if (controlled.has(net.lanes.to[trip.lane])) trip.passed++;
    } else trip.distance += Math.max(0, sim.s[i] - trip.s);
    trip.lane = l; trip.s = sim.s[i];
    if (trip.passed >= 2 || t - trip.started >= 240) { stop(trip.passed >= 2 ? 'Đã qua 2 nút; kết thúc chuyến ưu tiên' : 'Hết 240 giây sim; đã nhả ưu tiên'); return; }
    reviewUntil.set(i, {until:t + 8, gen:sim.gen[i]});
    // Tìm nút có điều khiển gần nhất trên tuyến hiện tại + bốn làn đã lập sẵn.
    const next = upcoming(i), target = next && next.distance <= 250 ? next : null;
    if (!target) { release(); return; }
    if (reserved !== target.n) { release(); lastRequest = -Infinity; }
    const nodes = new Set(net.signalPlan?.clusters?.find(c => c.nodeIds.includes(target.n))?.nodeIds || [target.n]);
    const existing = controller.stateOf(target.n, t).override;
    trip.blocked = [...nodes].some(n => { const ov=controller.stateOf(n,t).override; return ov && ov.by !== OWNER; });
    if (trip.blocked) { release(); return; } // Ghi đè của cán bộ có quyền cao hơn tự động.
    reserved = target.n;
    if (t - lastRequest >= 5 || !existing || existing.group !== target.group) {
      controller.overridePhase(target.n, target.group, 15, OWNER, EMERGENCY_KINDS_32[trip.kind]);
      lastRequest = t;
    }
    gates.clear();
    for (let lane = 0; lane < net.lanes.to.length; lane++)
      if (nodes.has(net.lanes.to[lane]) && groupOf(lane) !== target.group)
        gates.set(lane, Math.max(0, net.lanes.length[lane] - (net.Rz[net.lanes.to[lane]] || 0) - 8));
  }
  function yieldStop(i, l, s) {
    const gate = gates.get(l);
    if (sim.holdsNode?.(i, net.lanes.to[l])) return Infinity;
    // Xe đã vào vùng nút tiếp tục thoát; không kéo lùi xe hay tạo vật cản sau lưng.
    if (!trip || i === trip.slot || gate === undefined || s + sim.len[i] / 2 > gate + 0.05) return Infinity;
    if (gate - s <= 100) { yielded.add(i); reviewUntil.set(i, {until:sim.counters.t + 8, gen:sim.gen[i]}); }
    return gate;
  }
  function status() {
    return trip ? { active: true, slot: trip.slot, vehicle_id: `V-${String(trip.slot + 1).padStart(6,'0')}`, kind: trip.kind,
      label: EMERGENCY_KINDS_32[trip.kind], distance_m: Math.round(trip.distance), passed: trip.passed,
      yielded: yielded.size, yield_lanes: gates.size, node_id: reserved === null ? null : controlled.get(reserved), blocked: trip.blocked } : { ...last };
  }
  function reviewContext(rec) {
    const match = /^V-(\d+)$/.exec(rec.vehicle_id || '');
    const i = match ? Number(match[1]) - 1 : -1, review = reviewUntil.get(i);
    return review && review.gen === sim.gen[i] && review.until >= sim.counters.t ? {priority_flag: true, priority_reason: 'Xe khẩn cấp hoặc đang nhường xe khẩn cấp; cần cán bộ xem xét'} : {};
  }
  const api = {start, stop, beforeStep, yieldStop, status, reviewContext,
    reset() { stop('Đã đặt lại mô phỏng'); reviewUntil.clear(); yielded.clear(); },
    currentSlot: () => trip ? trip.slot : -1,
    draw() { if (trip && visual) visual.draw(trip.slot, trip.kind, sim.counters.t); },
    dispose() { stop(); sim.setEmergencyPolicy(null); if (visual) visual.dispose(); }};
  sim.setEmergencyPolicy(api); return api;
}

export function createEmergencyVisual32({ THREE, scene, traffic }) {
  const group = new THREE.Group(); group.name = 'emergency-vehicle-32'; group.visible = false; scene.add(group);
  const mats = [], geometries = [];
  const box = (size, at, color) => {
    const g = new THREE.BoxGeometry(...size), m = new THREE.MeshStandardMaterial({color, roughness:.55});
    geometries.push(g); mats.push(m); const mesh = new THREE.Mesh(g,m); mesh.position.set(...at); group.add(mesh); return mesh;
  };
  // Nằm trong footprint 4,3 × 1,8 m của ô tô hiện có; không giả xe tải dài bằng hình vẽ.
  const body = box([4.1,1.15,1.7],[0,.85,0],0xf4f6f7);
  box([1.4,.55,1.55],[.5,1.55,0],0x295565);
  for (const x of [-1.25,1.25]) for (const z of [-.82,.82]) box([.7,.65,.18],[x,.35,z],0x172126);
  const red = box([.55,.22,.3],[0,1.97,-.37],0xe93e40), blue = box([.55,.22,.3],[0,1.97,.37],0x247eff);
  const medical = [], stripe = box([3.6,.16,1.74],[0,.86,0],0xffffff);
  for (const z of [-.862,.862]) {
    medical.push(box([1.05,.24,.035],[-.8,1.12,z],0xe43e40), box([.24,.8,.035],[-.8,1.12,z],0xe43e40));
  }
  const pose = {};
  return { hide(){group.visible=false;},
    draw(slot,kind,t) {
      traffic.poseOf(slot,pose); group.position.set(pose.x,pose.y,pose.z);
      group.rotation.set(0,-Math.atan2(pose.tz,pose.tx),0); group.visible=true;
      body.material.color.setHex(kind==='fire'?0xd63832:kind==='police'?0x194f86:0xf4f6f7);
      stripe.visible=kind!=='ambulance'; for(const part of medical)part.visible=kind==='ambulance';
      red.material.emissive.setHex(Math.floor(t*4)%2?0xff2424:0x000000);
      blue.material.emissive.setHex(Math.floor(t*4)%2?0x000000:0x247eff);
    }, dispose(){group.removeFromParent(); for(const m of mats)m.dispose(); for(const g of geometries)g.dispose();} };
}
