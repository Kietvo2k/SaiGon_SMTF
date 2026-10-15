// scenarios-32.js — ba kịch bản bấm-là-chạy của app smart (M5a) + "none" để dừng.
//   peak-hang-xanh : giờ cao điểm 17:30 (đặt đồng hồ, nhu cầu 100 % khu Bắc; pool dựng sẵn bằng PEAK_HANG_XANH_DEMAND).
//   lane-block     : xe hỏng đứng yên trên làn phải Điện Biên Phủ, cách vạch dừng HX-01 ~120 m; làn đó bị chắn N phút (sim).
//   flood-nhc      : đoạn Nguyễn Hữu Cảnh trong đa giác ngập cố định; tốc độ còn 20 %, đoạn sâu đóng (lộ trình không chọn),
//                    xe tuân thủ tránh đoạn ngập (routeBias), bảng VMS gần nhất hiện cảnh báo ngập.
// Thuần JS (không DOM/THREE trong logic); THREE và DOM chỉ nạp khi gọi mountScenarioPanel32 / createBlockProps32.
// Mọi vị trí theo hệ tọa độ cảnh (ROAD_GRAPH_31). Nhãn tiếng Việt, không chữ cấm.
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { roadNameOf32 } from './heat-live-32.js?v=32a';

export const SCENARIOS_32_VERSION = 'scenarios-32a';
export const SCENARIO_KEYS_32 = Object.freeze(['none', 'peak-hang-xanh', 'lane-block', 'flood-nhc']);
export const SCENARIO_LABELS_32 = Object.freeze({
  none: 'Dừng kịch bản',
  'peak-hang-xanh': 'Cao điểm 17:30 · Hàng Xanh',
  'lane-block': 'Xe hỏng chặn làn · Điện Biên Phủ',
  'flood-nhc': 'Ngập · Nguyễn Hữu Cảnh'
});
export const PEAK_CLOCK_32 = Object.freeze({ hour: 17, minute: 30 });
export const BLOCK_MIN_DEFAULT_32 = 10;          // phút sim (mặc định)
export const BLOCK_MIN_CHOICES_32 = Object.freeze([5, 10, 15]);
export const BLOCK_DIST_M_32 = 120;              // m: vị trí xe hỏng trước vạch dừng HX-01
export const BLOCK_CAR_HALF_M_32 = 2.2;          // m: nửa chiều dài xe hỏng (mép sau = tâm − nửa chiều dài)
export const BLOCK_HX_NODE_32 = 'HX-01';
export const BLOCK_ROAD_32 = 'Điện Biên Phủ';
// Đa giác ngập cố định (tọa độ cảnh): 16 đỉnh xấp xỉ đường tròn bán kính 350 m quanh (1000, −2000), đoạn sâu: r = 160 m.
export const FLOOD_CENTRE_32 = Object.freeze([1000, -2000]);
export const FLOOD_RADIUS_M_32 = 350;
export const FLOOD_DEEP_RADIUS_M_32 = 160;
export const FLOOD_POLY_SIDES_32 = 16;
export const FLOOD_ROAD_32 = 'Nguyễn Hữu Cảnh';
export const FLOOD_SPEED_K_32 = 0.2;             // tốc độ mong muốn còn 20 %
export const FLOOD_VMS_RADIUS_M_32 = 1000;       // bảng VMS trong bán kính này hiện cảnh báo ngập (không có → bảng gần nhất)
export const FLOOD_VMS_LINE_32 = 'NGẬP NGUYỄN HỮU CẢNH';

const r1 = v => Math.round(v * 10) / 10;

// Đa giác đều n cạnh xấp xỉ đường tròn: mảng phẳng [x0, z0, x1, z1, …].
export function circlePolygon32(centre = FLOOD_CENTRE_32, radius = FLOOD_RADIUS_M_32, sides = FLOOD_POLY_SIDES_32) {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const a = (2 * Math.PI * k) / sides;
    out.push(centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a));
  }
  return out;
}

// Điểm trong đa giác phẳng (thuật toán số lẻ giao cạnh).
export function inPolygon32(poly, x, z) {
  let c = false;
  for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) {
    const xa = poly[a], za = poly[a + 1], xb = poly[b], zb = poly[b + 1];
    if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) c = !c;
  }
  return c;
}

// Cạnh ngập: mọi cạnh tên Nguyễn Hữu Cảnh có điểm giữa trong đa giác. deep = cạnh có điểm giữa trong đường tròn sâu.
export function findFloodEdges32(net, { road = FLOOD_ROAD_32, poly = circlePolygon32(), deepRadius = FLOOD_DEEP_RADIUS_M_32, centre = FLOOD_CENTRE_32 } = {}) {
  const shallow = [], deep = [];
  for (let e = 0; e < net.NE; e++) {
    if (roadNameOf32(net, e) !== road) continue;
    const c = net.E[e].c, n = c.length / 2;
    const mx = (c[2 * Math.floor((n - 1) / 2)] + c[2 * Math.ceil((n - 1) / 2)]) / 2;
    const mz = (c[2 * Math.floor((n - 1) / 2) + 1] + c[2 * Math.ceil((n - 1) / 2) + 1]) / 2;
    if (!inPolygon32(poly, mx, mz)) continue;
    shallow.push(e);
    if (Math.hypot(mx - centre[0], mz - centre[1]) <= deepRadius) deep.push(e);
  }
  return { shallow, deep };
}

// Vị trí xe hỏng: làn phải BLOCK_ROAD_32 đi vào nút BLOCK_HX_NODE_32, lùi theo chuỗi làn phải tới khi đủ BLOCK_DIST_M_32.
// Trả về {lane, s, x, z, tx, tz} (s = tâm xe hỏng trên làn; mép sau = s − BLOCK_CAR_HALF_M_32) hoặc null.
export function findLaneBlock32(net, nodeMap = [], { dist = BLOCK_DIST_M_32, node = BLOCK_HX_NODE_32, road = BLOCK_ROAD_32 } = {}) {
  const hxRow = (nodeMap || []).find(m => m && m.node_id === node);
  if (!hxRow) return null;
  const idx = net.G.nodes.findIndex(n => Number(n.id) === Number(hxRow.osm_id));
  if (idx < 0) return null;
  const geo = createTrafficGeometry31(net, { jit: [], len: [] });
  // lanes.offset > 0 = lệch về phía PHẢI theo chiều đi (cùng quy ước lanePoint: latv > 0 là phải); lớn hơn = phải hơn.
  const rightOff = l => net.lanes.offset[l];
  const into = new Map();
  for (let l = 0; l < net.NL; l++) { const t = net.lanes.to[l]; let a = into.get(t); if (!a) into.set(t, a = []); a.push(l); }
  const pickRight = (cands) => cands.reduce((best, l) => (best < 0 || rightOff(l) > rightOff(best) ? l : best), -1);
  let cur = pickRight((into.get(idx) || []).filter(l => roadNameOf32(net, net.lanes.edge[l]) === road));
  if (cur < 0) return null;
  let walked = 0;
  for (let guard = 0; guard < 64; guard++) {
    const L = net.lanes.length[cur];
    if (walked + L >= dist) {
      const s = L - (dist - walked);
      const P = geo.lanePoint(cur, s, net.lanes.offset[cur], {});
      const y = geo.laneY(cur, s);
      return { lane: cur, s: r1(s), x: r1(P.x), z: r1(P.z), y: r1(y), tx: P.tx, tz: P.tz, distToNodeM: dist };
    }
    walked += L;
    const nameCur = roadNameOf32(net, net.lanes.edge[cur]);
    const prev = pickRight((into.get(net.lanes.from[cur]) || []).filter(l => roadNameOf32(net, net.lanes.edge[l]) === nameCur));
    if (prev < 0) {   // chuỗi dừng: đặt ở đầu làn hiện có
      const P = geo.lanePoint(cur, 0, net.lanes.offset[cur], {});
      return { lane: cur, s: 0, x: r1(P.x), z: r1(P.z), y: r1(geo.laneY(cur, 0)), tx: P.tx, tz: P.tz, distToNodeM: walked };
    }
    cur = prev;
  }
  return null;
}

// Trạng thái kịch bản. deps: {traffic (api có setRestrictions/setVisibleFraction/sim), clock (có goTo) | null,
// routing (createRouteBias32) | null, vms (createVmsBus32), nodeMap, boards (chooseVmsBoards32), props (3D tùy chọn),
// now () → ms (mặc định Date.now), log}.
export function createScenarios32({ traffic, clock = null, routing = null, vms = null, nodeMap = [], boards = [], props = null, now = () => Date.now(), log = () => {} } = {}) {
  if (!traffic || !traffic.sim) throw new TypeError('createScenarios32 cần traffic.sim');
  const net = traffic.net || (traffic.sim && traffic.sim.net) || null;
  let key = 'none', since = null, sinceMs = 0, startSimT = 0, params = {}, endSimT = null;
  let block = null, flood = null, lastError = null;
  const simT = () => Number(traffic.sim.counters.t) || 0;

  function clearAll() {
    traffic.setRestrictions({});
    if (routing && routing.setExtraAvoid) routing.setExtraAvoid([]);
    if (vms) vms.clearFloodAll();
    if (props && props.hideFlood) props.hideFlood();
    if (props && props.hideBlock) props.hideBlock();
    block = null; flood = null; endSimT = null;
  }

  function startPeak() {
    if (clock && clock.goTo) clock.goTo(PEAK_CLOCK_32.hour, PEAK_CLOCK_32.minute);
    traffic.setVisibleFraction(1);
    return { clock: clock ? `${String(PEAK_CLOCK_32.hour).padStart(2, '0')}:${String(PEAK_CLOCK_32.minute).padStart(2, '0')}` : null };
  }

  function startBlock(p) {
    if (!net) throw new Error('lane-block cần mạng đường');
    const spot = findLaneBlock32(net, nodeMap);
    if (!spot) throw new Error('không tìm thấy làn phải Điện Biên Phủ vào HX-01');
    const minutes = BLOCK_MIN_CHOICES_32.includes(Number(p.minutes)) ? Number(p.minutes) : BLOCK_MIN_DEFAULT_32;
    const rear = Math.max(0, spot.s - BLOCK_CAR_HALF_M_32);
    traffic.setRestrictions({ blocks: [{ lane: spot.lane, s: rear }] });
    block = { spot, minutes, rear };
    endSimT = simT() + minutes * 60;
    if (props && props.showBlock) props.showBlock(spot);
    return { lane: spot.lane, s: spot.s, minutes, distToNodeM: spot.distToNodeM };
  }

  function startFlood() {
    if (!net) throw new Error('flood-nhc cần mạng đường');
    const f = findFloodEdges32(net);
    if (!f.shallow.length) throw new Error('không có đoạn Nguyễn Hữu Cảnh trong đa giác ngập');
    const lanesOf = new Set(f.shallow);
    const speedMul = [], closed = [];
    const deepSet = new Set(f.deep);
    for (let l = 0; l < net.NL; l++) {
      const e = net.lanes.edge[l];
      if (!lanesOf.has(e)) continue;
      speedMul.push({ lane: l, k: FLOOD_SPEED_K_32 });
      if (deepSet.has(e)) closed.push(l);
    }
    traffic.setRestrictions({ speedMul, closed });
    if (routing && routing.setExtraAvoid) routing.setExtraAvoid(f.shallow);
    if (props && props.showFlood && net) {
      const l0 = net.lanes.edge.findIndex(e => f.shallow.includes(e));
      const yRef = l0 >= 0 ? createTrafficGeometry31(net, { jit: [], len: [] }).laneY(l0, net.lanes.length[l0] / 2) : 0;
      props.showFlood(circlePolygon32(), yRef);
    }
    // Bảng VMS gần vùng ngập (trong FLOOD_VMS_RADIUS_M_32; không có → bảng gần nhất) hiện cảnh báo ngập.
    const near = (boards || []).map(b => ({ b, d: Math.hypot(b.x - FLOOD_CENTRE_32[0], b.z - FLOOD_CENTRE_32[1]) })).sort((p, q) => p.d - q.d);
    const picked = near.filter(r => r.d <= FLOOD_VMS_RADIUS_M_32);
    const targets = picked.length ? picked : near.slice(0, 1);
    for (const { b } of targets) {
      const alt = b.altName ? `ĐI ${String(b.altName).toLocaleUpperCase('vi-VN')}` : 'ĐI TUYẾN KHÁC';
      if (vms) vms.setFlood(b.id, [FLOOD_VMS_LINE_32, alt]);
    }
    flood = { shallow: f.shallow.length, deep: f.deep.length, lanesSlowed: speedMul.length, lanesClosed: closed.length, vms: targets.map(r => r.b.id) };
    return flood;
  }

  function stop() {
    const was = key;
    clearAll();
    key = 'none'; since = null; sinceMs = 0; params = {};
    return was;
  }

  // Bắt đầu kịch bản (dừng kịch bản cũ trước). Không hợp lệ → ném lỗi, trạng thái giữ nguyên.
  function start(name, p = {}) {
    if (!SCENARIO_KEYS_32.includes(name)) throw new RangeError(`kịch bản không hỗ trợ: ${name}`);
    if (name === 'none') { stop(); return status(); }
    try {
      const prevKey = key;
      if (prevKey !== 'none') clearAll();
      let info;
      if (name === 'peak-hang-xanh') info = startPeak();
      else if (name === 'lane-block') info = startBlock(p || {});
      else info = startFlood();
      key = name; params = { ...(p || {}) }; since = new Date(now()).toISOString(); sinceMs = now(); startSimT = simT();
      lastError = null;
      log(`[scenario] bắt đầu ${name}`);
      return { ...status(), info };
    } catch (e) {
      lastError = e && e.message ? e.message : String(e);
      clearAll();
      key = 'none'; since = null;
      throw e;
    }
  }

  // Gọi định kỳ (≈1 s): hết thời gian chặn làn → trả làn; mỗi lần vẽ nhấp nháy do props quản lý.
  function tick() {
    if (key === 'lane-block' && endSimT !== null && simT() >= endSimT) { log('[scenario] hết thời gian chặn làn'); stop(); }
    if (props && props.blink) props.blink(simT());
  }

  function status() {
    const remainS = key === 'lane-block' && endSimT !== null ? Math.max(0, Math.round(endSimT - simT())) : null;
    return {
      key, label: SCENARIO_LABELS_32[key], active: key !== 'none', since, sinceMs,
      simElapsedS: key === 'none' ? 0 : Math.max(0, +(simT() - startSimT).toFixed(1)),
      remainingS: remainS, params: { ...params }, block: block ? { lane: block.spot.lane, s: block.spot.s, minutes: block.minutes } : null,
      flood: flood ? { ...flood } : null, lastError
    };
  }

  // Trường `scenario` gửi trạm (metrics): {key, since} — since là thời điểm bắt đầu (ISO) hoặc null khi dừng.
  function metricsStatus() { return { key, since }; }

  function dispose() { clearAll(); key = 'none'; }

  return { start, stop, tick, status, metricsStatus, dispose, keys: () => SCENARIO_KEYS_32.slice(), labelOf: k => SCENARIO_LABELS_32[k] || k };
}

// Cụm 3D cho xe hỏng: thân xe đứng yên, đèn khẩn cấp nháy (hai đèn) và 3 nón giao thông phía sau.
// THREE được truyền vào; trả về {showBlock(spot), blink(tSim), remove()}.
export function createBlockProps32({ THREE, scene, traffic, net }) {
  if (!THREE || !scene) throw new TypeError('createBlockProps32 cần THREE và scene');
  const geo = createTrafficGeometry31(net, { jit: [], len: [] });
  const group = new THREE.Group();
  group.name = 'scenario-lane-block-32';
  group.visible = false;
  scene.add(group);
  // Vùng ngập: lớp phẳng bán trong suốt trên mặt đất trong đa giác FLOOD (chỉ hiện khi kịch bản ngập chạy).
  const floodMat = new THREE.MeshBasicMaterial({ color: 0x1e88e5, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  const floodMesh = new THREE.Mesh(new THREE.BufferGeometry(), floodMat);
  floodMesh.name = 'scenario-flood-32';
  floodMesh.visible = false;
  floodMesh.renderOrder = 6;
  scene.add(floodMesh);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: .45, metalness: .2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: .2, metalness: .1 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffa000 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6d00, roughness: .6 });
  const coneWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: .6 });
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 4.4), bodyMat);
  body.position.set(0, 1.0, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.2), glassMat);
  cabin.position.set(0, 1.75, -0.2);
  const lampL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), lampMat);
  lampL.position.set(0.55, 1.25, 2.25);
  const lampR = lampL.clone(); lampR.position.x = -0.55;
  car.add(body, cabin, lampL, lampR);
  const cones = [];
  for (const d of [-6, -12, -18]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 12), coneMat);
    cone.position.set(0, 0.38, d);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), coneWhite);
    base.position.set(0, 0.03, d);
    cones.push(cone, base);
  }
  group.add(car, ...cones);
  let spotNow = null;
  // Đa giác phẳng (x,z) → mặt tam giác quạt từ tâm; y = mặt đường tại điểm tham chiếu + 0,25 m.
  function showFlood(poly, yRef) {
    const n = poly.length / 2;
    const pos = new Float32Array(n * 3 + 3);
    pos[0] = FLOOD_CENTRE_32[0]; pos[1] = yRef + 0.25; pos[2] = FLOOD_CENTRE_32[1];
    for (let k = 0; k < n; k++) { pos[3 + k * 3] = poly[2 * k]; pos[3 + k * 3 + 1] = yRef + 0.25; pos[3 + k * 3 + 2] = poly[2 * k + 1]; }
    const idx = [];
    for (let k = 0; k < n; k++) idx.push(0, 1 + k, 1 + ((k + 1) % n));
    const g = floodMesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    floodMesh.visible = true;
    return true;
  }
  function hideFlood() { floodMesh.visible = false; }
  function showBlock(spot) {
    spotNow = spot;
    const L = net.lanes;
    const P = geo.lanePoint(spot.lane, spot.s, L.offset[spot.lane], {});
    const yRoad = traffic && typeof traffic.surfaceAbove === 'function' ? traffic.surfaceAbove(P.x, P.z, spot.y) : spot.y;
    const tl = Math.hypot(P.tx, P.tz) || 1;
    group.position.set(P.x, yRoad, P.z);
    group.rotation.set(0, Math.atan2(P.tx / tl, P.tz / tl), 0);
    group.visible = true;
    return true;
  }
  function blink(tSim) {
    if (!group.visible) return;
    const on = Math.floor(Number(tSim) * 2) % 2 === 0;
    lampL.visible = on; lampR.visible = !on;
  }
  function hideBlock() { group.visible = false; spotNow = null; }
  return {
    showBlock, blink, showFlood, hideFlood, hideBlock,
    get spot() { return spotNow; },
    remove() { group.visible = false; spotNow = null; floodMesh.visible = false; }
  };
}

// Panel "Kịch bản" (DOM, nhãn tiếng Việt). host = phần tử chứa (#smartHud32). onPick(key, params), onStop().
export const SCENARIO_CSS_32 = `
#smartHud32 .scn-sec32{margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(137,216,223,.22)}
#smartHud32 .scn-sec32 h3{margin:0 0 6px;font-size:12px;font-weight:700}
#smartHud32 .scn-grid32{display:grid;gap:6px;margin:0 0 6px}
#smartHud32 .scn-grid32 button{padding:7px 8px;border-radius:10px;border:1px solid rgba(137,216,223,.35);background:rgba(3,17,21,.28);color:inherit;font:inherit;font-size:11px;text-align:left;cursor:pointer}
#smartHud32 .scn-grid32 button[aria-pressed="true"]{background:rgba(64,190,160,.45);border-color:rgba(64,190,160,.8)}
#smartHud32 .scn-grid32 button:focus-visible{outline:2px solid #89d8df;outline-offset:2px}
#smartHud32 .scn-row32{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:11px}
#smartHud32 .scn-row32 select{font:inherit;font-size:11px;border-radius:8px;padding:3px 6px;background:rgba(3,17,21,.4);color:inherit;border:1px solid rgba(137,216,223,.35)}
#smartHud32 .scn-stop32{width:100%;padding:6px 8px;margin:0 0 6px;border-radius:10px;border:1px solid rgba(137,216,223,.35);background:rgba(3,17,21,.28);color:inherit;font:inherit;font-size:11px;cursor:pointer}
#smartHud32 .scn-status32{margin:0;font-size:11px;opacity:.9;min-height:1.4em}
`;
export function mountScenarioPanel32(host, { onPick = () => {}, onStop = () => {}, minutesChoices = BLOCK_MIN_CHOICES_32, defaultMinutes = BLOCK_MIN_DEFAULT_32 } = {}) {
  const doc = host.ownerDocument;
  if (!doc.getElementById('scenarioCss32')) {
    const style = doc.createElement('style');
    style.id = 'scenarioCss32';
    style.textContent = SCENARIO_CSS_32;
    doc.head.append(style);
  }
  const sec = doc.createElement('section');
  sec.className = 'scn-sec32';
  sec.setAttribute('aria-label', 'Kịch bản');
  const h = doc.createElement('h3'); h.textContent = 'Kịch bản';
  const grid = doc.createElement('div'); grid.className = 'scn-grid32'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Chọn kịch bản');
  const buttons = new Map();
  for (const k of SCENARIO_KEYS_32.filter(x => x !== 'none')) {
    const b = doc.createElement('button');
    b.type = 'button'; b.dataset.scenario = k; b.setAttribute('aria-pressed', 'false'); b.textContent = SCENARIO_LABELS_32[k];
    buttons.set(k, b); grid.append(b);
  }
  const row = doc.createElement('div'); row.className = 'scn-row32';
  const lab = doc.createElement('label'); lab.textContent = 'Thời gian chặn làn';
  const sel = doc.createElement('select'); sel.id = 'blockMinutes32'; sel.setAttribute('aria-label', 'Thời gian chặn làn (phút)');
  for (const m of minutesChoices) { const o = doc.createElement('option'); o.value = String(m); o.textContent = `${m} phút`; if (m === defaultMinutes) o.selected = true; sel.append(o); }
  lab.append(' ', sel); row.append(lab);
  const stop = doc.createElement('button'); stop.type = 'button'; stop.dataset.scenario = 'none'; stop.textContent = SCENARIO_LABELS_32.none;
  stop.className = 'scn-stop32';
  const status = doc.createElement('p'); status.className = 'scn-status32'; status.setAttribute('aria-live', 'polite'); status.textContent = 'Chưa chạy kịch bản nào';
  sec.append(h, grid, row, stop, status);
  host.append(sec);
  for (const [k, b] of buttons) b.addEventListener('click', () => onPick(k, k === 'lane-block' ? { minutes: Number(sel.value) } : {}));
  stop.addEventListener('click', () => onStop());
  return {
    setActive(k, text) {
      for (const [kk, b] of buttons) b.setAttribute('aria-pressed', String(kk === k));
      status.textContent = text || (k && k !== 'none' ? `Đang chạy: ${SCENARIO_LABELS_32[k] || k}` : 'Chưa chạy kịch bản nào');
    },
    buttonOf: k => buttons.get(k) || null,
    dispose() { sec.remove(); }
  };
}
