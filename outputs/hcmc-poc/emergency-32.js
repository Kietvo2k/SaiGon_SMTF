// Xe khẩn cấp dùng một slot ô tô thật của sim: giữ IDM, tuyến, khóa nút và kiểm tra va chạm.
// Ưu tiên cuốn chiếu ở nút sắp tới; không teleport, không cho xe vượt đỏ hoặc xuyên hàng chờ.
export const EMERGENCY_KINDS_32 = Object.freeze({ ambulance: 'Xe cứu thương', fire: 'Xe chỉ huy cứu hỏa', police: 'Xe cảnh sát' });
// demo-v2 (P1-7): hệ số ưu tiên cứu thương > cứu hỏa > công an — weight càng cao giữ pha ưu tiên càng lâu.
export const PRIORITY_WEIGHTS_32 = Object.freeze({ ambulance: 3, fire: 2, police: 1 });
export function priorityWeightOf32(kind) {
  const weight = PRIORITY_WEIGHTS_32[kind];
  if (!Number.isFinite(weight)) throw new RangeError('Loại xe khẩn cấp không hợp lệ');
  return weight;
}
// Thời gian giữ pha ưu tiên: 9 s nền + 3 s mỗi điểm ưu tiên (cứu thương 18 s, cứu hỏa 15 s, công an 12 s).
export function priorityHoldSOf32(kind) {
  return 9 + 3 * priorityWeightOf32(kind);
}
const OWNER = 'EMERGENCY-32';
export function createEmergency32({ sim, net, controller, nodeMap = [], visual = null, vms = null, boards = [] } = {}) {
  const controlled = new Map(nodeMap.map(m => [net.G.nodes.findIndex(n => Number(n.id) === Number(m.osm_id)), m.node_id]));
  let trip = null, last = { active: false, label: 'Chưa điều xe khẩn cấp' }, reserved = null, lastRequest = -Infinity;
  const gates = new Map(), yielded = new Set(), reviewUntil = new Map();
  let vmsBoardId = null;
  const groupOf = l => net.arriveGroup[net.lanes.st[l]];
  // Bảng VMS gần nút sắp tới hiện "mở làn" cho xe khẩn cấp (đúng P1-7); đổi nút thì dời bảng.
  const nodeMapRows = new Map(nodeMap.map(m => [Number(m.osm_id), m]));
  const announceVms = node => {
    if (!vms || !boards.length) return;
    const row = nodeMapRows.get(Number(net.G.nodes[node]?.id));
    if (!row) return;
    const near = boards.map(b => ({ b, d: Math.hypot((b.x ?? 0) - (row.x ?? 0), (b.z ?? 0) - (row.z ?? 0)) }))
      .sort((p, q) => p.d - q.d)[0];
    if (!near) return;
    if (vmsBoardId && vmsBoardId !== near.b.id) vms.clearFlood(vmsBoardId);
    vmsBoardId = near.b.id;
    vms.setFlood(vmsBoardId, ['MỞ LÀN CHO XE CẤP CỨU', EMERGENCY_KINDS_32[trip.kind].toUpperCase()]);
  };
  const clearVms = () => { if (vmsBoardId && vms) vms.clearFlood(vmsBoardId); vmsBoardId = null; };
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
    trip = null; release(); clearVms(); if (visual) visual.hide();
    return status();
  }
  // Vị trí tâm làn theo hình học thật (net.geo) — dùng để xếp hạng xe gần trạm/điểm sự cố.
  function laneCentre(l, s, out) {
    const edge = net.lanes.edge[l], len = net.lanes.length[l] || 1, dir = net.lanes.dir[l];
    const off = net.geo?.off?.[edge], n = net.E?.[edge]?.c ? net.E[edge].c.length / 2 : 0;
    if (off != null && n > 1 && net.geo?.s && net.geo?.x && net.geo?.z) {
      const along = Math.max(0, Math.min(len, dir > 0 ? s : len - s));
      const planar = along * (net.geo.planar?.[edge] || len) / len;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (net.geo.s[off + mid] <= planar) lo = mid; else hi = mid; }
      const span = Math.max(1e-6, net.geo.s[off + hi] - net.geo.s[off + lo]);
      const t = Math.max(0, Math.min(1, (planar - net.geo.s[off + lo]) / span));
      out.x = net.geo.x[off + lo] + (net.geo.x[off + hi] - net.geo.x[off + lo]) * t;
      out.z = net.geo.z[off + lo] + (net.geo.z[off + hi] - net.geo.z[off + lo]) * t;
      return out;
    }
    const from = net.G.nodes[net.lanes.from[l]], to = net.G.nodes[net.lanes.to[l]];
    const t = Math.max(0, Math.min(1, (dir > 0 ? s : len - s) / len));
    out.x = from.x + (to.x - from.x) * t;
    out.z = from.z + (to.z - from.z) * t;
    return out;
  }
  function start({ kind = 'ambulance', origin = null, target = null } = {}) {
    if (!Object.hasOwn(EMERGENCY_KINDS_32, kind)) throw new RangeError('Loại xe khẩn cấp không hợp lệ');
    sim.finishStep();
    // Tận dụng pool xe, chọn xe trước vạch đủ xa; không đổi lộ trình hoặc kích thước trong mô hình va chạm.
    const ox = origin && Number.isFinite(origin.x) ? origin.x : null;
    const oz = origin && Number.isFinite(origin.z) ? origin.z : null;
    const radius = origin && Number.isFinite(origin.radius) ? Math.max(0, origin.radius) : 450;
    const tx = target && Number.isFinite(target.x) ? target.x : null;
    const tz = target && Number.isFinite(target.z) ? target.z : null;
    const at = {}, probe = {}, candidates = [];
    for (let i = 0; i < sim.N; i++) {
      if (sim.kind[i] !== 1 || (!sim.active[i] && (!sim.activateEmergencyVehicle || !sim.isEligible(i)))) continue;
      // Điểm cần tới ở mặt đất: không điều xe đang trên cầu vượt/hầm sang hiện trường.
      if (target && target.ground !== false && net.bridgeEdge && net.bridgeEdge[net.lanes.edge[sim.lane[i]]]) continue;
      const next = upcoming(i);
      const reachable = next ? next.distance >= 40 : false;
      // Xe gần trạm nhưng chưa tới nút có đèn trong 4 làn vẫn được điều (chạy theo dòng, không ưu tiên).
      if (reachable || ox !== null) {
        const base = (!sim.active[i] ? 300 : (sim.v?.[i] ?? 1) < 0.5 ? 500 : 0)
          + (next ? (controlled.get(next.n) === 'HX-01' ? 0 : 50) + next.distance : 900);
        // Có trạm: chỉ nhận xe trong bán kính trạm (không lấy xe ở tít ngoài làm "xe từ trạm").
        let od = 0, score = base;
        if (ox !== null) {
          laneCentre(sim.lane[i], sim.s[i], at);
          od = Math.hypot(at.x - ox, at.z - oz);
          if (od > radius) continue;
          score += Math.min(2000, od);
        }
        // Có điểm cần tới (tai nạn): chỉ nhận xe có tuyến đi qua gần điểm đó (đo theo hình học làn).
        if (tx !== null) {
          const targetEdge = Number.isInteger(target.lane) ? net.lanes.edge[target.lane] : null;
          const route = [sim.lane[i], ...Array.from(sim.path.slice(i * 4, i * 4 + 4)).filter(x => x >= 0)];
          if (target.ground !== false && net.bridgeEdge && route.some(lane => net.bridgeEdge[net.lanes.edge[lane]])) continue;
          if (targetEdge !== null && net.lanes.edge[sim.lane[i]] === targetEdge && Number.isFinite(target.s) && sim.s[i] > target.s + 15) continue;
          let near = Infinity;
          for (const lane of route) {
            const len = net.lanes.length[lane];
            for (const s of (lane === sim.lane[i] ? [sim.s[i], len] : [0, len / 2, len])) {
              laneCentre(lane, s, probe);
              const d = Math.hypot(probe.x - tx, probe.z - tz);
              if (d < near) near = d;
            }
          }
          if (!Number.isFinite(near) || (Number.isFinite(target.maxM) && near > target.maxM)) continue;
          // Xe cùng làn bị chặn có thể dừng sau hàng chờ; ưu tiên làn song song/đối diện sẽ đi ngang hiện trường.
          if (Number.isInteger(target.lane) && route.includes(target.lane)) score += 600;
          score += Math.min(2000, near) * 10;
        }
        candidates.push({i, score, nearOrigin: ox === null || od <= radius, od});
      }
    }
    candidates.sort((a,b) => (a.nearOrigin === b.nearOrigin ? 0 : a.nearOrigin ? -1 : 1) || a.score - b.score || a.i - b.i);
    if (!candidates.length) throw new Error(ox !== null
      ? 'Không có xe phù hợp trong bán kính trạm; chờ xe tới rồi thử lại'
      : 'Không có xe ô tô phù hợp trước nút; tăng mật độ hoặc chờ xe tới rồi thử lại');
    stop(); yielded.clear();
    const picked = candidates.find(c => sim.active[c.i] || sim.activateEmergencyVehicle(c.i));
    if (!picked) throw new Error('Chưa có chỗ trống an toàn để điều xe; chờ giao lộ thông rồi thử lại');
    const slot = picked.i;
    trip = { slot, kind, gen: sim.gen[slot], started: sim.counters.t, lane: sim.lane[slot], s: sim.s[slot], distance: 0, passed: 0, blocked: false,
      origin: origin ? { id: origin.id || null, label: origin.label || null, x: ox, z: oz, lane: Number.isInteger(origin.lane) ? origin.lane : null } : null };
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
      controller.overridePhase(target.n, target.group, priorityHoldSOf32(trip.kind), OWNER, EMERGENCY_KINDS_32[trip.kind]);
      announceVms(target.n);
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
      weight: priorityWeightOf32(trip.kind), hold_s: priorityHoldSOf32(trip.kind),
      label: EMERGENCY_KINDS_32[trip.kind], distance_m: Math.round(trip.distance), passed: trip.passed,
      yielded: yielded.size, yield_lanes: gates.size, node_id: reserved === null ? null : controlled.get(reserved), blocked: trip.blocked,
      origin: trip.origin ? { ...trip.origin } : null } : { ...last };
  }
  function reviewContext(rec) {
    const match = /^V-(\d+)$/.exec(rec.vehicle_id || '');
    const i = match ? Number(match[1]) - 1 : -1, review = reviewUntil.get(i);
    return review && review.gen === sim.gen[i] && review.until >= sim.counters.t ? {priority_flag: true, priority_reason: 'Nghi nhường xe ưu tiên — xe khẩn cấp hoặc xe nhường tại thời điểm ghi nhận'} : {};
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
  // Nhãn nổi để người xem biết đây là xe ưu tiên, không lẫn với xe tải đỏ trên làn.
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 128;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false }));
  labelSprite.position.set(0, 4.6, 0); labelSprite.scale.set(7.4, 1.85, 1); labelSprite.renderOrder = 18; labelSprite.name = 'emergency-label-32';
  group.add(labelSprite);
  let labelKind = '';
  const drawLabel = kind => {
    if (kind === labelKind) return;
    labelKind = kind;
    const ctx = labelCanvas.getContext('2d'), w = labelCanvas.width, h = labelCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const text = kind === 'fire' ? 'CỨU HỎA' : kind === 'police' ? 'CÔNG AN' : 'CỨU THƯƠNG';
    const accent = kind === 'fire' ? '#ff6b5e' : kind === 'police' ? '#6ea8ff' : '#ffd23f';
    ctx.fillStyle = 'rgba(8,26,32,.94)'; ctx.strokeStyle = accent; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(8, 8, w - 16, h - 16, 24) : ctx.rect(8, 8, w - 16, h - 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent; ctx.font = '800 44px system-ui,Segoe UI,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    labelTexture.needsUpdate = true;
  };
  const pose = {};
  return { hide(){group.visible=false;},
    draw(slot,kind,t) {
      traffic.poseOf(slot,pose); group.position.set(pose.x,pose.y,pose.z);
      group.rotation.set(0,-Math.atan2(pose.tz,pose.tx),0); group.visible=true;
      body.material.color.setHex(kind==='fire'?0xd63832:kind==='police'?0x194f86:0xf4f6f7);
      stripe.visible=kind!=='ambulance'; for(const part of medical)part.visible=kind==='ambulance';
      drawLabel(kind);
      red.material.emissive.setHex(Math.floor(t*4)%2?0xff2424:0x000000);
      blue.material.emissive.setHex(Math.floor(t*4)%2?0x000000:0x247eff);
    }, dispose(){group.removeFromParent(); for(const m of mats)m.dispose(); for(const g of geometries)g.dispose(); labelTexture.dispose(); labelSprite.material.dispose();} };
}
