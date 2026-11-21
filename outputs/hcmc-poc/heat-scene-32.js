// heat-scene-32.js - lớp 3D M4b1: ribbon bản đồ nhiệt (1 mesh, màu theo đỉnh), 2–4 bảng VMS (canvas texture),
// và phần DOM trong panel app smart (công tắc "Bản đồ nhiệt" mặc định tắt + danh sách cảnh báo).
// Phần hình học (ribbonEdges32, buildRibbon32, paintRibbon32) là thuần JS để test Node; THREE chỉ nạp qua tham số.
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32c';
import { vmsDisplay32, groupAlertsByRoad32 } from './heat-live-32.js?v=32a';

export const HEAT_SCENE_32_VERSION = 'heat-scene-32b';
export const RIBBON_LIFT_M_32 = 0.6;      // m: ribbon nằm trên mặt đường; camera xa (~5 km, near 3 m) cần ≥ 0,5 m để không lún vào mặt đường
export const RIBBON_MIN_RANK_32 = 2;      // chỉ cạnh ≥ tertiary
export const RIBBON_PAINT_S_32 = 1.5;     // s sim: nhịp cập nhật màu đỉnh
export const RIBBON_JUNCTION_GAP_M_32 = 1; // m: cắt thêm trước vạch dừng để ribbon không chạm polygon nút
// Màu theo hàng chờ thực trên đoạn (xe đang dừng/chờ trong 25 m cuối làn), không theo mức nhiệt 0–1.
// Tím chỉ dành cho làn đóng/chặn; 4 màu còn lại là thang hàng chờ. Vàng chọn lục-vàng để tách khỏi đèn vàng #f1c40f.
export const HEAT_QUEUE_BINS_32 = [2, 5, 10];
export const HEAT_QUEUE_COLORS_32 = ['#1f9d6b', '#d8e04a', '#f57c00', '#d32f2f', '#7b1fa2'];
export const HEAT_QUEUE_LABELS_32 = ['0–2', '2–5', '5–10', '>10'];
export const HEAT_QUEUE_TITLE_32 = 'Hàng chờ mỗi đoạn (xe)';
export const LEGEND_32 = HEAT_QUEUE_LABELS_32;
export const QUEUE_STOP_SPEED_32 = 0.5;   // m/s: cùng ngưỡng dừng của heat-live/spec 6.1
export const QUEUE_CHECK_M_32 = 25;       // m: xe trong đoạn này trước vạch cũng tính là hàng chờ
const VMS_W_32 = 768, VMS_H_32 = 256;
const ALERT_ROWS_32 = 5;

// Hạng màu theo số xe chờ: ≤2 xanh, ≤5 vàng, ≤10 cam, >10 đỏ; làn đóng/chặn → tím.
export function heatQueueClass32(queue, closed = false) {
  if (closed) return 4;
  const q = Number(queue);
  if (!Number.isFinite(q) || q <= HEAT_QUEUE_BINS_32[0]) return 0;
  if (q <= HEAT_QUEUE_BINS_32[1]) return 1;
  if (q <= HEAT_QUEUE_BINS_32[2]) return 2;
  return 3;
}

export function heatQueueColor32(queue, closed = false) {
  return HEAT_QUEUE_COLORS_32[heatQueueClass32(queue, closed)];
}

// Dải ribbon theo CHIỀU trên cạnh: tâm = trung bình offset làn (đã nhân dir), rộng = cả cụm làn.
// Cạnh hai chiều cho hai dải ở hai bên tim; cạnh một chiều cho một dải.
export function ribbonBandsOf32(net, e) {
  const lanes = net && net.lanes;
  if (!lanes || !lanes.edge) return null;
  const groups = new Map();
  for (let l = 0; l < lanes.edge.length; l++) {
    if (lanes.edge[l] !== e) continue;
    const d = lanes.dir[l] > 0 ? 1 : -1;
    const o = lanes.offset[l], w2 = lanes.width[l] * 0.5;
    let g = groups.get(d);
    if (!g) { g = { dir: d, min: Infinity, max: -Infinity, sum: 0, n: 0 }; groups.set(d, g); }
    g.min = Math.min(g.min, (o - w2) * d); g.max = Math.max(g.max, (o + w2) * d);
    g.sum += o * d; g.n++;
  }
  const out = [];
  for (const g of groups.values()) {
    if (!Number.isFinite(g.min) || !Number.isFinite(g.max) || !g.n) continue;
    out.push({
      dir: g.dir,
      offset: (g.min + g.max) / 2,
      half: Math.max(0.25, (g.max - g.min) * 0.5 * 0.98),
      laneOffset: g.sum / g.n
    });
  }
  return out.length ? out : null;
}

// Hàng chờ theo làn: xe dừng/chậm < 0,5 m/s hoặc còn ≤25 m tới vạch của nút có đèn.
export function queueByLane32(sim, net) {
  const out = new Float32Array(net.NL);
  if (!sim || !sim.lane) return out;
  const { lanes, E, signal } = net;
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const l = sim.lane[i], e = lanes.edge[l], d = lanes.dir[l], L = lanes.length[l];
    const s = Number(sim.s[i]), v = Number(sim.v[i]);
    if (!Number.isFinite(s) || !Number.isFinite(v)) continue;
    const target = d > 0 ? E[e].to : E[e].from;
    const dist = d > 0 ? L - s : s;
    if (v < QUEUE_STOP_SPEED_32 || (signal[target] && dist >= 0 && dist <= QUEUE_CHECK_M_32)) out[l]++;
  }
  return out;
}

// Gộp hàng chờ theo cạnh + chiều (chỉ số = e*2 + (dir > 0 ? 0 : 1)).
export function queueByEdgeDir32(sim, net) {
  const byLane = queueByLane32(sim, net);
  const out = new Float32Array(net.NE * 2);
  for (let l = 0; l < net.NL; l++) {
    const q = byLane[l];
    if (!q) continue;
    const d = net.lanes.dir[l] > 0 ? 0 : 1;
    out[net.lanes.edge[l] * 2 + d] += q;
  }
  return out;
}

// Cạnh vẽ ribbon: có làn trong khu (insideLaneOf) và hạng ≥ tertiary. Trả về danh sách chỉ số cạnh tăng dần.
export function ribbonEdges32(net, sim) {
  const pick = new Uint8Array(net.NE);
  const inside = sim && typeof sim.insideLaneOf === 'function' ? sim.insideLaneOf : () => true;
  for (let l = 0; l < net.NL; l++) {
    if (net.lanes.rank[l] < RIBBON_MIN_RANK_32 || !inside(l)) continue;
    pick[net.lanes.edge[l]] = 1;
  }
  const out = [];
  for (let e = 0; e < net.NE; e++) if (pick[e] && net.E[e].c.length >= 4) out.push(e);
  return out;
}

// Polyline cạnh đã cắt hai đầu theo mét (c-space, đo trên mặt phẳng). Trả null nếu đoạn còn lại quá ngắn.
function trimPolyline32(c, trimFrom = 0, trimTo = 0) {
  const n = c.length / 2;
  if (n < 2) return null;
  const cum = new Float64Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(c[2 * k] - c[2 * k - 2], c[2 * k + 1] - c[2 * k - 1]);
  const total = cum[n - 1];
  const s0 = Math.max(0, Math.min(total, Number(trimFrom) || 0));
  const s1 = Math.max(s0, Math.min(total, total - (Number(trimTo) || 0)));
  if (!(total > 0) || s1 - s0 < 0.5) return null;
  const at = s => {
    let k = 0;
    while (k < n - 2 && cum[k + 1] < s) k++;
    const t = Math.max(0, Math.min(1, (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k])));
    return { x: c[2 * k] + (c[2 * k + 2] - c[2 * k]) * t, z: c[2 * k + 1] + (c[2 * k + 3] - c[2 * k + 1]) * t, s };
  };
  const pts = [];
  const add = p => { if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return; if (!pts.length || p.s - pts[pts.length - 1].s > 1e-3) pts.push(p); };
  add(at(s0));
  for (let k = 1; k < n - 1; k++) if (cum[k] > s0 + 1e-3 && cum[k] < s1 - 1e-3) add({ x: c[2 * k], z: c[2 * k + 1], s: cum[k] });
  add(at(s1));
  return pts.length >= 2 ? { pts, total } : null;
}

// Dải mỏng trong làn: 2 đỉnh/điểm polyline (trái, phải), 2 tam giác/đoạn.
// bandsOf(e) → [{dir, offset, half, laneOffset}] (offset là mét ngang trong hệ c của cạnh, đã nhân dir);
// trimOf(e) → {from, to} mét cần cắt mỗi đầu (Rz nút + khe). yOf(e, s, x, z) → cao độ mặt đường tại s.
export function buildRibbon32({ net, edges, yOf, halfWidthOf, bandsOf = null, trimOf = null, lift = RIBBON_LIFT_M_32 }) {
  const strips = [];
  const list = edges.filter(e => net.E[e] && net.E[e].c && net.E[e].c.length >= 4);
  for (const e of list) {
    const trims = trimOf ? trimOf(e) : null;
    const trimFrom = trims ? Number(trims.from) || 0 : 0, trimTo = trims ? Number(trims.to) || 0 : 0;
    const poly = trimPolyline32(net.E[e].c, trimFrom, trimTo);
    if (!poly) continue;
    let bands = bandsOf ? bandsOf(e) : null;
    if (!bands || !bands.length) bands = [{ dir: 1, offset: 0, half: halfWidthOf ? halfWidthOf(e) : 1, laneOffset: 0 }];
    for (const band of bands) {
      if (!Number.isFinite(band.offset) || !Number.isFinite(band.half) || !(band.half > 0)) continue;
      strips.push({ e, band, pts: poly.pts, total: poly.total, trimFrom, trimTo });
    }
  }
  let nv = 0, ni = 0;
  for (const s of strips) { nv += 2 * s.pts.length; ni += 6 * (s.pts.length - 1); }
  const positions = new Float32Array(nv * 3), colors = new Float32Array(nv * 3), indices = new Uint32Array(ni);
  const ranges = [];
  let v = 0, q = 0;
  for (const s of strips) {
    const pts = s.pts, n = pts.length, start = v;
    let firstNx = 0, firstNz = 0;
    for (let k = 0; k < n; k++) {
      const p = pts[k], k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, k + 1);
      let tx = pts[k1].x - pts[k0].x, tz = pts[k1].z - pts[k0].z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz, nz = tx, x = p.x + nx * s.band.offset, z = p.z + nz * s.band.offset;
      const yRaw = (yOf ? yOf(s.e, p.s, x, z) : 0) + lift, y = Number.isFinite(yRaw) ? yRaw : 0;
      if (k === 0) { firstNx = nx; firstNz = nz; }
      positions[v * 3] = x + nx * s.band.half; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z + nz * s.band.half; v++;
      positions[v * 3] = x - nx * s.band.half; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z - nz * s.band.half; v++;
    }
    const count = v - start;
    if (count < 4) continue;
    for (let k = 0; k < count / 2 - 1; k++) {
      const a = start + 2 * k, b = a + 1, cc = a + 2, d = a + 3;
      indices[q++] = a; indices[q++] = b; indices[q++] = cc;
      indices[q++] = b; indices[q++] = d; indices[q++] = cc;
    }
    const p0 = pts[0];
    const cx = (positions[start * 3] + positions[start * 3 + 3]) / 2;
    const cz = (positions[start * 3 + 2] + positions[start * 3 + 5]) / 2;
    const laneCx = p0.x + firstNx * s.band.laneOffset, laneCz = p0.z + firstNz * s.band.laneOffset;
    ranges.push({
      edge: s.e, dir: s.band.dir, offset: s.band.offset, half: s.band.half, laneOffset: s.band.laneOffset,
      start, count, s0: p0.s, s1: pts[n - 1].s, total: s.total, trimFrom: s.trimFrom, trimTo: s.trimTo,
      cx, cz, laneCx, laneCz, delta: Math.hypot(cx - laneCx, cz - laneCz),
      trimOver: Math.max(0, s.trimFrom - p0.s, pts[n - 1].s - Math.max(0, s.total - s.trimTo))
    });
  }
  return { positions, colors, indices, ranges };
}

// Tô màu đỉnh theo hạng hàng chờ của từng dải (classOf(edge, dir) → 0..3; 4 = làn đóng).
export function paintRibbon32(colors, ranges, classOf, palette = HEAT_QUEUE_COLORS_32.map(hexToRgb01)) {
  for (const r of ranges) {
    const raw = Number(classOf(r.edge, r.dir));
    const idx = Number.isFinite(raw) ? Math.max(0, Math.min(palette.length - 1, Math.trunc(raw))) : 0;
    const rgb = palette[idx];
    for (let j = 0; j < r.count; j++) {
      const o = (r.start + j) * 3;
      colors[o] = rgb[0]; colors[o + 1] = rgb[1]; colors[o + 2] = rgb[2];
    }
  }
  return ranges.length;
}

function hexToRgb01(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// Vẽ bảng VMS lên canvas 2D: khung, nền tối, chữ tiếng Việt cỡ tự co để vừa bề ngang.
export function paintVms32(ctx, msg, W = VMS_W_32, H = VMS_H_32) {
  const alert = msg && msg.state === 'alert';
  const lines = (msg && msg.lines) || [];
  ctx.fillStyle = '#05080a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = alert ? '#ffb300' : '#40bea0';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = W - 90;
  lines.forEach((line, k) => {
    let size = lines.length > 1 ? 80 : 104;
    ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
    while (size > 26 && ctx.measureText(line).width > maxW) { size -= 4; ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`; }
    ctx.fillStyle = alert && k === 0 ? '#ffb300' : (alert ? '#f4f7f8' : '#e8f6f7');
    const y = lines.length > 1 ? (H * (k + 1)) / (lines.length + 1) : H / 2;
    ctx.fillText(line, W / 2, y);
  });
  return lines.length;
}

// ---- bản trình diễn v2 (P1-11): dòng xe theo chiều — mũi tên trên từng làn, hướng theo chiều xe chạy,
// độ đậm + kích thước theo mật độ xe của CHIỀU đó (không dùng mức nhiệt hai chiều của ribbon).
export const FLOW_ARROW_GAP_M_32 = 36;
export const FLOW_ARROW_BASE_M_32 = 1.7;
export const FLOW_LIFT_M_32 = 0.78;
export const FLOW_DENSITY_CAP_32 = 8;

// Danh sách mũi tên (thuần): mỗi làn ≥ tertiary trong khu một mũi mỗi FLOW_ARROW_GAP_M_32 mét.
export function buildFlowArrows32({ net, sim, edges = null }) {
  const list = [];
  const inside = sim && typeof sim.insideLaneOf === 'function' ? sim.insideLaneOf : () => true;
  const picked = edges ? new Set(edges) : null;
  for (let l = 0; l < net.NL; l++) {
    if (net.lanes.rank[l] < RIBBON_MIN_RANK_32) continue;
    if (picked && !picked.has(net.lanes.edge[l])) continue;
    if (!inside(l)) continue;
    const L = net.lanes.length[l];
    const n = Math.max(1, Math.ceil(L / FLOW_ARROW_GAP_M_32));
    for (let k = 0; k < n; k++) list.push({ lane: l, s: Math.min(L - 2, Math.max(2, L * (k + 0.5) / n)) });
  }
  return list;
}

// Mật độ xe mỗi làn (đúng chiều làn — xe đang chạy trên làn đó), tính một lượt O(N).
export function laneDensityOf32(sim, net) {
  const density = new Float32Array(net.NL);
  if (!sim || !sim.lane) return density;
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    density[sim.lane[i]]++;
  }
  return density;
}

// Tô mũi tên: mỗi mũi 3 đỉnh (đầu theo chiều lane + 2 đuôi), màu theo mức nhiệt cạnh
// và độ đậm theo mật độ CHIỀU (0–FLOW_DENSITY_CAP_32 xe → 0.3..1.0 độ sáng màu).
export function paintFlowArrows32({ net, arrows, positions, colors, density, levelOf, lanePoint, palette, lift = FLOW_LIFT_M_32, base = FLOW_ARROW_BASE_M_32 }) {
  let v = 0;
  for (const arrow of arrows) {
    const l = arrow.lane, e = net.lanes.edge[l];
    const P = lanePoint(l, arrow.s, net.lanes.offset[l]);
    const d = density ? Math.min(FLOW_DENSITY_CAP_32, density[l]) : 0;
    const size = base * (1 + d * 0.09);
    const bright = 0.3 + 0.7 * (d / FLOW_DENSITY_CAP_32);
    // Mũi tên dùng màu kem tương phản với dải nhiệt xanh/đỏ để hướng xe đọc được ở mọi mức.
    const rgb = [1, 0.87, 0.38].map(c => Math.max(0.42, c * (0.55 + 0.45 * bright)));
    // hướng mũi: đầu tiến theo (tx, tz); đuôi mở rộng hai bên vuông góc.
    const tipX = P.x + P.tx * size, tipZ = P.z + P.tz * size;
    const backX = P.x - P.tx * size * 0.55, backZ = P.z - P.tz * size * 0.55;
    const px = -P.tz * size * 0.62, pz = P.tx * size * 0.62;
    const y = P.y + lift;
    const put = (x, z) => { positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z; colors[v * 3] = rgb[0]; colors[v * 3 + 1] = rgb[1]; colors[v * 3 + 2] = rgb[2]; v++; };
    put(tipX, tipZ); put(backX + px, backZ + pz); put(backX - px, backZ - pz);
  }
  return v / 3;
}

// Dựng lớp 3D. THREE được truyền vào (app không import three trong module này). Gọi update(tSim, live) mỗi nhịp.
export function createHeatScene32({ THREE, scene, traffic, net, sim, boards = [], edges = null, vmsBus = null, closedOf = null }) {
  if (!THREE || !scene) throw new TypeError('createHeatScene32 cần THREE và scene');
  const geo = createTrafficGeometry31(net, { jit: [], len: [] });
  const firstLane = new Int32Array(net.NE).fill(-1);
  for (let l = 0; l < net.NL; l++) { const e = net.lanes.edge[l]; if (firstLane[e] < 0) firstLane[e] = l; }
  // E[e].from/to là id OSM trong graph; Rz đánh theo chỉ số nút. Chấp nhận cả hai kiểu để test thuần không cần G.
  const nodeIdx = new Map();
  if (net.G && net.G.nodes) for (let i = 0; i < net.G.nodes.length; i++) nodeIdx.set(net.G.nodes[i].id, i);
  const nodeOf = id => (Number.isInteger(id) && id >= 0 && id < (net.NN || 0) ? id : nodeIdx.get(id));
  // s là mét tích lũy trên polyline phẳng của cạnh (c-space); đổi sang s làn (chiều xe) trước khi lấy cao độ.
  const yOf = (e, sPlane, x, z) => {
    const l = firstLane[e];
    if (l < 0) return 0;
    const L = net.lanes.length[l], d = net.lanes.dir[l], planar = net.geo.planar[e];
    const sC = Math.max(0, Math.min(planar, Number(sPlane) || 0));
    const sd = planar > 0 ? (d > 0 ? sC : planar - sC) * L / planar : 0;
    const base = geo.laneY(l, Math.max(0, Math.min(L, sd)));
    return traffic && typeof traffic.surfaceAbove === 'function' ? traffic.surfaceAbove(x, z, base) : base;
  };
  // Cắt ribbon trước vạch dừng (Rz) + 1 m: không chạy vào polygon nút, không chồng ribbon hướng khác.
  const trimOf = e => {
    const ed = net.E[e], planar = net.geo.planar[e] || 0;
    const scale = ed && ed.length > 0 ? planar / ed.length : 1;
    const cut = id => ((net.Rz[nodeOf(id)] || 0) + RIBBON_JUNCTION_GAP_M_32) * scale;
    return { from: cut(ed.from), to: cut(ed.to) };
  };
  const cand = edges || ribbonEdges32(net, sim);
  const built = buildRibbon32({ net, edges: cand, yOf, bandsOf: e => ribbonBandsOf32(net, e), trimOf });
  const palette = HEAT_QUEUE_COLORS_32.map(hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; });

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  const colorAttr = new THREE.BufferAttribute(built.colors, 3);
  bg.setAttribute('color', colorAttr);
  bg.setIndex(new THREE.BufferAttribute(built.indices, 1));
  bg.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16
  });
  const mesh = new THREE.Mesh(bg, mat);
  mesh.name = 'heat-ribbon-32';
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.visible = false;
  // Chẩn đoán QA: tâm dải so với tâm cụm làn, phần cắt Rz, NaN — đọc được từ window.__smartApp.
  mesh.userData.ribbonRanges = built.ranges;
  mesh.userData.maxCenterDelta = built.ranges.reduce((m, r) => Math.max(m, r.delta || 0), 0);
  mesh.userData.maxTrimOver = built.ranges.reduce((m, r) => Math.max(m, r.trimOver || 0), 0);
  let nan = false;
  for (let i = 0; i < built.positions.length; i++) if (!Number.isFinite(built.positions[i])) { nan = true; break; }
  mesh.userData.nan = nan;
  scene.add(mesh);

  // ---- bản trình diễn v2 (P1-11): lớp mũi tên dòng xe theo chiều (lớp riêng, mặc định tắt).
  const arrows = buildFlowArrows32({ net, sim, edges: cand });
  const flowPositions = new Float32Array(arrows.length * 3 * 3);
  const flowColors = new Float32Array(arrows.length * 3 * 3);
  const flowGeo = new THREE.BufferGeometry();
  const flowPosAttr = new THREE.BufferAttribute(flowPositions, 3);
  const flowColAttr = new THREE.BufferAttribute(flowColors, 3);
  flowGeo.setAttribute('position', flowPosAttr);
  flowGeo.setAttribute('color', flowColAttr);
  const flowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16
  });
  const flowMesh = new THREE.Mesh(flowGeo, flowMat);
  flowMesh.name = 'heat-flow-arrows-32';
  flowMesh.renderOrder = 5;
  flowMesh.frustumCulled = false;
  flowMesh.visible = false;
  scene.add(flowMesh);
  let flowOn = false, lastFlowPaint = -Infinity;
  // lanePoint chỉ trả x/z/hướng; mũi tên cần thêm cao độ mặt làn, nếu thiếu y sẽ thành NaN và cả lớp biến mất.
  const lanePointOf = (l, s, offset) => { const P = {}; geo.lanePoint(l, s, offset, P); P.y = geo.laneY(l, s); return P; };
  const paintFlow = live => {
    const density = laneDensityOf32(sim, net);
    paintFlowArrows32({ net, arrows, positions: flowPositions, colors: flowColors, density,
      levelOf: e => live.level(e), lanePoint: lanePointOf, palette });
    flowPosAttr.needsUpdate = true;
    flowColAttr.needsUpdate = true;
  };

  let lastPaint = -Infinity, lastQueueStats = null;
  const paint = () => {
    const queue = queueByEdgeDir32(sim, net);
    const bins = [0, 0, 0, 0, 0];
    const classOf = (e, dir) => {
      const q = queue[e * 2 + (dir > 0 ? 0 : 1)];
      const closed = !!(closedOf && closedOf(e));
      const cls = heatQueueClass32(q, closed);
      bins[cls]++;
      return cls;
    };
    paintRibbon32(built.colors, built.ranges, classOf, palette);
    colorAttr.needsUpdate = true;
    let queueMax = 0;
    for (let i = 0; i < queue.length; i++) if (queue[i] > queueMax) queueMax = queue[i];
    lastQueueStats = { bins, ranges: built.ranges.length, queueMax };
  };

  // ---- Bảng VMS: cột, khung, mặt bảng có canvas texture.
  const vms = boards.map(b => {
    const canvas = document.createElement('canvas');
    canvas.width = VMS_W_32; canvas.height = VMS_H_32;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    group.name = `vms-32-${b.id}`;
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x5c676b });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.8, 0.22), poleMat);
    pole.position.set(0, 2.9, -0.3);   // sau mặt bảng, không xuyên qua chữ
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.9, 0.16), new THREE.MeshBasicMaterial({ color: 0x1b2326 }));
    frame.position.set(0, 5.6, 0);
    const signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.6), signMat);
    sign.position.set(0, 5.6, 0.09);
    group.add(pole, frame, sign);
    group.position.set(b.x, b.y, b.z);
    group.rotation.y = b.yaw;
    scene.add(group);
    const entry = { board: b, ctx, tex, key: null, group, parts: [pole, frame, sign] };
    showVms(entry, vmsDisplay32(b, [], vmsBus));
    return entry;
  });
  function showVms(entry, msg) {
    if (entry.key === msg.key) return false;
    entry.key = msg.key;
    paintVms32(entry.ctx, msg);
    entry.tex.needsUpdate = true;
    return true;
  }

  return {
    mesh,
    flowMesh,
    net,
    heatStats: () => lastQueueStats,
    setHeatVisible(on) { mesh.visible = !!on; if (on) lastPaint = -Infinity; },
    setFlowVisible(on) { flowOn = !!on; flowMesh.visible = flowOn; if (flowOn) lastFlowPaint = -Infinity; },
    vmsStates(alerts = []) { return vms.map(entry => ({ id: entry.board.id, ...vmsDisplay32(entry.board, alerts, vmsBus) })); },
    // Gọi mỗi nhịp: tô lại ribbon mỗi RIBBON_PAINT_S_32 giây sim khi đang hiện; cập nhật bảng VMS theo cảnh báo hiện tại.
    update(tSim, live) {
      if (mesh.visible && tSim - lastPaint >= RIBBON_PAINT_S_32) { paint(); lastPaint = tSim; }
      if (flowOn && tSim - lastFlowPaint >= RIBBON_PAINT_S_32) { paintFlow(live); lastFlowPaint = tSim; }
      const alerts = live.alerts();
      for (const entry of vms) showVms(entry, vmsDisplay32(entry.board, alerts, vmsBus));
    },
    dispose() {
      scene.remove(mesh);
      bg.dispose(); mat.dispose();
      scene.remove(flowMesh);
      flowGeo.dispose(); flowMat.dispose();
      for (const entry of vms) {
        scene.remove(entry.group);
        for (const p of entry.parts) { p.geometry.dispose(); p.material.dispose(); }
        entry.tex.dispose();
      }
    }
  };
}

const HEAT_CSS_32 = `
#smartHud32 .heat-sec32{margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(137,216,223,.22)}
#smartHud32 .heat-sec32 h3{margin:0 0 6px;font-size:12px;font-weight:700}
#smartHud32 .heat-legend32{display:grid;gap:4px;margin:0 0 10px;font-size:10px;font-weight:700}
#smartHud32 .heat-legend32 b{font-size:10px;font-weight:700;opacity:.85}
#smartHud32 .heat-legend-row32{display:flex;gap:3px}
#smartHud32 .heat-legend-chip32{flex:1;text-align:center;padding:3px 0;border-radius:6px;color:#06110b;font-size:10px;line-height:1.2;font-weight:800}
#smartHud32 .heat-alerts32{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:11px}
#smartHud32 .heat-alerts32 li{padding:6px 8px;border-radius:10px;background:rgba(3,17,21,.28)}
#smartHud32 .heat-alerts32 li small{display:block;font-size:10px;opacity:.8;margin-top:2px}
#heatLegendFloat32{position:fixed;z-index:7;left:14px;bottom:calc(var(--submit-hud-reserve,92px) + 8px);display:flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid rgba(137,216,223,.3);border-radius:10px;background:rgba(9,25,31,.86);color:#eaf6f7;font:700 10px/1.2 system-ui,"Segoe UI",sans-serif;backdrop-filter:blur(6px);pointer-events:none}
#heatLegendFloat32[hidden]{display:none}
#heatLegendFloat32 b{font-size:10px;font-weight:700;white-space:nowrap;opacity:.9}
#heatLegendFloat32 .heat-legend-row32{display:flex;gap:3px}
#heatLegendFloat32 .heat-legend-chip32{flex:0 0 auto;min-width:27px;text-align:center;padding:3px 4px;border-radius:5px;color:#06110b;font-size:10px;font-weight:800}
@media (max-width:620px){#heatLegendFloat32{left:8px;padding:4px 6px}}
`;

// Phần DOM trong panel app smart. host = phần tử chứa (ví dụ #smartHud32). Dùng textContent cho dữ liệu cảnh báo.
export function mountHeatPanel32(host, { onToggle = () => {}, onToggleFlow = () => {} } = {}) {
  const doc = host.ownerDocument;
  if (!doc.getElementById('heatCss32')) {
    const style = doc.createElement('style');
    style.id = 'heatCss32';
    style.textContent = HEAT_CSS_32;
    doc.head.append(style);
  }
  const legendRow = '<span class="heat-legend-row32">'
    + HEAT_QUEUE_LABELS_32.map((t, k) => `<span class="heat-legend-chip32" style="background:${HEAT_QUEUE_COLORS_32[k]}" title="${HEAT_QUEUE_TITLE_32}: ${t} xe">${t}</span>`).join('')
    + '</span>';
  const sec = doc.createElement('section');
  sec.className = 'heat-sec32';
  sec.setAttribute('aria-label', 'Bản đồ nhiệt và cảnh báo kẹt');
  sec.innerHTML = '<label class="hud-switch"><span>Bản đồ nhiệt</span>'
    + '<input type="checkbox" role="switch" id="heatToggle32" aria-label="Bản đồ nhiệt"></label>'
    + '<label class="hud-switch"><span>Dòng xe theo chiều</span>'
    + '<input type="checkbox" role="switch" id="flowToggle32" aria-label="Dòng xe theo chiều — mũi tên theo hướng xe chạy"></label>'
    + `<div class="heat-legend32" role="img" aria-label="${HEAT_QUEUE_TITLE_32}: 0–2 xe thông, 2–5 xe chậm, 5–10 xe kẹt, trên 10 xe kẹt nặng"><b>${HEAT_QUEUE_TITLE_32}</b>${legendRow}</div>`
    + '<h3>Cảnh báo kẹt · dự báo 10–30 phút</h3>'
    + '<ul class="heat-alerts32" id="heatAlerts32" aria-live="polite"></ul>';
  host.append(sec);
  // Overlay cố định: HUD đóng vẫn thấy thang màu khi lớp nhiệt đang bật.
  let floatLegend = null;
  if (doc.body) {
    floatLegend = doc.createElement('div');
    floatLegend.id = 'heatLegendFloat32';
    floatLegend.setAttribute('aria-hidden', 'true');
    floatLegend.innerHTML = '<b>Hàng chờ (xe)</b>' + legendRow;
    floatLegend.hidden = true;
    doc.body.append(floatLegend);
  }
  const syncLegend = () => { if (floatLegend) floatLegend.hidden = !toggle.checked; };
  const toggle = sec.querySelector('#heatToggle32');
  const flowToggle = sec.querySelector('#flowToggle32');
  const list = sec.querySelector('#heatAlerts32');
  toggle.addEventListener('change', () => { onToggle(toggle.checked); syncLegend(); });
  flowToggle.addEventListener('change', () => onToggleFlow(flowToggle.checked));
  const row = (text, small) => {
    const li = doc.createElement('li');
    li.textContent = text;
    if (small) { const s = doc.createElement('small'); s.textContent = small; li.append(s); }
    return li;
  };
  return {
    toggleEl: toggle,
    setOn(on) { toggle.checked = !!on; syncLegend(); },
    setFlowOn(on) { flowToggle.checked = !!on; },
    setAlerts(alerts) {
      list.textContent = '';
      if (!alerts || !alerts.length) { list.append(row('Chưa có cảnh báo kẹt')); return 0; }
      // M4b2: gộp theo tên đường (mỗi đường một dòng, ghi số đoạn), tối đa ALERT_ROWS_32 dòng.
      const top = groupAlertsByRoad32(alerts, ALERT_ROWS_32);
      for (const a of top) {
        const seg = a.segments > 1 ? ` · ${a.segments} đoạn` : '';
        list.append(row(a.name, `${Math.round(a.prob * 100)}% · sau ${a.horizonMin} phút · tin cậy ${Math.round(a.reliability * 100)}%${seg}`));
      }
      return top.length;
    },
    dispose() { sec.remove(); if (floatLegend) floatLegend.remove(); }
  };
}
