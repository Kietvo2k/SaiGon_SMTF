// Bước C 31A · kết cấu cầu theo thủ tục (minh họa) trên mặt đường city-road-network-31.js.
//
// - Bản mặt có độ dày: vách hai mép + mặt dưới bám đúng y mặt đường (profile ROAD_GRAPH_31) của mọi mảnh nâng; đoạn dốc
//   dẫn thấp không có đường/nước bên dưới thì vách chạy xuống đất (nền đắp/mố) thay vì treo lơ lửng.
// - Trụ (InstancedMesh): road cầu sông/kênh chỉ đặt trên mặt nước; cầu vượt đặt trên đất khi bên dưới không có mặt đường.
//   Cầu kênh ngắn (< 30 m) không có trụ giữa, dầm mỏng 0,9 m.
// - Lan can (InstancedMesh): hai mép road cầu và đoạn dốc dẫn cao, bỏ đoạn mép giáp mặt đường khác (giao lộ, làn song song).
// - Bạch Đằng: dựng lại trong runtime WebGPU từ data/bach-dang-footbridge.json (giữ nguyên hình dạng xz của
//   bach-dang-footbridge.js), chỉ nối hai đầu cầu dẫn xuống đất và thêm mố ở hai đầu nhịp chính.
// Cầu có mô hình chi tiết (road có signature, ví dụ Ba Son) không thêm trụ/lan can thủ tục.
// Toàn bộ là minh họa (illustrative), không phải hình học khảo sát.
import * as THREE from 'three/webgpu';
import { attribute, uniform } from 'three/tsl';

export const BRIDGES_31_VERSION = '31J';
export const BRIDGE_CLASSES = new Set(['river', 'canal', 'overpass', 'low']);
const THICKNESS = { river: 1.5, overpass: 1.5, canal: 0.9, low: 0.9 };
const FOOT_THICKNESS_M = 0.6, RAMP_THICKNESS_M = 1.2;
const FOOT_TYPES = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'corridor']);
const EMBANKMENT_MAX_LIFT_M = 3.5;    // dốc dẫn thấp hơn mức này và không có gì bên dưới → nền đắp tới đất
const VISIBLE_GROUND_Y = -1.05;       // mặt nền Sentinel nằm ở y = −1 (webgpu-materials-24.js)
const PIER_SPACING = { river: 36, overpass: 30, canal: 22, low: 22 };
const PIER_MIN_CLEAR_M = 1.5, SHORT_CANAL_M = 30;
const PARAPET_H = 1.05, PARAPET_W = 0.28, PARAPET_MIN_LIFT_M = 2.5;
const RAMP_PARAPET_LIFT_M = 4.0;
// Bước J: đèn gắn lan can trên cầu sông và cầu vượt (đêm sáng theo nút Ngày/Giờ vàng/Đêm), minh họa, không phải khảo sát.
const LAMP_SPACING = { river: 36, overpass: 30 };
const LAMP_MIN_LIFT_M = 3.5, LAMP_POLE_H = 6.4, LAMP_ARM_M = 1.7;
const LAMP_NIGHT = { day: 0, golden: .08, night: 1 };
export const BRIDGE_LABEL = 'Kết cấu cầu: minh họa (illustrative) — dầm, trụ, lan can suy luận theo lớp cầu, không khảo sát';

// Hướng ngang (trái) đơn vị tại từng đỉnh polyline: vuông góc với dây cung hai đỉnh kề (như loftStrip).
function sideUnits(points) {
  const n = points.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    out.push([-dz, dx]);
  }
  return out;
}

// Dải hộp chạy theo polyline: points [{x, z, top, bottom}] (bottom có thể khác nhau theo đỉnh), bề rộng width.
// Đỉnh có thể mang l/r (m, về phía trái/phải tim) để hộp lệch tâm theo mép đường thật; thiếu thì dùng width/2.
// Trả về mảng vị trí tam giác (không index) gồm mặt trên, mặt dưới, hai vách và hai nắp đầu.
export function loftStrip(points, width, { top = true, caps = true } = {}) {
  const out = [], half = width / 2, n = points.length;
  if (n < 2) return out;
  const units = sideUnits(points);
  const left = points.map((p, i) => [units[i][0] * (p.l ?? half), units[i][1] * (p.l ?? half)]);
  const right = points.map((p, i) => [units[i][0] * (p.r ?? half), units[i][1] * (p.r ?? half)]);
  const quad = (p, q, r, s) => out.push(...p, ...s, ...r, ...p, ...r, ...q);   // pháp tuyến hướng ra ngoài
  for (let i = 0; i < n - 1; i++) {
    const A = points[i], B = points[i + 1], la = left[i], lb = left[i + 1], ra = right[i], rb = right[i + 1];
    const aLt = [A.x + la[0], A.top, A.z + la[1]], aRt = [A.x - ra[0], A.top, A.z - ra[1]], bLt = [B.x + lb[0], B.top, B.z + lb[1]], bRt = [B.x - rb[0], B.top, B.z - rb[1]];
    const aLb = [aLt[0], A.bottom, aLt[2]], aRb = [aRt[0], A.bottom, aRt[2]], bLb = [bLt[0], B.bottom, bLt[2]], bRb = [bRt[0], B.bottom, bRt[2]];
    if (top) quad(aLt, aRt, bRt, bLt);
    quad(aLb, bLb, bRb, aRb);
    quad(aLt, bLt, bLb, aLb);
    quad(aRt, aRb, bRb, bRt);
  }
  if (caps) {
    const A = points[0], Z = points[n - 1], la = left[0], ra = right[0], lz = left[n - 1], rz = right[n - 1];
    quad([A.x + la[0], A.top, A.z + la[1]], [A.x + la[0], A.bottom, A.z + la[1]], [A.x - ra[0], A.bottom, A.z - ra[1]], [A.x - ra[0], A.top, A.z - ra[1]]);
    quad([Z.x - rz[0], Z.top, Z.z - rz[1]], [Z.x - rz[0], Z.bottom, Z.z - rz[1]], [Z.x + lz[0], Z.bottom, Z.z + lz[1]], [Z.x + lz[0], Z.top, Z.z + lz[1]]);
  }
  return out;
}

// Bước G · cầu dẫn Ba Son: hộp signature 24 m căn trên tim way 321564421 thò ~7 m ra ngoài mép đường ở cầu dẫn
// (OSM vẽ hai chiều là hai way một chiều lệch ~9 m) thành dải xám có nắp đứng ở đầu. Ở cầu dẫn, bề ngang hộp được
// thu về đúng hợp các mặt đường của các way mapped (bề rộng + bó vỉa), chuyển dần từ 24 m tại mối nối nhịp phẳng
// (taperM) để không có bậc; đáy hộp thấp dưới groundY + 0,3 thì chạy xuống nền (nền đắp/mố chạm đất, không treo).
// Nhịp chính (hộp BoxGeometry 24 m), dây văng và pylon không đổi.
export function fitRampToRoads(strip, { roads, mainRoad, pairRoads = [], halfWidthOf, boxHalfWidth = 12, boxTop, joints = [], taperM = 24, groundY, maxPairOffsetM = 25 }) {
  const units = sideUnits(strip), polylines = pairRoads.map(i => ({ c: roads[i].c, hw: halfWidthOf(i) }));
  const mainHw = halfWidthOf(mainRoad);
  let along = 0;
  return strip.map((p, i) => {
    if (i) along += Math.hypot(p.x - strip[i - 1].x, p.z - strip[i - 1].z);
    const [ux, uz] = units[i];
    let lo = -mainHw, hi = mainHw;
    for (const { c, hw } of polylines) {
      let best = Infinity, off = 0;
      for (let k = 0; k + 1 < c.length; k++) {
        const ax = c[k][0], az = c[k][1], dx = c[k + 1][0] - ax, dz = c[k + 1][1] - az, l = dx * dx + dz * dz;
        const t = l ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l)) : 0, qx = ax + dx * t - p.x, qz = az + dz * t - p.z, d = Math.hypot(qx, qz);
        if (d < best) { best = d; off = qx * ux + qz * uz; }
      }
      if (best <= maxPairOffsetM) { lo = Math.min(lo, off - hw); hi = Math.max(hi, off + hw); }
    }
    // Đoạn mặt đường đã ở cao độ nhịp phẳng giữ hộp 24 m; từ điểm bắt đầu dốc (joints) nội suy 24 m → mép thật trong taperM.
    const dj = Math.min(Infinity, ...joints.map(j => Math.hypot(p.x - j[0], p.z - j[1])));
    const w = p.top >= boxTop - 0.005 ? 0 : Math.min(1, dj / taperM);
    const l = boxHalfWidth + (hi - boxHalfWidth) * w, r = boxHalfWidth + (-lo - boxHalfWidth) * w;
    const bottom = p.bottom < groundY + 0.3 ? VISIBLE_GROUND_Y : p.bottom;
    return { ...p, l, r, bottom };
  });
}

// Điểm trên polyline mà cao độ mặt đường topAt(x, z) bắt đầu rời cao độ nhịp phẳng boxTop (mẫu mỗi 1 m).
export function flatJoints(centerline, topAt, boxTop) {
  const out = []; let prev = null;
  for (let k = 0; k + 1 < centerline.length; k++) {
    const [ax, az] = centerline[k], [bx, bz] = centerline[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let q = k ? 1 : 0; q <= n; q++) {
      const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n, flat = topAt(x, z) >= boxTop - 0.005;
      if (prev && flat !== prev.flat) out.push(flat ? [x, z] : [prev.x, prev.z]);
      prev = { x, z, flat };
    }
  }
  return out;
}

// Bước G · cầu vượt đi bộ (BRIDGE_CORRECTIONS_31.footbridges, build_bridge_corrections_31.py): footway bridge=yes lớp
// skip mà tim nằm trên lòng đường xe mặt đất. mode 'elevated' → ẩn ribbon phẳng, dựng bản mặt ở deckTopY (tĩnh không xe
// + bản mặt), lan can, cột ở hai đầu và ở dải phân cách (chỗ không có mặt đường), cầu thang bậc theo polyline way steps
// OSM; mode 'hidden' → chỉ ẩn ribbon (thiếu dữ liệu cầu thang). Gộp vào mesh bản mặt thủ tục: không thêm draw call.
const FOOTBRIDGE_W = 3.0, FOOTBRIDGE_STAIR_W = 2.0, STAIR_RISE_M = 0.18, FOOT_RAIL_H = 1.1, FOOT_RAIL_W = 0.12, FOOT_COLUMN_M = 0.6;

export function footbridgeRoads31(roads, table) {
  const out = new Set();
  for (const f of table?.footbridges?.ways || []) if (roads[f.road]?.id === f.way) out.add(f.road);
  return out;
}

// Điểm cách đầu polyline [[x, z]…] một khoảng s (m).
function along(pts, s) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az);
    if (s <= L || k + 2 === pts.length) { const u = L ? Math.min(1, s / L) : 0; return [ax + (bx - ax) * u, az + (bz - az) * u]; }
    s -= L;
  }
  return pts[pts.length - 1];
}
const lengthOf = pts => pts.reduce((sum, p, k) => k ? sum + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0, 0);
// Lan can đặc ở mép trái/phải của dải (l/r theo quy ước loftStrip).
const railStrip = (points, width, sign) => points.map(p => sign > 0 ? { ...p, l: width / 2, r: -(width / 2 - FOOT_RAIL_W) } : { ...p, l: -(width / 2 - FOOT_RAIL_W), r: width / 2 });

function buildFootbridges({ table, roads, net, groundY, deckThick, out }) {
  const ways = [];
  let stairs = 0;
  for (const f of table?.footbridges?.ways || []) {
    if (roads[f.road]?.id !== f.way) continue;
    if (f.mode !== 'elevated') { ways.push({ way: f.way, road: f.road, mode: f.mode, reason: f.reason }); continue; }
    const top = f.deckTopY, bottom = top - deckThick, c = roads[f.road].c;
    const deckPts = c.map(([x, z]) => ({ x, z, top, bottom }));
    out.push(...loftStrip(deckPts, FOOTBRIDGE_W));
    for (const sign of [1, -1]) out.push(...loftStrip(railStrip(deckPts.map(p => ({ ...p, top: top + FOOT_RAIL_H, bottom: top })), FOOTBRIDGE_W, sign), FOOTBRIDGE_W));
    // Tĩnh không và cột: lấy mẫu mỗi 1 m dọc tim; chỗ không có mặt đường nào trong bán kính cột = dải phân cách/vỉa hè.
    const L = lengthOf(c), free = [];
    let clearance = Infinity;
    for (let s = 0; s <= L; s += 1) {
      const [x, z] = along(c, s), ys = net.surfaceYs(x, z).filter(y => y < bottom);
      if (ys.length) clearance = Math.min(clearance, bottom - Math.max(...ys));
      const r = FOOT_COLUMN_M;
      free.push(![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => net.surfaceYs(x + dx, z + dz).length));
    }
    // Hai đầu luôn có cột (đầu cầu là nơi nối cầu thang trên vỉa hè); giữa nhịp chỉ đặt ở dải trống ≥ 2 m.
    const columns = [0.5, L - 0.5];
    for (let k = 0; k < free.length;) {
      if (!free[k]) { k++; continue; }
      let e = k; while (e + 1 < free.length && free[e + 1]) e++;
      if (e - k >= 1 && k > 2 && e < free.length - 3) columns.push((k + e) / 2);
      k = e + 1;
    }
    for (const s of columns) {
      const [x, z] = along(c, Math.max(0, s - FOOT_COLUMN_M / 2)), [x2, z2] = along(c, Math.min(L, s + FOOT_COLUMN_M / 2));
      out.push(...loftStrip([{ x, z, top: bottom, bottom: VISIBLE_GROUND_Y }, { x: x2, z: z2, top: bottom, bottom: VISIBLE_GROUND_Y }], FOOT_COLUMN_M));
    }
    // Cầu thang: bậc đều (≤ STAIR_RISE_M) từ mặt cầu xuống đất theo polyline steps; mặt dưới dốc thẳng tới nền.
    let wayStairs = 0;
    for (const st of f.stairs || []) {
      const pts = st.points, SL = lengthOf(pts); if (pts.length < 2 || SL < 1) continue;
      const n = Math.max(1, Math.ceil((top - groundY) / STAIR_RISE_M)), rise = (top - groundY) / n, tread = SL / n;
      const soffit = s => Math.min(top - deckThick - (top - deckThick - VISIBLE_GROUND_Y) * s / SL, top - (s / tread | 0) * rise - 0.15);
      const steps = [];
      for (let i = 0; i < n; i++) {
        const y = top - i * rise;
        for (const s of [i * tread, (i + 1) * tread]) { const [x, z] = along(pts, s); steps.push({ x, z, top: y, bottom: soffit(s) }); }
      }
      out.push(...loftStrip(steps, FOOTBRIDGE_STAIR_W));
      const rail = steps.filter((p, i) => i % 2 === 0 || i === steps.length - 1).map((p, i, all) => {
        const s = Math.min(SL, (i === all.length - 1 ? n : i) * tread), t = top + FOOT_RAIL_H - (top - groundY) * s / SL;
        return { ...p, top: t, bottom: soffit(s) };
      });
      for (const sign of [1, -1]) out.push(...loftStrip(railStrip(rail, FOOTBRIDGE_STAIR_W, sign), FOOTBRIDGE_STAIR_W));
      wayStairs++;
    }
    stairs += wayStairs;
    ways.push({ way: f.way, road: f.road, mode: 'elevated', deckTopY: top, clearance: Number.isFinite(clearance) ? +clearance.toFixed(2) : null, columns: columns.length, stairs: wayStairs, reason: f.reason });
  }
  const elevated = ways.filter(w => w.mode === 'elevated'), clear = elevated.map(w => w.clearance).filter(v => v !== null);
  return { state: 'ready', count: elevated.length, hidden: ways.length - elevated.length, stairs, clearanceMin: clear.length ? Math.min(...clear) : null,
    source: 'data/bridge-corrections-31.js · footbridges', classification: 'illustrative', ways };
}

function geometryOf(positions, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function pointInRings(rings, x, z) {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function waterIndex(water) {
  const items = water.map(rings => { const xs = rings[0].map(p => p[0]), zs = rings[0].map(p => p[1]); return { rings, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; });
  return (x, z) => items.some(w => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && pointInRings(w.rings, x, z));
}

// Bạch Đằng: hình dạng xz như bach-dang-footbridge.js (bdDeck y=13 dày 1,15; nhịp chính 9 m, cầu dẫn 7,2 m; trụ A/B;
// vòm lá dừa nước). Chỉ đổi cao độ cầu dẫn: hạ dần về groundY ở đầu tự do (smoothstep, dốc ≤ 6,5 %), mố ở hai đầu nhịp chính.
function buildBachDang({ BD, groundY, concrete, design }) {
  const DECK_Y = 13, DECK_T = 1.15, H = DECK_Y + DECK_T / 2, DESIGN_GRADE = 0.065;
  const A = new THREE.Vector3(-431, DECK_Y, 542), B = new THREE.Vector3(-244, DECK_Y, 536);
  const dir = B.clone().sub(A).normalize(), perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const built = [], designPos = [], designCol = [];
  const col = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const pushDesign = (positions, rgb) => { designPos.push(...positions); for (let i = 0; i < positions.length / 3; i++) designCol.push(...rgb); };
  const flat = (path, width) => loftStrip(path.map(p => ({ x: p[0], z: p[1], top: H, bottom: H - DECK_T })), width);
  // Nhịp chính: phần trên sông (−431…−244) là lớp thiết kế trong mờ, phần còn lại đã thi công (bê tông).
  const main = BD.mainPath, runs = [];
  for (let i = 0; i < main.length - 1; i++) {
    const mid = (main[i][0] + main[i + 1][0]) / 2, kind = mid < -431 || mid > -244 ? 'built' : 'design';
    if (!runs.length || runs[runs.length - 1].kind !== kind) runs.push({ kind, pts: [main[i]] });
    runs[runs.length - 1].pts.push(main[i + 1]);
  }
  for (const run of runs) run.kind === 'built' ? built.push(...flat(run.pts, 9)) : pushDesign(flat(run.pts, 9), col('#c9d8d2'));
  // Cầu dẫn: đầu nối nhịp chính giữ y=13; đầu tự do (xa nhịp chính hơn) hạ về groundY.
  const ends = [];
  const distToMain = p => Math.min(...main.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
  for (const path of BD.approachPaths) {
    const pts = distToMain(path[0]) > distToMain(path[path.length - 1]) ? path.slice().reverse() : path.slice();   // pts[0] nối nhịp chính
    const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = s[s.length - 1], R = Math.min(1.5 * (H - groundY) / DESIGN_GRADE, 0.95 * L);
    const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    // Lấy mẫu dày 4 m để mặt dốc mượt.
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const n = Math.max(1, Math.ceil((s[i + 1] - s[i]) / 4));
      for (let k = 0; k < n; k++) { const u = k / n; dense.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, z: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, s: s[i] + (s[i + 1] - s[i]) * u }); }
    }
    dense.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], s: L });
    const strip = dense.map(p => { const top = groundY + (H - groundY) * smooth((L - p.s) / R); return { x: p.x, z: p.z, top, bottom: top - DECK_T < groundY + 0.4 ? VISIBLE_GROUND_Y : top - DECK_T }; });
    built.push(...loftStrip(strip, 7.2));
    const last = strip[strip.length - 1];
    ends.push({ x: +last.x.toFixed(2), z: +last.z.toFixed(2), y: +last.top.toFixed(3), groundY });
  }
  // Trụ A/B (đế + hai cột) như bản gốc, ghép vào khối bê tông.
  const cyl = (rTop, rBot, h, radial, x, y, z) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, radial).toNonIndexed(); g.translate(x, y, z); built.push(...g.attributes.position.array); g.dispose(); };
  for (const p of [A, B]) {
    cyl(6.2, 7.8, 5, 16, p.x, 2.5, p.z);
    for (const side of [-1, 1]) { const q = p.clone().addScaledVector(perp, side * 3.2); cyl(2.2, 2.2, 7.4, 8, q.x, 8.7, q.z); }
  }
  // Mố hai đầu nhịp chính: khối từ nền tới đáy bản mặt.
  let abutments = 0;
  for (const [p, q] of [[main[0], main[1]], [main[main.length - 1], main[main.length - 2]]]) {
    const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    const a = { x: p[0], z: p[1], top: H - DECK_T, bottom: VISIBLE_GROUND_Y }, b = { x: p[0] + ux * 4, z: p[1] + uz * 4, top: H - DECK_T, bottom: VISIBLE_GROUND_Y };
    built.push(...loftStrip([a, b], 9)); abutments++;
  }
  // Vòm lá dừa nước và sườn (lớp thiết kế, chưa lắp đặt): ống thép như bản gốc.
  const beam = (a, b, r, radial, rgb) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), v = bv.clone().sub(av), g = new THREE.CylinderGeometry(r, r, v.length(), radial, 1, true).toNonIndexed();
    const m = new THREE.Matrix4().compose(av.clone().add(bv).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); pushDesign(g.attributes.position.array, rgb); g.dispose();
  };
  let prev = null;
  for (let i = 0; i <= 32; i++) { const t = i / 32, p = A.clone().lerp(B, t).addScaledVector(perp, 11 * Math.sin(Math.PI * t)); p.y = 17 + 38 * Math.sin(Math.PI * t); if (prev) beam(prev.toArray(), p.toArray(), 1.05, 8, col('#dce9e4')); prev = p; }
  for (let i = 1; i < 16; i++) {
    const t = i / 16, deck = A.clone().lerp(B, t), ridge = deck.clone().addScaledVector(perp, 11 * Math.sin(Math.PI * t)); ridge.y = 17 + 38 * Math.sin(Math.PI * t);
    for (const side of [-1, 1]) { const edge = deck.clone().addScaledVector(perp, side * 4.7); edge.y = 13.7; beam(ridge.toArray(), edge.toArray(), .32, 8, col(i % 4 === 0 ? '#71d5c0' : '#dce9e4')); }
  }
  const builtMesh = new THREE.Mesh(geometryOf(built), concrete); builtMesh.name = 'Cầu đi bộ Bạch Đằng · phần đã thi công'; builtMesh.castShadow = true; builtMesh.receiveShadow = true;
  const designMesh = new THREE.Mesh(geometryOf(designPos, designCol), design); designMesh.name = 'Cầu đi bộ Bạch Đằng · lớp thiết kế (trong mờ)'; designMesh.renderOrder = 9;
  return { meshes: [builtMesh, designMesh], ends, abutments };
}

export function createBridges31({ scene, roads, graph, roadNetwork, water, bachDang, footbridges = null, nightLevel = null, status = {} }) {
  status.version = BRIDGES_31_VERSION; status.state = 'building';
  const started = performance.now();
  const net = roadNetwork, groundY = graph.frame.groundY, waterY = graph.frame.waterY ?? 0.7;
  const onWater = waterIndex(water || []);
  const root = new THREE.Group(); root.name = 'Cầu 31C · kết cấu minh họa'; scene.add(root);
  const concrete = new THREE.MeshStandardNodeMaterial({ color: '#8f948d', roughness: .82, metalness: .04, side: THREE.DoubleSide });
  const parapetMaterial = new THREE.MeshStandardNodeMaterial({ color: '#b8bcb3', roughness: .7, metalness: .06 });
  const designMaterial = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: .4, metalness: .35, transparent: true, opacity: .45, depthWrite: false });
  const classOf = i => graph.roads[i].elevationClass;
  const isBridge = i => BRIDGE_CLASSES.has(classOf(i));
  const thicknessOf = i => FOOT_TYPES.has(roads[i].type) ? FOOT_THICKNESS_M : isBridge(i) ? THICKNESS[classOf(i)] : RAMP_THICKNESS_M;
  const below = (x, z, y) => net.surfaceYs(x, z).some(v => v < y - 0.3);

  // 1) Bản mặt: vách hai mép + mặt dưới của mọi mảnh nâng (không vẽ mặt trên: đó là mặt đường).
  const deck = [];
  let deckPieces = 0, embankmentVertices = 0;
  for (const piece of net.elevatedPieces()) {
    const i = piece.road, thick = thicknessOf(i), bridge = isBridge(i), n = piece.center.length / 3;
    if (n < 2) continue;
    const bottoms = new Float32Array(n), lifts = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const x = piece.center[k * 3], y = piece.center[k * 3 + 1], z = piece.center[k * 3 + 2], lift = y - groundY;
      lifts[k] = lift;
      let bottom = y - thick;
      if (bridge ? bottom < groundY + 0.3 : (lift < EMBANKMENT_MAX_LIFT_M && !below(x, z, bottom) && !onWater(x, z))) { bottom = VISIBLE_GROUND_Y; embankmentVertices++; }
      bottoms[k] = bottom;
    }
    let any = false;
    for (let k = 0; k + 1 < n; k++) {
      if (lifts[k] < 0.05 && lifts[k + 1] < 0.05) continue;
      any = true;
      const L = piece.left, Rr = piece.right, c = k * 3, d = c + 3;
      const lt0 = [L[c], L[c + 1], L[c + 2]], lt1 = [L[d], L[d + 1], L[d + 2]], rt0 = [Rr[c], Rr[c + 1], Rr[c + 2]], rt1 = [Rr[d], Rr[d + 1], Rr[d + 2]];
      const lb0 = [lt0[0], bottoms[k], lt0[2]], lb1 = [lt1[0], bottoms[k + 1], lt1[2]], rb0 = [rt0[0], bottoms[k], rt0[2]], rb1 = [rt1[0], bottoms[k + 1], rt1[2]];
      deck.push(...lt0, ...lt1, ...lb1, ...lt0, ...lb1, ...lb0);   // vách trái
      deck.push(...rt0, ...rb0, ...rb1, ...rt0, ...rb1, ...rt1);   // vách phải
      deck.push(...lb0, ...lb1, ...rb1, ...lb0, ...rb1, ...rb0);   // mặt dưới
    }
    if (any) deckPieces++;
  }
  // Polygon giao lộ trên cao: mặt dưới dạng quạt ở y − bề dày.
  let junctionUndersides = 0;
  for (const j of net.junctions()) {
    if (!(j.y > groundY + 0.3)) continue;
    // Bề dày theo nhánh cầu (nếu có) để mặt dưới giao lộ trùng mặt dưới bản mặt cầu; chỉ toàn dốc dẫn thì theo dốc dẫn.
    const armRoads = j.arms.map(arm => graph.edges[arm.edge].road), bridgeArms = armRoads.filter(isBridge);
    const thick = Math.max(...(bridgeArms.length ? bridgeArms : armRoads).map(thicknessOf));
    const bottom = j.y - thick; if (bottom < groundY + 0.3) continue;
    const poly = j.polygon;
    for (let k = 1; k + 1 < poly.length; k++) deck.push(poly[0][0], bottom, poly[0][2], poly[k + 1][0], bottom, poly[k + 1][2], poly[k][0], bottom, poly[k][2]);
    junctionUndersides++;
  }
  status.footbridges = buildFootbridges({ table: footbridges, roads, net, groundY, deckThick: FOOT_THICKNESS_M, out: deck });
  const deckMesh = new THREE.Mesh(geometryOf(deck), concrete);
  deckMesh.name = 'Cầu 31C · bản mặt và dầm (thủ tục)'; deckMesh.castShadow = true; deckMesh.receiveShadow = true;

  // 2) Trụ theo lớp cầu.
  const piers = [];
  for (let i = 0; i < roads.length; i++) {
    if (!isBridge(i) || graph.roads[i].signature) continue;
    const pieces = net.pieces(i); if (!pieces.length) continue;
    const cls = classOf(i), spacing = PIER_SPACING[cls], thick = thicknessOf(i);
    const c = roads[i].c; let total = 0; for (let k = 1; k < c.length; k++) total += Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]);
    if ((cls === 'canal' || cls === 'low') && total < SHORT_CANAL_M) continue;
    for (const piece of pieces) {
      const pc = piece.center, n = pc.length / 3; let acc = 0, next = spacing / 2;
      for (let k = 0; k + 1 < n; k++) {
        const ax = pc[k * 3], ay = pc[k * 3 + 1], az = pc[k * 3 + 2], bx = pc[k * 3 + 3], by = pc[k * 3 + 4], bz = pc[k * 3 + 5], L = Math.hypot(bx - ax, bz - az);
        while (L > 0 && next <= acc + L) {
          const u = (next - acc) / L, x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = ay + (by - ay) * u, top = y - thick;
          next += spacing;
          if (top - groundY < PIER_MIN_CLEAR_M) continue;
          // M2b: đoạn sông/rạch qua đất (dốc dẫn, đoạn cao trên đất) cũng đặt trụ xuống đất; trước đây chỉ trụ trên nước
          // nên mặt cầu 4–13 m trên đất lơ lửng. Trụ dưới mặt đường khác vẫn bị chặn bởi probe bên dưới.
          const wet = onWater(x, z);
          const halfAcross = Math.min(piece.halfWidth * 0.6, 4.5), radius = Math.max(halfAcross, 0.7);
          const nx = -(bz - az) / L, nz = (bx - ax) / L;
          const probe = [[0, 0], [nx * radius, nz * radius], [-nx * radius, -nz * radius], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
          if (probe.some(([dx, dz]) => below(x + dx, z + dz, top))) continue;   // không chắn mặt đường bên dưới
          const base = wet ? waterY - 0.6 : VISIBLE_GROUND_Y - 0.2;
          piers.push({ x: +x.toFixed(2), z: +z.toFixed(2), top: +top.toFixed(3), bottom: +base.toFixed(3), radius: +radius.toFixed(2), across: halfAcross, yaw: Math.atan2(bx - ax, bz - az), road: i, way: graph.roads[i].id, water: wet });
        }
        acc += L;
      }
    }
  }
  const pierGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); pierGeometry.translate(0, 0.5, 0);
  const pierMesh = new THREE.InstancedMesh(pierGeometry, concrete, Math.max(1, piers.length));
  pierMesh.name = 'Cầu 31C · trụ (thủ tục)'; pierMesh.count = piers.length; pierMesh.castShadow = true; pierMesh.receiveShadow = true;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    piers.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); m.compose(new THREE.Vector3(p.x, p.bottom, p.z), q, new THREE.Vector3(p.across, p.top - p.bottom, 0.75)); pierMesh.setMatrixAt(k, m); });
    pierMesh.instanceMatrix.needsUpdate = true;
  }

  // 3) Lan can: các đoạn mép gộp theo hướng (lệch < 3°, chênh dốc < 1 %), bỏ đoạn mép giáp mặt đường khác.
  const rails = [];
  const covered = (x, z, ox, oz, y) => net.surfaceYs(x + ox * 0.8, z + oz * 0.8).some(v => Math.abs(v - y) < 0.6);
  for (let i = 0; i < roads.length; i++) {
    if (graph.roads[i].signature) continue;
    const bridge = isBridge(i);
    for (const piece of net.pieces(i)) {
      if (!piece.elevated) continue;
      const n = piece.center.length / 3, minLift = bridge ? 0 : RAMP_PARAPET_LIFT_M;
      for (const [edge, sign] of [[piece.left, 1], [piece.right, -1]]) {
        let run = null;
        const flush = () => { if (run && run.len > 0.5) rails.push(run); run = null; };
        for (let k = 0; k + 1 < n; k++) {
          const a = [edge[k * 3], edge[k * 3 + 1], edge[k * 3 + 2]], b = [edge[k * 3 + 3], edge[k * 3 + 4], edge[k * 3 + 5]];
          const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
          const ok = L > 1e-3 && Math.max(a[1], b[1]) - groundY >= Math.max(minLift, bridge ? 0.6 : 0) && (bridge || Math.max(a[1], b[1]) - groundY >= PARAPET_MIN_LIFT_M);
          if (!ok) { flush(); continue; }
          const ox = sign * -dz / L, oz = sign * dx / L, mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
          if (covered(mx, mz, ox, oz, (a[1] + b[1]) / 2)) { flush(); continue; }
          const inset = [ox * -PARAPET_W / 2, oz * -PARAPET_W / 2];
          const pa = [a[0] + inset[0], a[1], a[2] + inset[1]], pb = [b[0] + inset[0], b[1], b[2] + inset[1]];
          const heading = Math.atan2(dx, dz), grade = (b[1] - a[1]) / L;
          if (run && Math.abs(Math.atan2(Math.sin(heading - run.heading), Math.cos(heading - run.heading))) < 0.052 && Math.abs(grade - run.grade) < 0.01 && run.len < 40) { run.b = pb; run.len += L; }
          else { flush(); run = { a: pa, b: pb, heading, grade, len: L, road: i, side: sign, out: [ox, oz] }; }
        }
        flush();
      }
    }
  }
  const railGeometry = new THREE.BufferGeometry();
  {
    // Ba mặt nhìn thấy (trong, ngoài, đỉnh) của hộp đơn vị x∈[−½,½], y∈[0,1], z∈[−½,½].
    const p = [-.5, 0, -.5, -.5, 0, .5, -.5, 1, .5, -.5, 0, -.5, -.5, 1, .5, -.5, 1, -.5,
      .5, 0, -.5, .5, 1, .5, .5, 0, .5, .5, 0, -.5, .5, 1, -.5, .5, 1, .5,
      -.5, 1, -.5, -.5, 1, .5, .5, 1, .5, -.5, 1, -.5, .5, 1, .5, .5, 1, -.5];
    railGeometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); railGeometry.computeVertexNormals();
  }
  const railMesh = new THREE.InstancedMesh(railGeometry, parapetMaterial, Math.max(1, rails.length));
  railMesh.name = 'Cầu 31C · lan can (thủ tục)'; railMesh.count = rails.length; railMesh.castShadow = false; railMesh.receiveShadow = true;
  {
    const m = new THREE.Matrix4(), dir = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3();
    rails.forEach((r, k) => {
      dir.set(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]); const len = dir.length(); dir.normalize();
      side.set(-dir.z, 0, dir.x).normalize(); upv.crossVectors(dir, side).negate();
      if (upv.y < 0) upv.negate();
      m.makeBasis(side.multiplyScalar(PARAPET_W), upv.multiplyScalar(PARAPET_H), dir.multiplyScalar(len));
      m.setPosition((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2);
      railMesh.setMatrixAt(k, m);
    });
    railMesh.instanceMatrix.needsUpdate = true;
  }

  // 3b) Đèn lan can (bước J): mỗi mép cầu sông/cầu vượt một cột đèn mỗi ~30–36 m, so le hai mép, cánh tay hướng vào mặt cầu.
  const lamps = [], lampCarry = new Map();
  for (const r of rails) {
    const cls = classOf(r.road), spacing = LAMP_SPACING[cls];
    if (!spacing || !isBridge(r.road)) continue;
    const key = r.road + ':' + r.side;
    let at = lampCarry.has(key) ? lampCarry.get(key) : (r.side > 0 ? spacing / 2 : spacing);
    for (; at <= r.len; at += spacing) {
      const t = at / r.len, x = r.a[0] + (r.b[0] - r.a[0]) * t, z = r.a[2] + (r.b[2] - r.a[2]) * t, guess = r.a[1] + (r.b[1] - r.a[1]) * t;
      // Chân cột bám đúng mặt đường vẽ tại chỗ (đoạn lan can gộp ≤ 40 m nên nội suy tuyến tính có thể lệch dốc); không có mặt đường thì bỏ đèn.
      const ys = net.surfaceYs(x, z).filter(v => Math.abs(v - guess) < 0.6);
      if (!ys.length) continue;
      const y = Math.max(...ys);
      if (y - groundY < LAMP_MIN_LIFT_M) continue;
      if (lamps.some(o => o.road === r.road && Math.abs(o.y - y) < 1 && Math.hypot(o.x - x, o.z - z) < 8)) continue;   // khúc cua: hai mép/hai đoạn gộp chồng nhau
      lamps.push({ x, y, z, yaw: Math.atan2(r.out[1], -r.out[0]), road: r.road });
    }
    lampCarry.set(key, at - r.len);
  }
  const lampPositions = [], lampColors = [], lampEmit = [];
  {
    // Cột + cánh tay + đầu đèn (hộp), cánh tay hướng +x cục bộ; phần đầu đèn phát sáng.
    const part = (cx, cy, cz, sx, sy, sz, c, e) => {
      for (const [n, a, b] of [[[1, 0, 0], 1, 2], [[-1, 0, 0], 1, 2], [[0, 1, 0], 0, 2], [[0, 0, 1], 0, 1], [[0, 0, -1], 0, 1]]) {
        const ax = n.findIndex(v => v !== 0), half = [sx / 2, sy / 2, sz / 2], ctr = [cx, cy, cz];
        const corner = (ua, ub) => { const p = ctr.slice(); p[ax] += n[ax] * half[ax]; p[a] += ua * half[a]; p[b] += ub * half[b]; return p; };
        const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
        const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
        const dot = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
        for (const k of dot >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { lampPositions.push(...q[k]); lampColors.push(...c); lampEmit.push(...e); }
      }
    };
    const POLE = [.2, .21, .22], HEAD = [.95, .93, .86], NO = [0, 0, 0];
    part(0, LAMP_POLE_H / 2, 0, .2, LAMP_POLE_H, .2, POLE, NO);
    part(LAMP_ARM_M / 2, LAMP_POLE_H - .1, 0, LAMP_ARM_M, .1, .1, POLE, NO);
    part(LAMP_ARM_M - .05, LAMP_POLE_H - .22, 0, .65, .12, .28, HEAD, [3.2, 2.5, 1.5]);
  }
  const lampGeometry = new THREE.BufferGeometry();
  lampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lampPositions, 3));
  lampGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lampColors, 3));
  lampGeometry.setAttribute('emit', new THREE.Float32BufferAttribute(lampEmit, 3));
  lampGeometry.computeVertexNormals();
  // Mức đêm: dùng nightLevel của app nếu được truyền; không thì đọc nút ánh sáng đang bật (không cần sửa app).
  const lampNight = nightLevel || uniform(0);
  const lampMaterial = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: .55, metalness: .35 });
  lampMaterial.emissiveNode = attribute('emit', 'vec3').mul(lampNight);
  const lampMesh = new THREE.InstancedMesh(lampGeometry, lampMaterial, Math.max(1, lamps.length));
  lampMesh.name = 'Cầu 31J · đèn lan can (thủ tục)'; lampMesh.count = lamps.length; lampMesh.castShadow = false; lampMesh.receiveShadow = false;
  if (!nightLevel) lampMesh.onBeforeRender = () => { lampNight.value = LAMP_NIGHT[document.querySelector('[data-light].active')?.dataset.light] ?? 0; };
  {
    const m = new THREE.Matrix4();
    lamps.forEach((l, k) => { m.makeRotationY(l.yaw); m.setPosition(l.x, l.y, l.z); lampMesh.setMatrixAt(k, m); });
    lampMesh.instanceMatrix.needsUpdate = true;
  }

  const procedural = [deckMesh, pierMesh, railMesh, lampMesh];
  root.add(...procedural);
  let bd = null;
  if (bachDang?.mainPath?.length) { bd = buildBachDang({ BD: bachDang, groundY, concrete, design: designMaterial }); root.add(...bd.meshes); }
  const meshes = [...procedural, ...(bd ? bd.meshes : [])];

  // API cho bước D (xe trên cầu) và bước E (giảm theo mật độ: chỉ mesh thủ tục; Bạch Đằng/Ba Son là signature).
  const deckY = (x, z, nearY) => net.sampleY(x, z, nearY);
  const tilt = (x, z, dirX, dirZ, nearY, step = 2) => {
    const L = Math.hypot(dirX, dirZ) || 1, ux = dirX / L * step, uz = dirZ / L * step;
    const y = deckY(x, z, nearY); if (y === null) return null;
    const ya = deckY(x - ux, z - uz, y) ?? y, yb = deckY(x + ux, z + uz, y) ?? y, grade = (yb - ya) / (2 * step);
    return { y, grade, pitch: Math.atan(grade) };
  };
  const triangles = meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3 * (m.isInstancedMesh ? m.count : 1), 0);
  const api = { version: BRIDGES_31_VERSION, root, meshes, procedural, signature: bd ? bd.meshes : [], piers, rails: rails.length, lamps, thicknessOf, deckY, tilt };
  Object.assign(status, {
    state: 'ready', classification: 'illustrative', label: BRIDGE_LABEL,
    stats: { deckPieces, junctionUndersides, embankmentVertices, piers: piers.length, piersOnWater: piers.filter(p => p.water).length, parapets: rails.length, lamps: lamps.length, triangles, meshes: meshes.length, buildMs: Math.round(performance.now() - started) },
    meshes: meshes.map(m => ({ name: m.name, instanced: !!m.isInstancedMesh, count: m.isInstancedMesh ? m.count : 1, triangles: m.geometry.attributes.position.count / 3 * (m.isInstancedMesh ? m.count : 1) })),
    thicknessM: { ...THICKNESS, footway: FOOT_THICKNESS_M, ramp: RAMP_THICKNESS_M },
    bachDang: bd ? { built: true, meshes: bd.meshes.length, ends: bd.ends, abutments: bd.abutments, source: 'data/bach-dang-footbridge.json',
      reason: 'runtime WebGPU 24 không nạp bach-dang-footbridge.js (chỉ index.html legacy); dựng lại giữ nguyên hình dạng xz, chỉ nối hai đầu cầu dẫn xuống đất' } : { built: false }
  });
  Object.defineProperty(status, 'api', { value: api, enumerable: false });
  document.body.dataset.bridgeStructure = 'illustrative';
  const legend = document.querySelector('.legend');
  if (legend && !legend.querySelector('[data-bridge-note]')) { const note = document.createElement('p'); note.dataset.bridgeNote = ''; note.textContent = 'CẦU · kết cấu minh họa (illustrative)'; legend.append(note); }
  return api;
}
