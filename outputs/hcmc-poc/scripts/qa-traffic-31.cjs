/*
 * QA 31A · bước D: giao thông minh họa chạy trên đồ thị đường ROAD_GRAPH_31.
 * File riêng (bước release gộp vào qa-road-traffic-31.cjs).
 *
 * Kiểm trong trình duyệt thật, lấy mẫu mỗi khung hình trong nhiều cửa sổ ≥ 20 s:
 *  - không teleport giữa đường: (a) theo ma trận instance đã vẽ (độc lập với API), (b) theo trạng thái đồ thị
 *    (cùng làn: Δs ≤ vmax·Δt; đổi làn: làn mới phải nối tiếp làn cũ tại nút; tái sinh chỉ ở nút biên/kích hoạt, có cờ gen);
 *  - không đi ngược chiều oneway (làn ↔ tag oneway của cạnh, và vector mũi xe ↔ hướng đoạn tim đường);
 *  - đi bên phải trên đường hai chiều (độ lệch ngang có dấu so với tim đường, tính độc lập từ toạ độ);
 *  - không xe nào xuyên nhau: hộp OBB của mọi cặp xe (đã vẽ mỗi khung + toàn bộ xe mỗi 10 khung) và khoảng cách
 *    cùng làn ≥ (dài₁+dài₂)/2 + gap tối thiểu, kể cả qua ranh giới cạnh;
 *  - có xe trên cầu (elevationClass ≠ ground) và y xe khớp profile mặt đường ≤ 0,05 m;
 *  - tất định: reset + advance cùng thời gian → cùng hash, giữa hai lần và giữa WebGPU/WebGL;
 *  - CPU vòng cập nhật xe ≤ baseline 30B/31 đo trước khi sửa (research/vibecode-31-traffic/cpu-base30b.json);
 *  - mật độ theo thứ bậc + giờ trong cảnh, API setDensity/setVisibleFraction cho bước E, trạng thái motion/dataset.
 *
 * Chạy (serve.py đang chạy):  node outputs/hcmc-poc/scripts/qa-traffic-31.cjs [webgpu|webgl]
 * Biến môi trường: PORT (mặc định 8768) hoặc CITY_URL, PW_MODULE, PW_CHROME, SAMPLE_S (mặc định 20).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || `http://127.0.0.1:${process.env.PORT || 8768}/hcmc-poc/webgpu-materials-24.html`;
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const SAMPLE_S = Number(process.env.SAMPLE_S || 20);

// Ngưỡng QA đặt độc lập với module (không tự xác nhận).
const LIMITS = {
  VMAX: 22,            // m/s ≈ 80 km/h, trần tốc độ xe minh họa trong nội đô
  PATH_FACTOR: 1.6,    // quãng đường vệt lệch làn khi vào cua lớn hơn quãng đường tim (bán kính ngoài)
  JUMP_EPS: .3,        // m
  MIN_GAP: .3,         // m, khe hở tối thiểu giữa hai xe cùng làn (tâm–tâm ≥ (L₁+L₂)/2 + MIN_GAP)
  OBB_SHRINK: .02,     // m, sai số số học khi thử giao hộp
  BRIDGE_Y_TOL: .05,   // m
  RIGHT_MIN: .2        // m, xe đường hai chiều phải lệch phải tim ít nhất chừng này
};
const VIEWS = [
  { id: 'materials', view: 'materials' },
  // Nhịp chính cầu Ba Son (y 12,85) và đầu cầu bờ Quận 1: cầu ô tô signature.
  { id: 'ba-son', view: 'bason', pose: { position: [-205, 95, -45], target: [-330, 8, -160], fov: 46 } }
];

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 700) }); } };

let baselineCpu = null;
check('mã nguồn: module city-traffic-31.js được nạp, vòng xe theo đoạn thẳng 26B đã bỏ', () => {
  const app = read('webgpu-materials-24.js');
  assert(fs.existsSync(path.join(root, 'city-traffic-31.js')), 'thiếu city-traffic-31.js');
  assert(/from '\.\/city-traffic-31\.js\?v=30b[^']*'/.test(app), 'webgpu-materials-24.js chưa import city-traffic-31.js?v=30b…');
  assert(!app.includes('(item.phase+timeSeconds*item.speed)%1'), 'còn vòng xe u=(phase+t·speed)%1 (teleport về đầu đoạn)');
  assert(!/side=motionRandom\(\)>\.5\?1:-1/.test(app), 'còn chọn chiều ngẫu nhiên bỏ qua oneway');
});
check('baseline CPU vòng cập nhật xe đã đo trước khi sửa', () => {
  const file = path.join(repo, 'research/vibecode-31-traffic/cpu-base30b.json');
  assert(fs.existsSync(file), 'thiếu research/vibecode-31-traffic/cpu-base30b.json');
  baselineCpu = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(baselineCpu.runs.length >= 6 && baselineCpu.summary.meanOfMeans > 0);
});

// ---------------------------------------------------------------- trong trang
function initProbe() {
  const probe = window.__probe = { scenes: [], camera: null, pose: null };
  const hook = new EventTarget();
  hook.addEventListener('observe', event => {
    const o = event.detail;
    if (!o?.isScene) return;
    probe.scenes.push(o);
    o.onBeforeRender = (renderer, scene, camera) => {
      if (!(camera.isPerspectiveCamera && camera.near === 3) || camera.__probeLookAt) return;
      probe.camera = camera; camera.__probeLookAt = true;
      // App gọi camera.lookAt(target) đầu mỗi khung trước khi cập nhật xe: pose QA áp ở đây để cull xe theo đúng camera.
      const lookAt = camera.lookAt.bind(camera);
      camera.lookAt = (...args) => { const p = probe.pose; if (!p) return lookAt(...args); camera.position.fromArray(p.position); if (p.fov && camera.fov !== p.fov) { camera.fov = p.fov; camera.updateProjectionMatrix(); } return lookAt(p.target[0], p.target[1], p.target[2]); };
    };
  });
  window.__THREE_DEVTOOLS__ = hook;
}

// Lấy mẫu `seconds` giây, mỗi khung so với khung trước; trả về tổng hợp vi phạm (không giữ toàn bộ lịch sử).
async function sample(page, seconds, limits) {
  return page.evaluate(async ({ seconds, limits }) => {
    const status = window.webgpuMaterials24, api = status.motion?.api || null, G = window.ROAD_GRAPH_31;
    const out = { api: !!api, frames: 0, matrixPairs: 0, matrixJumps: 0, jumpSamples: [], obbChecks: 0, obbOverlaps: 0, obbSamples: [], allObbFrames: 0, allObbOverlaps: 0, allObbSamples: [],
      graph: { steps: 0, sameLane: 0, transitions: 0, respawns: 0, teleports: 0, samples: [], backwards: 0 }, oneway: { checked: 0, bad: 0, samples: [] }, heading: { checked: 0, bad: 0, samples: [] },
      right: { checked: 0, bad: 0, samples: [] }, gap: { pairs: 0, bad: 0, samples: [], crossEdge: 0 }, bridge: { framesWith: 0, maxCount: 0, ySamples: 0, yWorst: 0, yBad: [], drawnOn: 0 }, drawnMax: 0, activeMin: Infinity, activeMax: 0 };
    // ---- Đường tim cạnh: đoạn gần nhất với (x, z) → hướng, độ lệch ngang có dấu (phải dương), s và y profile.
    const profileAt = (p, s) => { if (s <= p[0]) return p[1]; const n = p.length / 2; if (s >= p[(n - 1) * 2]) return p[(n - 1) * 2 + 1]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m * 2] <= s) lo = m; else hi = m; } const t = (s - p[lo * 2]) / Math.max(1e-9, p[hi * 2] - p[lo * 2]); return p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t; };
    // Đỉnh gãy > 30° của polyline cạnh (quãng s theo chiều vẽ): quanh đó xe vào cua nên tiếp tuyến đoạn gần nhất không đại diện hướng đường.
    const kinkCache = new Map();
    const kinksOf = e => { let r = kinkCache.get(e); if (r) return r; const E = G.edges[e], c = E.c, n = c.length / 2; r = []; let acc = 0;
      for (let k = 1; k < n; k++) { acc += Math.hypot(c[k * 2] - c[k * 2 - 2], c[k * 2 + 1] - c[k * 2 - 1]); if (k < n - 1) { const a = Math.atan2(c[k * 2 + 1] - c[k * 2 - 1], c[k * 2] - c[k * 2 - 2]), b = Math.atan2(c[k * 2 + 3] - c[k * 2 + 1], c[k * 2 + 2] - c[k * 2]); let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; if (d > .52) r.push(acc); } }
      kinkCache.set(e, r); return r; };
    // Đoạn thẳng của cạnh: xa nút ≥ 12 m và xa đỉnh gãy ≥ 6 m (s đo trên polyline, như edgeProject).
    const straightPart = (e, pr) => { const total = pr.total; return pr.s > 12 && pr.s < total - 12 && kinksOf(e).every(k => Math.abs(k - pr.s) > 6); };
    const edgeProject = (e, x, z) => {
      const E = G.edges[e], c = E.c, n = c.length / 2; let best = null, acc = 0, total = 0;
      for (let k = 0; k < n - 1; k++) total += Math.hypot(c[k * 2 + 2] - c[k * 2], c[k * 2 + 3] - c[k * 2 + 1]);
      for (let k = 0; k < n - 1; k++) {
        const ax = c[k * 2], az = c[k * 2 + 1], dx = c[k * 2 + 2] - ax, dz = c[k * 2 + 3] - az, L = Math.hypot(dx, dz);
        if (L > 1e-6) { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz); if (!best || d < best.d) best = { d, tx: dx / L, tz: dz / L, lat: (x - qx) * (-dz / L) + (z - qz) * (dx / L), s: acc + t * L, k, t }; }
        acc += L;
      }
      if (!best) return null;
      best.total = total;
      const scale = total > 1e-9 ? E.length / total : 1;
      best.y = E.profile ? profileAt(E.profile, best.s * scale) : E.y ? E.y[best.k] + (E.y[best.k + 1] - E.y[best.k]) * best.t : G.frame.groundY;
      return best;
    };
    // ---- Hộp OBB trên mặt phẳng XZ (SAT 4 trục) + chênh y.
    const obbOverlap = (a, b) => {
      if (Math.abs(a.y - b.y) > 1.5) return false;
      const axes = [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]];
      for (const [ux, uz] of axes) {
        const ra = Math.abs(a.fx * ux + a.fz * uz) * a.hl + Math.abs(-a.fz * ux + a.fx * uz) * a.hw;
        const rb = Math.abs(b.fx * ux + b.fz * uz) * b.hl + Math.abs(-b.fz * ux + b.fx * uz) * b.hw;
        if (Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) >= ra + rb - 2 * limits.OBB_SHRINK) return false;
      }
      return true;
    };
    const overlapPairs = (boxes, maxSamples, list) => {
      const grid = new Map(), C = 8; let pairs = 0, bad = 0;
      for (const b of boxes) { const k = Math.floor(b.x / C) * 65536 + Math.floor(b.z / C); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(b); }
      for (const b of boxes) {
        const gx = Math.floor(b.x / C), gz = Math.floor(b.z / C);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get((gx + i) * 65536 + gz + j) || []) {
          if (o.id <= b.id) continue; pairs++;
          if (obbOverlap(b, o)) { bad++; if (list.length < maxSamples) list.push({ a: b.id, b: o.id, x: +b.x.toFixed(1), z: +b.z.toFixed(1), d: +Math.hypot(b.x - o.x, b.z - o.z).toFixed(2) }); }
        }
      }
      return { pairs, bad };
    };
    // ---- Hộp của xe đã vẽ (đọc ma trận instance). Có API: mesh + id; không có API (26B): mesh thân xe, chỉ số = id.
    const drawnBoxes = () => {
      const boxes = [];
      let sets = [];
      if (api) sets = api.drawn();
      else { let group = null; for (const s of window.__probe.scenes) s.traverse(o => { if (!group && /Dense Vietnamese road traffic/.test(o.name)) group = o; }); const body = group?.children.find(o => o.isInstancedMesh); if (body) sets = [{ mesh: body, ids: null, count: body.count }]; }
      for (const set of sets) {
        const m = set.mesh.instanceMatrix.array, dims = api ? api.kinds : null, kinds = api ? api.snapshot().kind : null;
        for (let i = 0; i < set.count; i++) {
          const o = i * 16, sx = Math.hypot(m[o], m[o + 1], m[o + 2]), sz = Math.hypot(m[o + 8], m[o + 9], m[o + 10]);
          if (sx < 1e-6) continue;
          const id = set.ids ? set.ids[i] : i, kind = kinds ? kinds[id] : 0;
          const L = api ? dims[kind].length : sx, W = api ? dims[kind].width : sz;
          const fh = Math.hypot(m[o], m[o + 2]) || 1;
          boxes.push({ id, x: m[o + 12], y: m[o + 13], z: m[o + 14], fx: m[o] / fh, fz: m[o + 2] / fh, hl: L / 2, hw: W / 2, fy: m[o + 1] / (sx || 1) });
        }
      }
      return boxes;
    };
    let prevDrawn = null, prevSnap = null, prevT = null;
    const lanes = api ? api.lanes() : null;
    const snapCopy = s => ({ t: s.t, lane: s.lane.slice(), next: s.next.slice(), s: s.s.slice(), v: s.v.slice(), lat: s.lat.slice(), gen: s.gen.slice(), active: s.active.slice(), kind: s.kind.slice(), len: s.len.slice(), wid: s.wid.slice() });
    const successors = new Map();   // lane → Set(lane) quan sát từ bảng làn (cùng nút)
    const pushS = (list, v) => { if (list.length < 8) list.push(v); };
    await new Promise(resolve => {
      const start = performance.now();
      const tick = () => {
        const now = performance.now();
        out.frames++;
        // (a) Teleport theo ma trận đã vẽ + OBB khung này.
        const boxes = drawnBoxes(), map = new Map(boxes.map(b => [b.id, b]));
        out.drawnMax = Math.max(out.drawnMax, boxes.length);
        const snap = api ? snapCopy(api.snapshot()) : null;
        const dtSim = snap && prevSnap ? snap.t - prevSnap.t : (prevT === null ? 0 : (now - prevT) / 1000);
        if (prevDrawn && dtSim > 0) for (const b of boxes) {
          const p = prevDrawn.get(b.id); if (!p) continue;
          if (snap && prevSnap && snap.gen[b.id] !== prevSnap.gen[b.id]) continue;   // tái sinh có đánh dấu
          out.matrixPairs++;
          const d = Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z), allow = limits.VMAX * dtSim * limits.PATH_FACTOR + limits.JUMP_EPS;
          if (d > allow) { out.matrixJumps++; pushS(out.jumpSamples, { id: b.id, d: +d.toFixed(2), allow: +allow.toFixed(2), x: +b.x.toFixed(1), z: +b.z.toFixed(1) }); }
        }
        const r = overlapPairs(boxes, 8, out.obbSamples); out.obbChecks += r.pairs; out.obbOverlaps += r.bad;
        if (api && snap) {
          const N = snap.active.length; let active = 0;
          for (let i = 0; i < N; i++) active += snap.active[i];
          out.activeMin = Math.min(out.activeMin, active); out.activeMax = Math.max(out.activeMax, active);
          // (b) Teleport theo đồ thị + tiến lùi.
          if (prevSnap && snap.t > prevSnap.t) {
            out.graph.steps++;
            const dt = snap.t - prevSnap.t;
            for (let i = 0; i < N; i++) {
              if (!snap.active[i] || !prevSnap.active[i]) continue;
              if (snap.gen[i] !== prevSnap.gen[i]) { out.graph.respawns++; continue; }
              const a = prevSnap.lane[i], b = snap.lane[i];
              if (a === b) { out.graph.sameLane++; const ds = snap.s[i] - prevSnap.s[i]; if (ds < -.01) { out.graph.backwards++; pushS(out.graph.samples, { id: i, kind: 'lùi', ds }); } if (ds > limits.VMAX * dt + .5) { out.graph.teleports++; pushS(out.graph.samples, { id: i, kind: 'nhảy cùng làn', ds: +ds.toFixed(2) }); } continue; }
              out.graph.transitions++;
              // Làn mới phải bắt đầu tại nút cuối làn cũ (≤ 3 bước cho cạnh rất ngắn) và quãng đi ≤ vmax·Δt.
              let ok = false, hops = 0, cur = a, dist = lanes.length[a] - prevSnap.s[i];
              const path = [b];
              if (lanes.to[a] === lanes.from[b]) ok = true;
              else { // cạnh rất ngắn ở giữa: dùng next đã công bố
                const mid = prevSnap.next[i]; if (mid >= 0 && lanes.to[a] === lanes.from[mid] && lanes.to[mid] === lanes.from[b]) { ok = true; dist += lanes.length[mid]; }
              }
              dist += snap.s[i];
              if (!ok || dist > limits.VMAX * dt + 1) { out.graph.teleports++; pushS(out.graph.samples, { id: i, kind: ok ? 'xa' : 'không nối tiếp', from: a, to: b, dist: +dist.toFixed(2) }); }
              if (lanes.edge[a] === lanes.edge[b] && lanes.dir[a] !== lanes.dir[b]) pushS(out.graph.samples, { id: i, kind: 'quay đầu', lane: a });
            }
          }
          // (c) Oneway theo tag cạnh + (d) khoảng cách cùng làn kể cả qua ranh giới cạnh.
          const byLane = new Map();
          for (let i = 0; i < N; i++) {
            if (!snap.active[i]) continue;
            const l = snap.lane[i], e = lanes.edge[l], ow = G.edges[e].oneway; out.oneway.checked++;
            if ((ow === 'yes' && lanes.dir[l] !== 1) || (ow === '-1' && lanes.dir[l] !== -1)) { out.oneway.bad++; pushS(out.oneway.samples, { id: i, edge: e, oneway: ow, dir: lanes.dir[l] }); }
            let list = byLane.get(l); if (!list) byLane.set(l, list = []); list.push(i);
          }
          const overlapLat = (i, j, latI) => Math.abs(latI - snap.lat[j]) < (snap.wid[i] + snap.wid[j]) / 2;
          for (const [l, list] of byLane) {
            list.sort((p, q) => snap.s[p] - snap.s[q]);
            for (let a = 0; a < list.length; a++) {
              const i = list[a]; let found = false;
              for (let b = a + 1; b < list.length; b++) {
                const j = list[b]; if (!overlapLat(i, j, snap.lat[i])) continue;
                out.gap.pairs++; found = true;
                const d = snap.s[j] - snap.s[i], need = (snap.len[i] + snap.len[j]) / 2 + limits.MIN_GAP;
                if (d < need) { out.gap.bad++; pushS(out.gap.samples, { lane: l, a: i, b: j, d: +d.toFixed(2), need: +need.toFixed(2) }); }
                break;
              }
              if (found) continue;
              const nl = snap.next[i]; if (nl < 0) continue;
              const tail = byLane.get(nl); if (!tail) continue;
              let first = null; for (const j of tail) if (Math.abs((lanes.offset[nl] + (snap.lat[i] - lanes.offset[l])) - snap.lat[j]) < (snap.wid[i] + snap.wid[j]) / 2 && (first === null || snap.s[j] < snap.s[first])) first = j;
              if (first === null) continue;
              out.gap.pairs++; out.gap.crossEdge++;
              const d = lanes.length[l] - snap.s[i] + snap.s[first], need = (snap.len[i] + snap.len[first]) / 2 + limits.MIN_GAP;
              if (d < need) { out.gap.bad++; pushS(out.gap.samples, { lane: l, next: nl, a: i, b: first, d: +d.toFixed(2), need: +need.toFixed(2), across: true }); }
            }
          }
          // (e) Xe trên cầu.
          let onBridge = 0;
          for (let i = 0; i < N; i++) if (snap.active[i] && G.edges[lanes.edge[snap.lane[i]]].elevationClass !== 'ground') onBridge++;
          if (onBridge) out.bridge.framesWith++; out.bridge.maxCount = Math.max(out.bridge.maxCount, onBridge);
          // (f) Hướng mũi xe, đi bên phải, y trên cầu: cho xe đã vẽ, tính độc lập từ toạ độ ma trận.
          for (const b of boxes) {
            const l = snap.lane[b.id], e = lanes.edge[l], E = G.edges[e], pr = edgeProject(e, b.x, b.z); if (!pr) continue;
            const tx = pr.tx * lanes.dir[l], tz = pr.tz * lanes.dir[l];
            // Hướng mũi: chỉ xét đoạn thẳng (ngoài vùng nút và đỉnh gãy, nơi xe đang vào cua); đi ngược chiều được bắt ở mục (c) theo làn ↔ tag.
            const straight = straightPart(e, pr);
            if (straight) out.heading.checked++;
            if (straight && b.fx * tx + b.fz * tz < .2) { out.heading.bad++; pushS(out.heading.samples, { id: b.id, edge: e, dot: +(b.fx * tx + b.fz * tz).toFixed(2), x: +b.x.toFixed(1), z: +b.z.toFixed(1) }); }
            // Đi bên phải: chỉ xét đoạn thẳng (xa nút ≥ 12 m, xa đỉnh gãy ≥ 6 m), nơi tiếp tuyến không bị pha trộn ở góc.
            if (E.oneway === 'no' && straight) { out.right.checked++; const latRight = pr.lat * lanes.dir[l]; if (latRight < limits.RIGHT_MIN) { out.right.bad++; pushS(out.right.samples, { id: b.id, edge: e, lat: +latRight.toFixed(2) }); } }
            if (E.elevationClass !== 'ground' && E.profile) { out.bridge.drawnOn++; if (pr.s > 2 && pr.s < E.length - 2) { out.bridge.ySamples++; const want = api.surfaceAbove ? api.surfaceAbove(b.x, b.z, pr.y) : pr.y, dy = Math.abs(b.y - want); out.bridge.yWorst = Math.max(out.bridge.yWorst, dy); if (dy > limits.BRIDGE_Y_TOL) pushS(out.bridge.yBad, { id: b.id, edge: e, y: +b.y.toFixed(3), want: +want.toFixed(3), profile: +pr.y.toFixed(3) }); } }
          }
          // (g) OBB toàn bộ xe đang hoạt động mỗi 10 khung (vị trí mô phỏng).
          if (out.frames % 10 === 0) {
            const P = api.poses(), all = [];
            for (let i = 0; i < N; i++) { if (!snap.active[i]) continue; const o = i * 5, yaw = P[o + 3]; all.push({ id: i, x: P[o], y: P[o + 1], z: P[o + 2], fx: Math.cos(yaw), fz: Math.sin(yaw), hl: api.kinds[snap.kind[i]].length / 2, hw: api.kinds[snap.kind[i]].width / 2 }); }
            const rr = overlapPairs(all, 8, out.allObbSamples); out.allObbFrames++; out.allObbOverlaps += rr.bad;
          }
        }
        prevDrawn = map; prevSnap = snap; prevT = now;
        if (now - start < seconds * 1000) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    if (api) { const st = api.stats(); out.stats = st; out.cpu = api.cpuSamples(); }
    return out;
  }, { seconds, limits });
}

// Bước H: setRegion(null | {id, polygon}) — khu thử tự định nghĩa (nửa tây / nửa đông theo bbox đồ thị), chạy trong trình duyệt.
function regionProbe() {
  const api = window.webgpuMaterials24.motion.api, G = window.ROAD_GRAPH_31;
  const ext = G.frame.extent, M = 60, midX = 0;
  const rects = { tay: [ext[0] - M, ext[2] - M, midX, ext[3] + M], dong: [midX, ext[2] - M, ext[1] + M, ext[3] + M] };
  const polyOf = ([x0, z0, x1, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const activeCount = () => { const s = api.snapshot(); let n = 0; for (let i = 0; i < s.active.length; i++) n += s.active[i]; return n; };
  const lf = api.sim.lightFactor, out = { hasApi: typeof api.setRegion === 'function', lf, items: [] };
  if (!out.hasApi) return out;
  const overshoot = (r, P, i) => Math.max(r[0] - P[i * 5], P[i * 5] - r[2], r[1] - P[i * 5 + 2], P[i * 5 + 2] - r[3]);
  const outsideStats = r => { const P = api.poses(), s = api.snapshot(); let strict = 0, worst = -1e9, n = 0; for (let i = 0; i < s.active.length; i++) if (s.active[i]) { n++; const o = overshoot(r, P, i); if (o > 0) strict++; worst = Math.max(worst, o); } return { n, strict, worst: +worst.toFixed(2) }; };
  const sigIds = api.instances().map((x, i) => (x.signature ? i : -1)).filter(i => i >= 0);
  const full0 = activeCount(); api.setVisibleFraction(1);
  for (const [id, r] of Object.entries(rects)) {
    const before = api.stats(), n0 = api.setRegion({ id, polygon: polyOf(r) }), reg = api.getRegion(), set0 = outsideStats(r);
    let trans0 = api.stats().edgeTransitions;
    const items = { id, n0, reg, eligible: reg.eligible, afterSet: set0, motion: { ...window.webgpuMaterials24.motion.region }, dataset: document.body.dataset.motionRegion + '/' + document.body.dataset.motionRegionActive };
    let worst = -1e9, strictMax = 0, minActive = 1e9, maxActive = 0;
    for (let k = 0; k < 20; k++) { api.advance(1); const o = outsideStats(r); worst = Math.max(worst, o.worst); strictMax = Math.max(strictMax, o.strict); minActive = Math.min(minActive, o.n); maxActive = Math.max(maxActive, o.n); }
    const st = api.stats(); items.after20 = { active: st.active, worst, strictMax, minActive, maxActive, trans: st.edgeTransitions - trans0, gap: st.gapViolations - before.gapViolations, oneway: st.onewayViolations - before.onewayViolations, teleports: st.teleports - before.teleports };
    const sigActive = sigIds.filter(i => api.snapshot().active[i]).length, P = api.poses(); items.signature = { total: sigIds.length, active: sigActive, activeOutside: sigIds.filter(i => api.snapshot().active[i] && overshoot(r, P, i) > 6).length };
    const eligible = reg.eligible; api.setVisibleFraction(.5); const half = activeCount(); api.setVisibleFraction(1);
    items.fraction = { eligible, half, full: activeCount() };
    out.items.push(items);
  }
  // Khôi phục toàn thành phố: đúng tổng round(F·N) (hạng nhớ theo bước), hết xe chờ chỗ ≤ 2 s.
  const target = Math.round(Math.min(1, lf) * api.total), back = api.setRegion(null), wantedBack = api.sim.wantedCount();
  let settleS = 0; while (api.sim.pendingCount() > 0 && settleS < 4) { api.advance(.1); settleS += .1; }
  out.restore = { back, wantedBack, target, full0, pendingAfter: api.sim.pendingCount(), settleS: +settleS.toFixed(1), region: { ...window.webgpuMaterials24.motion.region }, dataset: document.body.dataset.motionRegion + '/' + document.body.dataset.motionRegionActive, active: activeCount() };
  // Tất định: reset + khu + 20 s hai lần.
  const run = () => { api.setRegion(null); api.reset(); api.setRegion({ id: 'tay', polygon: polyOf(rects.tay) }); api.advance(20); return api.stateHash(); };
  out.determinism = { h1: run(), h2: run() };
  // Đa giác sai phải ném lỗi, không làm hỏng trạng thái.
  out.invalid = ['x', { id: 'a', polygon: [[0, 0]] }, { polygon: polyOf(rects.tay) }].map(v => { try { api.setRegion(v); return false; } catch (e) { return e instanceof TypeError; } });
  api.setRegion(null); api.reset();
  return out;
}

async function inspect(page) {
  return page.evaluate(async () => {
    const status = window.webgpuMaterials24, motion = status.motion || {}, api = motion.api, G = window.ROAD_GRAPH_31, D = window.CITY_DATA;
    const out = { motion: Object.fromEntries(Object.entries(motion).filter(([k, v]) => typeof v !== 'object' || v === null || Array.isArray(v)).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 8) : v])), dataset: { ...document.body.dataset } };
    if (!api) return out;
    out.kinds = api.kinds.map(k => ({ name: k.name, length: k.length, width: k.width, height: k.height, triangles: k.triangles }));
    // Bước J: kiểm hình học từng loại xe (kích thước hộp bao, số màu đỉnh, đỉnh sơn/phát sáng) và tổng tam giác theo pool.
    out.geo = api.meshes.map(m => {
      const g = m.geometry, p = g.attributes.position, c = g.attributes.color, e = g.attributes.emit, pm = g.attributes.pm, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], colours = new Set();
      let emissiveVerts = 0, paintVerts = 0;
      for (let i = 0; i < p.count; i++) {
        for (let a = 0; a < 3; a++) { const v = p.array[i * 3 + a]; mn[a] = Math.min(mn[a], v); mx[a] = Math.max(mx[a], v); }
        colours.add([c.array[i * 3], c.array[i * 3 + 1], c.array[i * 3 + 2]].map(v => v.toFixed(2)).join());
        if (e.array[i * 3] + e.array[i * 3 + 1] + e.array[i * 3 + 2] > 0) emissiveVerts++;
        if (pm.array[i] > 0) paintVerts++;
      }
      return { x: +(mx[0] - mn[0]).toFixed(2), y: +(mx[1] - mn[1]).toFixed(2), z: +(mx[2] - mn[2]).toFixed(2), colours: colours.size, emissiveVerts, paintVerts, triangles: p.count / 3, minY: +mn[1].toFixed(3) };
    });
    out.kindPool = api.kinds.map(() => 0); { const kk = api.snapshot().kind; for (let i = 0; i < kk.length; i++) out.kindPool[kk[i]]++; }
    out.meshes = api.drawn().map(d => ({ name: d.mesh.name, count: d.count, capacity: d.mesh.instanceMatrix.count, frustumCulled: d.mesh.frustumCulled, triangles: (d.mesh.geometry.index ? d.mesh.geometry.index.count : d.mesh.geometry.attributes.position.count) / 3, castShadow: d.mesh.castShadow }));
    // Mật độ theo thứ bậc: xe / km làn theo loại đường (trạng thái hiện tại).
    const lanes = api.lanes(), snap = api.snapshot(), perType = {};
    const typeOf = l => { const t = D.roads[G.edges[lanes.edge[l]].road].type.replace(/_link$/, ''); return ['trunk', 'primary', 'secondary', 'tertiary', 'residential'].includes(t) ? t : 'other'; };
    for (let l = 0; l < lanes.edge.length; l++) { const t = typeOf(l); (perType[t] = perType[t] || { km: 0, n: 0 }).km += lanes.length[l] / 1000; }
    for (let i = 0; i < snap.active.length; i++) if (snap.active[i]) perType[typeOf(snap.lane[i])].n++;
    out.densityPerLaneKm = Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, +(v.n / Math.max(1e-6, v.km)).toFixed(2)]));
    out.kindShares = {}; for (let i = 0; i < snap.active.length; i++) if (snap.active[i]) out.kindShares[api.kinds[snap.kind[i]].name] = (out.kindShares[api.kinds[snap.kind[i]].name] || 0) + 1;
    // API mật độ bước E.
    const activeCount = () => { const s = api.snapshot(); let n = 0; for (let i = 0; i < s.active.length; i++) n += s.active[i]; return n; };
    const activeSet = () => { const s = api.snapshot(), ids = []; for (let i = 0; i < s.active.length; i++) if (s.active[i]) ids.push(i); return ids; };
    const full = activeCount(), inst = api.instances();
    api.setVisibleFraction(.5); const halfIds = activeSet();
    api.setVisibleFraction(1); api.setVisibleFraction(.5); const halfIds2 = activeSet();
    const sigTotal = inst.filter(i => i.signature).length, sigHalf = halfIds.filter(i => inst[i].signature).length;
    // Thưa đều: không ô 400 m nào (≥ 8 xe) còn < 25 % khi f = 0,5.
    const cells = new Map();
    api.setVisibleFraction(1); const fullIds = activeSet(), Pf = api.poses();
    for (const i of fullIds) { const k = Math.floor(Pf[i * 5] / 400) + ',' + Math.floor(Pf[i * 5 + 2] / 400); const c = cells.get(k) || { all: 0, half: 0 }; c.all++; cells.set(k, c); }
    const halfSet = new Set(halfIds);
    for (const i of fullIds) if (halfSet.has(i)) cells.get(Math.floor(Pf[i * 5] / 400) + ',' + Math.floor(Pf[i * 5 + 2] / 400)).half++;
    api.setVisibleFraction(0); const zero = activeCount();
    const returned = api.setDensity('full'); const restored = activeCount();
    // Xe có chỗ cũ đã bị chiếm chờ tái sinh ở nút biên các bước kế: sau 2 s phải về lại ≥ 99 % (số xe hoạt động tự dao động ±0,5 % do tái sinh).
    api.advance(2); const settled = activeCount();
    const viaTraffic = window.webgpuMaterials24.traffic?.api === api, retHalf = api.setVisibleFraction(.5), countHalf = activeCount(); api.setDensity('full');
    out.densityApi = { viaTraffic, returned, retHalf, countHalf, total: api.total, full, half: halfIds.length, halfSame: JSON.stringify(halfIds) === JSON.stringify(halfIds2), sigTotal, sigHalf, zero, restored, settled, emptied: [...cells.values()].filter(c => c.all >= 8 && c.half / c.all < .25).length, hasSetDensity: typeof api.setDensity === 'function', instances: inst.length, instanceKeys: Object.keys(inst[0] || {}) };
    // Khôi phục đúng tổng bất kể sim chạy/tái sinh bao lâu: F → thấp → chạy → F cũ phải cho đúng số xe đích (wanted) và số xe hoạt động cũ.
    const lf = api.sim.lightFactor, targetOf = f => Math.round(Math.min(1, f * lf) * api.total);
    out.restore = [];
    for (const [hi, lo, T] of [[1, .5, 0], [1, .35, 7], [1, .15, 40], [.6, .3, 25], [1, 0, 60]]) {
      const a = api.setVisibleFraction(hi), wa = api.sim.wantedCount(); api.advance(T);
      api.setVisibleFraction(lo); const wl = api.sim.wantedCount(); api.advance(T / 2);
      const b = api.setVisibleFraction(hi), wb = api.sim.wantedCount(), pend = api.sim.pendingCount();
      // Xe không còn chỗ cũ chờ tái sinh ở nút biên (mỗi làn vào nhận lần lượt từng xe): phải hết chờ trong ≤ 5 s.
      let settleS = 0; while (api.sim.pendingCount() > 0 && settleS < 6) { api.advance(.1); settleS += .1; }
      out.restore.push({ hi, lo, T, a, b, wa, wb, wl, target: targetOf(hi), targetLo: targetOf(lo), pend, settleS: +settleS.toFixed(1), settled: activeCount() });
    }
    api.setVisibleFraction(1);
    // Tất định: reset + advance(20 s) hai lần → cùng hash.
    api.reset(); api.advance(20); const h1 = api.stateHash(), t1 = api.snapshot().t;
    api.reset(); api.advance(20); const h2 = api.stateHash();
    out.determinism = { h1, h2, t1 };
    // Không kẹt vĩnh viễn: chạy thêm 160 s, thời gian dừng liên tục lâu nhất và số lần phá kẹt.
    api.advance(160); out.longRun = api.stats();
    api.reset();
    return out;
  });
}

async function lightDensity(page) {
  const counts = {};
  for (const light of ['day', 'golden', 'night']) {
    await page.click(`#cityNav [data-light="${light}"]`); await page.waitForTimeout(600);
    counts[light] = await page.evaluate(() => { const api = window.webgpuMaterials24.motion?.api; if (!api) return null; const s = api.snapshot(); let n = 0; for (let i = 0; i < s.active.length; i++) n += s.active[i]; return { active: n, emissive: api.lightLevel?.() ?? null }; });
  }
  await page.click('#cityNav [data-light="day"]'); await page.waitForTimeout(400);
  return counts;
}

async function runBackend(browser, backend) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(initProbe);
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${BASE}?v=30b&view=materials${backend === 'webgl' ? '&backend=webgl' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 240000 });
  const result = { windows: {} };
  for (const w of VIEWS) {
    await page.evaluate(view => window.webgpuMaterials24.selectView(view), w.view);
    await page.waitForTimeout(3500);
    await page.evaluate(pose => { window.__probe.pose = pose || null; }, w.pose || null);
    await page.waitForTimeout(800);
    result.windows[w.id] = await sample(page, SAMPLE_S, LIMITS);
  }
  await page.evaluate(() => { window.__probe.pose = null; });
  result.light = await lightDensity(page);
  Object.assign(result, await inspect(page));
  result.region = await page.evaluate(regionProbe);
  result.actualBackend = await page.evaluate(() => window.webgpuMaterials24.backend);
  result.errors = errors;
  await context.close();
  return result;
}

const pct = (list, p) => { const s = list.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {};
  try {
    for (const backend of backends) {
      let r;
      try { r = report[backend] = await runBackend(browser, backend); }
      catch (error) { check(`[${backend}] mở app và lấy mẫu`, () => { throw error; }); continue; }
      const tag = `[${backend}] `;
      check(tag + 'API giao thông 31D (materialStatus.motion.api)', () => assert(Object.values(r.windows).every(w => w.api), 'thiếu webgpuMaterials24.motion.api'));
      for (const [id, w] of Object.entries(r.windows)) {
        const t = `${tag}[${id} · ${SAMPLE_S} s] `;
        check(t + 'có xe được vẽ và lấy mẫu đủ khung', () => { assert(w.frames >= SAMPLE_S * 15, `chỉ ${w.frames} khung`); assert(w.drawnMax >= 20, `chỉ ${w.drawnMax} xe được vẽ`); assert(w.matrixPairs > 1000, `chỉ ${w.matrixPairs} cặp khung`); });
        check(t + '0 teleport giữa đường theo ma trận đã vẽ (Δ ≤ vmax·Δt·1,6 + 0,3 m, trừ tái sinh có cờ)', () => assert.equal(w.matrixJumps, 0, JSON.stringify(w.jumpSamples)));
        check(t + '0 cặp xe xuyên nhau (OBB) trong các xe đã vẽ', () => assert.equal(w.obbOverlaps, 0, JSON.stringify(w.obbSamples)));
        check(t + '0 cặp xe xuyên nhau (OBB) trên toàn bộ xe đang chạy', () => { assert(w.allObbFrames > 0, 'chưa kiểm toàn bộ'); assert.equal(w.allObbOverlaps, 0, JSON.stringify(w.allObbSamples)); });
        check(t + 'đồ thị: 0 teleport/lùi, có chuyển cạnh, tái sinh chỉ có cờ', () => { const g = w.graph; assert(g.transitions > 50, `chỉ ${g.transitions} lần chuyển cạnh`); assert.equal(g.teleports, 0, JSON.stringify(g.samples)); assert.equal(g.backwards, 0, JSON.stringify(g.samples)); });
        check(t + '0 xe ngược chiều oneway (làn ↔ tag) và mũi xe cùng hướng cạnh', () => { assert(w.oneway.checked > 0 && w.heading.checked > 500); assert.equal(w.oneway.bad, 0, JSON.stringify(w.oneway.samples)); assert.equal(w.heading.bad, 0, JSON.stringify(w.heading.samples)); });
        check(t + 'đường hai chiều: xe đi bên phải tim đường', () => { assert(w.right.checked > 200, `chỉ ${w.right.checked} mẫu`); assert.equal(w.right.bad, 0, JSON.stringify(w.right.samples)); });
        check(t + `0 cặp xe cùng làn gần hơn (L₁+L₂)/2 + ${LIMITS.MIN_GAP} m, kể cả qua ranh giới cạnh`, () => { assert(w.gap.pairs > 1000 && w.gap.crossEdge > 0, JSON.stringify({ pairs: w.gap.pairs, cross: w.gap.crossEdge })); assert.equal(w.gap.bad, 0, JSON.stringify(w.gap.samples)); });
        check(t + 'có xe trên cầu ở mọi khung', () => assert(w.bridge.framesWith >= w.graph.steps * .95 && w.bridge.maxCount > 0, JSON.stringify(w.bridge)));
      }
      const bs = r.windows['ba-son'];
      check(tag + `xe đi qua cầu Ba Son được vẽ, y khớp mặt cầu vẽ (profile, nâng lên mặt chồng ≤ 0,5 m) ≤ ${LIMITS.BRIDGE_Y_TOL} m`, () => { assert(bs.bridge.ySamples > 200, `chỉ ${bs.bridge.ySamples} mẫu y trên cầu`); assert(bs.bridge.yWorst <= LIMITS.BRIDGE_Y_TOL, JSON.stringify(bs.bridge.yBad)); });
      check(tag + 'tất định: reset + 20 s hai lần cùng hash', () => { const d = r.determinism; assert(d && d.h1 && d.h1 === d.h2, JSON.stringify(d)); assert(Math.abs(d.t1 - 20) < 1e-6); });
      check(tag + 'không kẹt vĩnh viễn sau 180 s: dừng liên tục lâu nhất < 120 s, vẫn còn chuyển cạnh', () => { const s = r.longRun; assert(s, 'thiếu stats'); assert(s.maxStopS < 120, `dừng ${s.maxStopS} s`); assert(s.edgeTransitionsLast30s > 100, JSON.stringify(s)); assert.equal(s.gapViolations, 0); assert.equal(s.teleports, 0); assert.equal(s.onewayViolations, 0); });
      check(tag + 'giao lộ: có đèn giả lập ở trục chính và xe dừng chờ', () => { const s = r.longRun; assert(s.signals >= 20, `chỉ ${s.signals} đèn`); assert(s.controlledNodes >= 500, JSON.stringify(s)); assert(s.waitingNow > 0 || s.waitsTotal > 0, JSON.stringify(s)); });
      check(tag + 'mật độ theo thứ bậc: trục chính đông hơn đường nội bộ', () => { const d = r.densityPerLaneKm; assert(d.primary > d.residential * 2 && d.trunk > d.residential * 2 && d.secondary > d.residential, JSON.stringify(d)); });
      check(tag + 'xe máy chiếm đa số, có ô tô, xe buýt và xe tải', () => { const k = r.kindShares, total = Object.values(k).reduce((a, b) => a + b, 0); assert(k.motorbike / total > .55 && k.car > 0 && k.bus > 0 && k.truck > 0, JSON.stringify(k)); });
      check(tag + 'mật độ theo giờ: giờ vàng ≥ ngày > đêm, đêm xe phát sáng', () => { const l = r.light; assert(l.day && l.golden.active >= l.day.active && l.night.active < l.day.active * .8, JSON.stringify(l)); assert(l.night.emissive > l.day.emissive, JSON.stringify(l)); });
            check(tag + 'API bước H setRegion: xe ngoài khu tắt, có chuyển cạnh, 0 vi phạm gap/oneway/teleport, F áp lên xe trong khu, khôi phục setRegion(null), tất định', () => {
        const g = r.region; assert(g && g.hasApi, 'thiếu api.setRegion');
        assert.equal(g.items.length, 2, JSON.stringify(g.items.map(x => x.id)));
        for (const it of g.items) {
          assert(it.reg.active && it.reg.id === it.id && it.motion.active && it.motion.id === it.id && it.dataset === it.id + '/1', 'motion.region/dataset sai: ' + JSON.stringify(it));
          assert(it.eligible > 150 && it.eligible < r.densityApi.total, 'số xe trong khu bất thường: ' + it.eligible);
          assert(it.after20.worst <= 6, it.id + ': xe vượt ra ngoài khu ' + it.after20.worst + ' m (' + it.after20.strictMax + ' xe lấn tối đa)');
          const want = Math.round(it.eligible * Math.min(1, g.lf)); assert(it.after20.minActive >= want * .97 && it.after20.maxActive <= want * 1.01 + 2, it.id + ': số xe trong khu tụt: ' + JSON.stringify(it.after20));
          assert(it.after20.trans > 200, it.id + ': ít chuyển cạnh: ' + it.after20.trans);
          assert.equal(it.after20.gap, 0, it.id + ' gap'); assert.equal(it.after20.oneway, 0, it.id + ' oneway'); assert.equal(it.after20.teleports, 0, it.id + ' teleport');
          assert.equal(it.signature.activeOutside, 0, it.id + ': xe signature ngoài khu vẫn chạy');
          assert(Math.abs(it.fraction.half - want / 2) <= want * .08 + 2 && it.fraction.full >= want * .97, 'F=0,5 trong khu: ' + JSON.stringify(it.fraction));
        }
        assert.equal(g.items[0].eligible + g.items[1].eligible <= r.densityApi.total, true);
        const t = g.restore; assert.equal(t.wantedBack, t.target, 'setRegion(null) không khôi phục đúng tổng round(F·N): ' + JSON.stringify(t));
        assert(t.back >= t.target * .98 && t.pendingAfter === 0 && t.settleS <= 2 && t.active >= t.target * .995 && !t.region.active && t.dataset === '/0', JSON.stringify(t));
        assert(g.determinism.h1 && g.determinism.h1 === g.determinism.h2, 'setRegion không tất định: ' + JSON.stringify(g.determinism));
        assert.deepEqual(g.invalid, [true, true, true], 'đầu vào sai phải ném TypeError');
      });
      check(tag + 'API bước E: setVisibleFraction thưa đều, xác định, giữ signature; setDensity khôi phục', () => {
        const d = r.densityApi; assert(d, 'thiếu');
        assert(d.hasSetDensity && d.instances >= d.full && d.instanceKeys.includes('signature'), JSON.stringify(d));
        assert(Math.abs(d.half - d.full / 2) <= d.full * .12 + d.sigTotal, JSON.stringify(d));
        assert(d.halfSame, 'f=0,5 hai lần cho hai tập khác nhau');
        assert.equal(d.sigHalf, d.sigTotal, 'f=0,5 làm mất xe signature');
        assert.equal(d.zero, d.sigTotal, 'f=0 phải còn đúng xe signature');
        assert.equal(d.emptied, 0, 'f=0,5 làm trống cả một ô 400 m');
        assert(d.restored >= d.full * .99 && d.restored <= d.full * 1.01, 'setDensity(full) lệch > 1 %: ' + JSON.stringify(d));
        assert(d.settled >= d.full * .99, 'sau 2 s chưa hồi đủ xe: ' + JSON.stringify(d));
        assert(d.viaTraffic, 'webgpuMaterials24.traffic.api phải là cùng API (bộ điều phối mật độ E/F gọi đường này)');
        assert(d.returned === d.restored && d.retHalf === d.countHalf, 'setDensity/setVisibleFraction phải trả về số xe đang hoạt động: ' + JSON.stringify(d));
        assert(d.total >= d.full, 'api.total phải là sức chứa pool xe');
      });
      check(tag + 'API bước E: F → thấp → F cũ khôi phục đúng tổng xe dù sim đã chạy 0–60 s', () => {
        assert(r.restore?.length === 5, 'thiếu dữ liệu restore');
        for (const x of r.restore) {
          const j = JSON.stringify(x);
          assert.equal(x.wa, x.target, 'số xe đích F=' + x.hi + ' phải = round(F·tổng·ánh sáng): ' + j);
          assert.equal(x.wb, x.wa, 'số xe đích sau khôi phục lệch: ' + j);
          assert(x.lo === 0 ? x.wl >= 0 : x.wl === x.targetLo, 'số xe đích khi thưa lệch round(F·N): ' + j);
          assert(x.b <= x.wb && x.b >= x.wb * .998 && x.b + x.pend === x.wb, 'sau khôi phục số xe hoạt động + xe chờ chỗ phải = số xe đích (xe chờ chỗ ≤ 0,2 %): ' + j);
          assert(x.settleS <= 5 && x.settled === x.wb, 'sau tối đa 5 s mọi xe đích phải có chỗ, tổng khôi phục đúng ' + x.wb + ': ' + j);
        }
      });
      check(tag + 'hình xe: 4 loại tỉ lệ thật, tam giác hợp lý, InstancedMesh ít draw call', () => {
        assert.deepEqual(r.kinds.map(k => k.name), ['motorbike', 'car', 'bus', 'truck']);
        assert(r.kinds.every(k => k.triangles <= 300), JSON.stringify(r.kinds));   // bước J: tối đa ~2× mô hình hộp 30B/31D (≈ 150)
        const BASE_TRI = [144, 156, 144, 144], pool = r.kindPool;                 // mô hình hộp cũ, tổng theo pool xe thật
        const before = pool.reduce((a, n, k) => a + n * BASE_TRI[k], 0), after = pool.reduce((a, n, k) => a + n * r.kinds[k].triangles, 0);
        assert(after <= 2 * before, `tổng tam giác xe ${after} > 2 × ${before}`);
        assert(r.meshes.length === r.kinds.length, JSON.stringify(r.meshes));
        // Bước J: mỗi loại là một khối có nhiều màu (xe máy có người lái, ô tô có cabin kính, buýt có dải cửa sổ, tải có cabin + thùng),
        // đèn phát sáng, vùng sơn riêng từng xe; hộp bao còn trong kích thước mô phỏng.
        const [gm, gc, gb, gt] = r.geo;
        assert(gm.colours >= 8 && gc.colours >= 6 && gb.colours >= 6 && gt.colours >= 6, JSON.stringify(r.geo.map(g => g.colours)));
        assert(r.geo.every(g => g.emissiveVerts > 0 && g.paintVerts > 0 && g.minY >= -.001), JSON.stringify(r.geo));
        assert(gm.x > 1.7 && gm.x < 2.2 && gm.z < .8 && gm.y > 1.5 && gm.y < 1.75 && gc.x > 4.3 && gc.x < 4.7 && gc.z > 1.7 && gc.z < 1.95 && gc.y > 1.3 && gc.y < 1.6 && gb.x > 11.8 && gb.x < 12.3 && gb.z < 3 && gt.x > 7.1 && gt.x < 7.7 && gt.z < 2.8, JSON.stringify(r.geo));
        const [m, c, b, t] = r.kinds; assert(Math.abs(m.length - 1.9) < .15 && m.width <= .8 && Math.abs(c.length - 4.5) < .3 && Math.abs(c.width - 1.8) < .1 && Math.abs(b.length - 12) < .6 && Math.abs(b.width - 2.5) < .1 && t.length > 6 && t.length < 9, JSON.stringify(r.kinds));
      });
      check(tag + `CPU vòng cập nhật xe ≤ baseline (trung bình, p95)`, () => {
        const mine = Object.values(r.windows).flatMap(w => w.cpu || []);
        assert(mine.length > 300, `chỉ ${mine.length} mẫu CPU`);
        const mean = mine.reduce((a, b) => a + b, 0) / mine.length, p95 = pct(mine, .95);
        const base = baselineCpu.runs.filter(x => ['materials', 'bason'].includes(x.view));
        const baseMean = base.reduce((a, x) => a + x.cpu.mean, 0) / base.length, baseP95 = Math.max(...base.map(x => x.cpu.p95));
        r.cpuSummary = { mean: +mean.toFixed(3), p50: pct(mine, .5), p95, baseMean: +baseMean.toFixed(3), baseP95 };
        assert(mean <= baseMean && p95 <= baseP95, JSON.stringify(r.cpuSummary));
      });
      check(tag + 'materialStatus.motion + dataset: số xe, chuyển cạnh, vi phạm = 0, xe trên cầu, CPU, nhãn minh họa', () => {
        const m = r.motion, d = r.dataset;
        for (const key of ['active', 'edgeTransitions', 'gapViolations', 'onewayViolations', 'teleports', 'onBridge', 'cpuMsP50', 'cpuMsP95']) assert(key in m, `thiếu motion.${key}`);
        assert(/illustrative/.test(m.classification) && /minh họa/.test(m.classification), m.classification);
        assert(m.active > 0 && m.gapViolations === 0 && m.onewayViolations === 0 && m.teleports === 0, JSON.stringify(m));
        for (const key of ['motionTraffic', 'motionActive', 'motionEdgeTransitions', 'motionGapViolations', 'motionOnewayViolations', 'motionTeleports', 'motionOnBridge', 'motionCpuP95', 'motionVessels', 'motionVesselOutside']) assert(key in d, `thiếu dataset.${key}`);
        assert.equal(d.motionVesselOutside, '0'); assert.equal(d.motionVesselHeadingMismatch, '0');
        assert(m.surfaceChecked > 1000 && m.belowRoad === 0, JSON.stringify({ c: m.surfaceChecked, b: m.belowRoad }));
      });
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
    if (report.webgpu?.determinism && report.webgl?.determinism) check('tất định giữa WebGPU và WebGL 2 (cùng seed, cùng 20 s)', () => assert.equal(report.webgpu.determinism.h1, report.webgl.determinism.h1));
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, {
      windows: Object.fromEntries(Object.entries(r.windows || {}).map(([id, w]) => [id, { frames: w.frames, drawnMax: w.drawnMax, active: [w.activeMin, w.activeMax], matrixPairs: w.matrixPairs, matrixJumps: w.matrixJumps, obbChecks: w.obbChecks, obbOverlaps: w.obbOverlaps, allObbOverlaps: w.allObbOverlaps, graph: { ...w.graph, samples: undefined }, oneway: w.oneway.bad, heading: [w.heading.checked, w.heading.bad], right: [w.right.checked, w.right.bad], gap: { pairs: w.gap.pairs, cross: w.gap.crossEdge, bad: w.gap.bad }, bridge: { ...w.bridge, yBad: undefined } }])),
      determinism: r.determinism, longRun: r.longRun, densityPerLaneKm: r.densityPerLaneKm, kindShares: r.kindShares, light: r.light, densityApi: r.densityApi, kinds: r.kinds, geo: r.geo, kindPool: r.kindPool, meshes: r.meshes, cpu: r.cpuSummary, motion: r.motion, errors: r.errors
    }]));
    console.log(JSON.stringify({ suite: 'traffic-31 · D', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
