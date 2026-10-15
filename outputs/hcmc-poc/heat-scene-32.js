// heat-scene-32.js - lớp 3D M4b1: ribbon bản đồ nhiệt (1 mesh, màu theo đỉnh), 2–4 bảng VMS (canvas texture),
// và phần DOM trong panel app smart (công tắc "Bản đồ nhiệt" mặc định tắt + danh sách cảnh báo).
// Phần hình học (ribbonEdges32, buildRibbon32, paintRibbon32) là thuần JS để test Node; THREE chỉ nạp qua tham số.
import { colorOf, HEAT_COLORS_32 } from './heat-32.js?v=32a';
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { vmsMessage32, groupAlertsByRoad32 } from './heat-live-32.js?v=32a';

export const HEAT_SCENE_32_VERSION = 'heat-scene-32a';
export const RIBBON_LIFT_M_32 = 0.6;      // m: ribbon nằm trên mặt đường; camera xa (~5 km, near 3 m) cần ≥ 0,5 m để không lún vào mặt đường
export const RIBBON_MIN_RANK_32 = 2;      // chỉ cạnh ≥ tertiary
export const RIBBON_PAINT_S_32 = 1.5;     // s sim: nhịp cập nhật màu đỉnh
export const LEGEND_32 = ['thông', 'chậm nhẹ', 'chậm', 'kẹt', 'kẹt nặng'];
const VMS_W_32 = 768, VMS_H_32 = 256;
const ALERT_ROWS_32 = 5;

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

// Dải mỏng dọc tim cạnh: 2 đỉnh/điểm polyline (trái, phải), 2 tam giác/đoạn. yOf(e, k, x, z) → cao độ mặt đường tại điểm k.
export function buildRibbon32({ net, edges, yOf, halfWidthOf, lift = RIBBON_LIFT_M_32 }) {
  let nv = 0, ni = 0;
  const list = edges.filter(e => net.E[e].c.length >= 4);
  for (const e of list) { const n = net.E[e].c.length / 2; nv += 2 * n; ni += 6 * (n - 1); }
  const positions = new Float32Array(nv * 3), colors = new Float32Array(nv * 3), indices = new Uint32Array(ni);
  const ranges = [];
  let v = 0, q = 0;
  for (const e of list) {
    const c = net.E[e].c, n = c.length / 2, hw = halfWidthOf(e), start = v;
    for (let k = 0; k < n; k++) {
      const x = c[2 * k], z = c[2 * k + 1];
      const k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, k + 1);
      let tx = c[2 * k1] - c[2 * k0], tz = c[2 * k1 + 1] - c[2 * k0 + 1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const nx = -tz * hw, nz = tx * hw, y = yOf(e, k, x, z) + lift;
      positions[v * 3] = x + nx; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z + nz; v++;
      positions[v * 3] = x - nx; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z - nz; v++;
    }
    for (let k = 0; k < n - 1; k++) {
      const a = start + 2 * k, b = a + 1, cc = a + 2, d = a + 3;
      indices[q++] = a; indices[q++] = b; indices[q++] = cc;
      indices[q++] = b; indices[q++] = d; indices[q++] = cc;
    }
    ranges.push({ edge: e, start, count: v - start });
  }
  return { positions, colors, indices, ranges };
}

// Tô màu đỉnh theo mức nhiệt của từng cạnh (palette = [[r,g,b]] theo HEAT_COLORS_32). Trả về số cạnh đã tô.
export function paintRibbon32(colors, ranges, levelOf, palette = HEAT_COLORS_32.map(hexToRgb01)) {
  for (const r of ranges) {
    const idx = Math.max(0, HEAT_COLORS_32.indexOf(colorOf(levelOf(r.edge))));
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

// Dựng lớp 3D. THREE được truyền vào (app không import three trong module này). Gọi update(tSim, live) mỗi nhịp.
export function createHeatScene32({ THREE, scene, traffic, net, sim, boards = [], edges = null }) {
  if (!THREE || !scene) throw new TypeError('createHeatScene32 cần THREE và scene');
  const geo = createTrafficGeometry31(net, { jit: [], len: [] });
  const firstLane = new Int32Array(net.NE).fill(-1);
  const roadW = new Float32Array(net.NE);
  for (let l = 0; l < net.NL; l++) {
    const e = net.lanes.edge[l];
    if (firstLane[e] < 0) firstLane[e] = l;
    roadW[e] = Math.max(roadW[e], net.lanes.width[l] * net.lanes.n[l]);
  }
  const yOf = (e, k, x, z) => {
    const l = firstLane[e], L = net.lanes.length[l], d = net.lanes.dir[l];
    const planar = net.geo.planar[e];
    const sd = planar > 0 ? Math.max(0, Math.min(L, net.geo.s[net.geo.off[e] + k] * L / planar)) : 0;
    const base = geo.laneY(l, d > 0 ? sd : L - sd);
    return traffic && typeof traffic.surfaceAbove === 'function' ? traffic.surfaceAbove(x, z, base) : base;
  };
  const cand = edges || ribbonEdges32(net, sim);
  const built = buildRibbon32({ net, edges: cand, yOf, halfWidthOf: e => roadW[e] * 0.5 * 0.92 });
  const palette = HEAT_COLORS_32.map(hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; });

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  const colorAttr = new THREE.BufferAttribute(built.colors, 3);
  bg.setAttribute('color', colorAttr);
  bg.setIndex(new THREE.BufferAttribute(built.indices, 1));
  bg.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16
  });
  const mesh = new THREE.Mesh(bg, mat);
  mesh.name = 'heat-ribbon-32';
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  let lastPaint = -Infinity;
  const paint = live => {
    paintRibbon32(built.colors, built.ranges, e => live.level(e), palette);
    colorAttr.needsUpdate = true;
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
    showVms(entry, vmsMessage32(b, []));
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
    setHeatVisible(on) { mesh.visible = !!on; if (on) lastPaint = -Infinity; },
    vmsStates(alerts = []) { return vms.map(entry => ({ id: entry.board.id, ...vmsMessage32(entry.board, alerts) })); },
    // Gọi mỗi nhịp: tô lại ribbon mỗi RIBBON_PAINT_S_32 giây sim khi đang hiện; cập nhật bảng VMS theo cảnh báo hiện tại.
    update(tSim, live) {
      if (mesh.visible && tSim - lastPaint >= RIBBON_PAINT_S_32) { paint(live); lastPaint = tSim; }
      const alerts = live.alerts();
      for (const entry of vms) showVms(entry, vmsMessage32(entry.board, alerts));
    },
    dispose() {
      scene.remove(mesh);
      bg.dispose(); mat.dispose();
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
#smartHud32 .heat-legend32{display:flex;gap:3px;margin:0 0 8px;font-size:9px;font-weight:700}
#smartHud32 .heat-legend32 span{flex:1;text-align:center;padding:3px 0;border-radius:6px;color:#05080a}
#smartHud32 .heat-alerts32{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:11px}
#smartHud32 .heat-alerts32 li{padding:6px 8px;border-radius:10px;background:rgba(3,17,21,.28)}
#smartHud32 .heat-alerts32 li small{display:block;font-size:10px;opacity:.8;margin-top:2px}
`;

// Phần DOM trong panel app smart. host = phần tử chứa (ví dụ #smartHud32). Dùng textContent cho dữ liệu cảnh báo.
export function mountHeatPanel32(host, { onToggle = () => {} } = {}) {
  const doc = host.ownerDocument;
  if (!doc.getElementById('heatCss32')) {
    const style = doc.createElement('style');
    style.id = 'heatCss32';
    style.textContent = HEAT_CSS_32;
    doc.head.append(style);
  }
  const sec = doc.createElement('section');
  sec.className = 'heat-sec32';
  sec.setAttribute('aria-label', 'Bản đồ nhiệt và cảnh báo kẹt');
  sec.innerHTML = '<label class="hud-switch"><span>Bản đồ nhiệt</span>'
    + '<input type="checkbox" role="switch" id="heatToggle32" aria-label="Bản đồ nhiệt"></label>'
    + `<div class="heat-legend32" aria-hidden="true">${LEGEND_32.map((t, k) => `<span style="background:${HEAT_COLORS_32[k]}">${t}</span>`).join('')}</div>`
    + '<h3>Cảnh báo kẹt · dự báo 10–30 phút</h3>'
    + '<ul class="heat-alerts32" id="heatAlerts32" aria-live="polite"></ul>';
  host.append(sec);
  const toggle = sec.querySelector('#heatToggle32');
  const list = sec.querySelector('#heatAlerts32');
  toggle.addEventListener('change', () => onToggle(toggle.checked));
  const row = (text, small) => {
    const li = doc.createElement('li');
    li.textContent = text;
    if (small) { const s = doc.createElement('small'); s.textContent = small; li.append(s); }
    return li;
  };
  return {
    toggleEl: toggle,
    setOn(on) { toggle.checked = !!on; },
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
    dispose() { sec.remove(); }
  };
}
