/*
 * QA 31A · bước E2: cột đèn theo mép đường hợp nhất, vạch zebra, footway trùng lòng đường.
 * File riêng (không chung qa-road-traffic-31.cjs đang được bước C sửa); bước release có thể gộp.
 *
 * Mọi phép đo hình học chạy trong trình duyệt thật trên dữ liệu module đã dựng. Mặt đường dùng để kiểm là
 * chính các tứ giác mép trái/phải của mảnh asphalt (đúng hình đã vẽ) và polygon giao lộ asphalt, độc lập với
 * chỉ mục tra cứu mà module đèn dùng nội bộ.
 *
 * Chạy (server serve.py phải đang chạy):
 *   node outputs/hcmc-poc/scripts/qa-street-furniture-31.cjs            → WebGPU + WebGL 2
 *   node outputs/hcmc-poc/scripts/qa-street-furniture-31.cjs webgpu     → chỉ một backend
 * Biến môi trường: PORT (mặc định 8768) hoặc CITY_URL, PW_MODULE, PW_CHROME.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || `http://127.0.0.1:${process.env.PORT || 8768}/hcmc-poc/webgpu-materials-24.html`;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Ngưỡng E2 (đồng bộ với city-street-furniture-31.js; QA đặt độc lập để không tự xác nhận).
const JUNCTION_CLEAR_M = 4;      // tâm cột cách polygon giao lộ asphalt tối thiểu
const CROSSING_CLEAR_M = 4;      // tâm cột cách dải zebra tối thiểu
const POLE_RADIUS_M = .3;        // bán kính kiểm va chạm của cột
const BRIDGE_CLEARANCE_M = 9;    // cột 8,2 m dưới mặt cầu thấp hơn ngưỡng này là xuyên cầu
const ZEBRA_Y_TOL_M = .05;
const FOOTWAY_ON_ROAD_SHARE = .6; // footway còn vẽ mà ≥ 60 % mẫu tim nằm trên asphalt cùng cao độ = ribbon trùng lòng đường

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 600) }); } };

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file)).toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex');
let furniture = null;
check('dữ liệu street-furniture-31: version 31A, seed, provenance khớp hash, wrapper .js trùng JSON', () => {
  assert(fs.existsSync(path.join(root, 'data/street-furniture-31.json')), 'thiếu data/street-furniture-31.json');
  furniture = JSON.parse(read('data/street-furniture-31.json'));
  assert.equal(furniture.version, '31A'); assert.equal(furniture.seed, 31);
  assert(furniture.generated?.script && furniture.generated.inputs.length >= 2);
  for (const input of furniture.generated.inputs) assert.equal(sha(input.path), input.sha256, `${input.path} đã đổi: chạy lại build_street_furniture_31.py`);
  const js = read('data/street-furniture-31.js'), prefix = 'window.STREET_FURNITURE_31=';
  assert(js.startsWith(prefix));
  assert.deepStrictEqual(JSON.parse(js.slice(prefix.length).trim().replace(/;$/, '')), furniture);
  assert(furniture.crossings.length >= 300, `chỉ ${furniture.crossings.length} crossing`);
});
check('mã nguồn: module đèn mới được nạp, runtime 28 không còn tự đặt đèn theo tim từng way', () => {
  const app = read('webgpu-materials-24.js'), detail = read('city-detail-runtime-28.js');
  assert(/from '\.\/city-street-furniture-31\.js\?v=[^']+'/.test(app), 'chưa import city-street-furniture-31.js');
  assert(!/width\*\.5\+1\.8/.test(detail), 'city-detail-runtime-28.js còn đặt đèn tại width/2+1,8');
  assert(/data\/street-furniture-31\.js/.test(read('webgpu-materials-24.html')), 'html chưa nạp data/street-furniture-31.js');
});

async function inspect(page, hidden) {
  return page.evaluate(async ({ hidden, limits }) => {
    const status = window.webgpuMaterials24, net = status.roadNetwork, sf = status.streetFurniture, G = window.ROAD_GRAPH_31, D = window.CITY_DATA;
    if (!net?.api) return { missing: 'roadNetwork' };
    const api = net.api, groundY = G.frame.groundY, out = { sfState: sf?.state || null };
    const scenes = window.__probeScenes || [];
    const meshesNamed = re => { const list = []; for (const s of scenes) s.traverse(o => { if (o.isMesh && re.test(o.name)) list.push(o); }); return list; };
    // --- Mặt asphalt đã vẽ: tứ giác mảnh + polygon giao lộ (lưới 25 m).
    const cell = 25, grid = new Map(), key = (gx, gz) => gx * 1048576 + gz;
    const insert = (item, x0, z0, x1, z1) => { for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) { const k = key(gx, gz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item); } };
    const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    // y trên tứ giác (hai tam giác L0 R0 L1 / L1 R0 R1) bằng barycentric.
    const triY = (p, q, r, x, z) => { const det = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]); if (Math.abs(det) < 1e-12) return null; const w0 = ((q[1] - r[1]) * (x - r[0]) + (r[0] - q[0]) * (z - r[1])) / det, w1 = ((r[1] - p[1]) * (x - r[0]) + (p[0] - r[0]) * (z - r[1])) / det, w2 = 1 - w0 - w1; return w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6 ? w0 * p[2] + w1 * q[2] + w2 * r[2] : null; };
    const junctionPolys = [];
    for (let r = 0; r < D.roads.length; r++) for (const piece of api.pieces(r)) {
      if (piece.group !== 'asphalt') continue;
      const L = piece.left, R = piece.right, n = L.length / 3;
      for (let k = 0; k < n - 1; k++) {
        const quad = [[L[k * 3], L[k * 3 + 2], L[k * 3 + 1]], [R[k * 3], R[k * 3 + 2], R[k * 3 + 1]], [R[k * 3 + 3], R[k * 3 + 5], R[k * 3 + 4]], [L[k * 3 + 3], L[k * 3 + 5], L[k * 3 + 4]]];
        const xs = quad.map(p => p[0]), zs = quad.map(p => p[1]);
        insert({ quad, road: r, elevated: piece.elevated }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
      }
    }
    for (const j of api.junctions()) {
      if (j.group !== 'asphalt') continue;
      const poly = j.polygon.map(p => [p[0], p[2], p[1]]), xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
      const item = { poly, junction: j.node, elevated: j.elevated, y: j.y }; insert(item, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
      if (!j.elevated) junctionPolys.push(item);
    }
    // Mọi y asphalt tại (x, z).
    const asphaltYs = (x, z, skipRoad = null) => {
      const ys = [];
      for (const item of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) {
        if (skipRoad && item.road !== undefined && skipRoad(item.road)) continue;
        // polygon giao lộ được vẽ thành quạt tam giác từ đỉnh 0 (y theo từng đỉnh, khác nhau trên dốc dẫn)
        if (item.poly) { if (inPoly(item.poly, x, z)) { let y = null; for (let k = 1; k < item.poly.length - 1 && y === null; k++) y = triY(item.poly[0], item.poly[k], item.poly[k + 1], x, z); ys.push(y ?? item.y); } continue; }
        const [a, b, c, d] = item.quad, y = triY(a, b, d, x, z) ?? triY(d, b, c, x, z);
        if (y !== null) ys.push(y);
      }
      return ys;
    };
    const segDist = (px, pz, ax, az, bx, bz) => { const sx = bx - ax, sz = bz - az, l = sx * sx + sz * sz, t = l ? Math.min(1, Math.max(0, ((px - ax) * sx + (pz - az) * sz) / l)) : 0; return Math.hypot(ax + sx * t - px, az + sz * t - pz); };
    const polyDist = (poly, x, z) => { if (inPoly(poly, x, z)) return 0; let d = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); } return d; };
    const jGrid = new Map(), JC = 40;
    for (const j of junctionPolys) { const xs = j.poly.map(p => p[0]), zs = j.poly.map(p => p[1]); for (let gx = Math.floor((Math.min(...xs) - 10) / JC); gx <= Math.floor((Math.max(...xs) + 10) / JC); gx++) for (let gz = Math.floor((Math.min(...zs) - 10) / JC); gz <= Math.floor((Math.max(...zs) + 10) / JC); gz++) { const k = gx + ',' + gz; if (!jGrid.has(k)) jGrid.set(k, []); jGrid.get(k).push(j); } }
    const nearestJunction = (x, z) => { let d = Infinity; for (const j of jGrid.get(Math.floor(x / JC) + ',' + Math.floor(z / JC)) || []) d = Math.min(d, polyDist(j.poly, x, z)); return d; };

    // --- Vòng xoay: bao lồi đỉnh của từng cụm road junction=roundabout (nối qua node chung).
    const parent = new Map(), find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    const rbRoads = G.roads.filter(r => r.junction === 'roundabout');
    for (const r of rbRoads) for (const n of r.nodes) if (!parent.has(n)) parent.set(n, n);
    for (const r of rbRoads) for (let k = 1; k < r.nodes.length; k++) { const a = find(r.nodes[0]), b = find(r.nodes[k]); if (a !== b) parent.set(a, b); }
    const clusters = new Map();
    for (const r of rbRoads) { const c = find(r.nodes[0]); if (!clusters.has(c)) clusters.set(c, []); for (const p of D.roads[r.index].c) clusters.get(c).push(p); }
    const hull = pts => { const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } lo.pop(); up.pop(); return lo.concat(up); };
    const roundabouts = [...clusters.values()].map(hull).filter(h => h.length >= 3);

    // --- Đèn: đọc ma trận instance của mọi mesh cột đèn đường phố (không gồm đèn hero corridor 30B).
    const poleMeshes = meshesNamed(/Street lamp poles/);
    const lamps = [];
    for (const mesh of poleMeshes) {
      const total = sf?.api?.lampMesh === mesh ? sf.api.instances().length : mesh.count;
      const m = mesh.instanceMatrix.array;
      for (let i = 0; i < total; i++) lamps.push({ x: m[i * 16 + 12], y: m[i * 16 + 13] - m[i * 16 + 5] / 2, z: m[i * 16 + 14] });
    }
    out.poleMeshes = poleMeshes.map(m => ({ name: m.name, count: m.count, triangles: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 }));
    const headMeshes = meshesNamed(/Street lamp heads/);
    out.headMeshes = headMeshes.map(m => ({ name: m.name, count: m.count, triangles: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 }));
    out.lampCount = lamps.length;
    const zebras = sf?.api?.zebras?.() || [];
    const bad = { onAsphalt: [], nearJunction: [], inRoundabout: [], onBridge: [], nearCrossing: [] };
    const push = (list, lamp, extra) => { list.count = (list.count || 0) + 1; if (list.length < 8) list.push({ x: +lamp.x.toFixed(1), z: +lamp.z.toFixed(1), ...extra }); };
    for (const lamp of lamps) {
      // va chạm mặt asphalt cùng cao độ (tâm + 4 điểm trên chu vi cột)
      let hit = false, under = false;
      for (const [dx, dz] of [[0, 0], [limits.POLE_RADIUS_M, 0], [-limits.POLE_RADIUS_M, 0], [0, limits.POLE_RADIUS_M], [0, -limits.POLE_RADIUS_M]]) {
        for (const y of asphaltYs(lamp.x + dx, lamp.z + dz)) { if (Math.abs(y - lamp.y) < 1) hit = true; else if (y > lamp.y && y - lamp.y < limits.BRIDGE_CLEARANCE_M) under = true; }
      }
      if (hit) push(bad.onAsphalt, lamp);
      if (under || lamp.y > groundY + .5) push(bad.onBridge, lamp, { y: +lamp.y.toFixed(2) });
      const dj = nearestJunction(lamp.x, lamp.z); if (dj < limits.JUNCTION_CLEAR_M) push(bad.nearJunction, lamp, { d: +dj.toFixed(2) });
      for (const h of roundabouts) if (inPoly(h, lamp.x, lamp.z)) { push(bad.inRoundabout, lamp); break; }
      for (const zb of zebras) { const d = segDist(lamp.x, lamp.z, zb.a[0], zb.a[1], zb.b[0], zb.b[1]) - zb.halfWidth; if (d < limits.CROSSING_CLEAR_M) { push(bad.nearCrossing, lamp, { d: +d.toFixed(2) }); break; } }
    }
    out.bad = Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, { count: v.count || 0, samples: v.slice() }]));
    // --- Bước G: mọi InstancedMesh đèn/cột khác (đèn hero corridor 30 "Lam Son street lamps", …): 0 cột trong mặt
    //     asphalt hoặc polygon giao lộ. Cột hình trụ đơn vị tâm ở giữa: chân = y − sy/2 (không thấp hơn groundY).
    const otherPoles = meshesNamed(/street lamps|lamp poles|lamp posts|bollards/i).filter(m => m.isInstancedMesh && !poleMeshes.includes(m));
    const otherBad = { onAsphalt: [], inJunction: [] };
    out.otherLampMeshes = otherPoles.map(m => ({ name: m.name, count: m.count }));
    for (const mesh of otherPoles) {
      const m = mesh.instanceMatrix.array, e = mesh.matrixWorld.elements;
      for (let i = 0; i < mesh.count; i++) {
        const lamp = { x: m[i * 16 + 12] + e[12], y: Math.max(groundY, m[i * 16 + 13] - m[i * 16 + 5] / 2 + e[13]), z: m[i * 16 + 14] + e[14], mesh: mesh.name };
        let hit = false;
        for (const [dx, dz] of [[0, 0], [limits.POLE_RADIUS_M, 0], [-limits.POLE_RADIUS_M, 0], [0, limits.POLE_RADIUS_M], [0, -limits.POLE_RADIUS_M]])
          if (asphaltYs(lamp.x + dx, lamp.z + dz).some(y => Math.abs(y - lamp.y) < 1)) hit = true;
        if (hit) push(otherBad.onAsphalt, lamp, { mesh: mesh.name, i });
        if (nearestJunction(lamp.x, lamp.z) < limits.POLE_RADIUS_M) push(otherBad.inJunction, lamp, { mesh: mesh.name, i });
      }
    }
    out.otherLampBad = Object.fromEntries(Object.entries(otherBad).map(([k, v]) => [k, { count: v.count || 0, samples: v.slice() }]));
    out.roundabouts = roundabouts.length;

    // --- Đèn signature: đếm trên vị trí thật bằng registry (module ES nạp trong trang).
    const reg = await import(new URL('signature-registry-31.js', location.href).href);
    const registry = reg.loadSignatureRegistry(window.SIGNATURE_REGISTRY_31 || await (await fetch(new URL('data/signature-registry-31.json', location.href))).json());
    out.signatureActual = lamps.filter(l => registry.inProtectedZone(l.x, l.z, 'lamp')).length;
    // Đèn 30B (city-detail-runtime-28 cũ): mỗi đoạn ≥ 10 m của trục chính, hai bên tại width/2 + 1,8, trong 1 800 m.
    const widths = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8 }, major = new Set(Object.keys(widths));
    let legacy = 0, legacySignature = 0;
    for (const road of D.roads) {
      if (road.bridge || road.tunnel || !major.has(road.type)) continue;
      const width = road.lanes ? Math.max(widths[road.type] || 8, road.lanes * 3.1) : widths[road.type] || 8;
      for (let i = 0; i < road.c.length - 1; i++) {
        const a = road.c[i], b = road.c[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); if (length < 10) continue;
        const steps = Math.floor(length / 62), nx = -dz / length, nz = dx / length;
        for (let step = 0; step <= steps; step++) {
          const t = (step + .5) / (steps + 1), x = a[0] + dx * t, z = a[1] + dz * t; if (Math.hypot(x, z) > 1800) continue;
          for (const side of [-1, 1]) { legacy++; if (registry.inProtectedZone(x + nx * (width * .5 + 1.8) * side, z + nz * (width * .5 + 1.8) * side, 'lamp')) legacySignature++; }
        }
      }
    }
    Object.assign(out, { legacyLamps: legacy, legacySignature });

    // --- Zebra: mesh có polygonOffset mạnh hơn asphalt, mọi góc vạch nằm trên asphalt và sát mặt (≤ 0,05 m).
    const zebraMeshes = meshesNamed(/zebra/i);
    out.zebraMeshes = zebraMeshes.map(m => ({ name: m.name, polygonOffset: m.material.polygonOffset, factor: m.material.polygonOffsetFactor, units: m.material.polygonOffsetUnits, triangles: m.geometry.attributes.position.count / 3 }));
    const asphaltMesh = api.meshes.find(m => m.name.endsWith('mặt đất · asphalt'));
    out.asphaltOffset = asphaltMesh?.material.polygonOffsetFactor;
    let zebraCorners = 0, zebraOff = 0, zebraYWorst = 0, stripes = 0; const zebraSamples = [];
    for (const mesh of zebraMeshes) {
      const p = mesh.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        zebraCorners++;
        const ys = asphaltYs(p[i], p[i + 2]);
        // điểm nằm đúng trên cạnh tứ giác có thể rơi ra ngoài do sai số: thử co 2 cm về tâm vạch
        if (!ys.length) { zebraOff++; if (zebraSamples.length < 6) zebraSamples.push([+p[i].toFixed(2), +p[i + 2].toFixed(2)]); continue; }
        zebraYWorst = Math.max(zebraYWorst, Math.min(...ys.map(y => Math.abs(y - p[i + 1]))));
      }
      stripes += p.length / 18;
    }
    Object.assign(out, { zebraBands: zebras.length, zebraStripes: stripes, zebraCorners, zebraOff, zebraYWorst, zebraSamples });

    // --- Footway: crossing/ribbon trùng lòng đường không còn được vẽ thành dải be.
    let crossingDrawn = 0, hiddenDrawn = 0, footwayOnRoad = 0; const footSamples = [];
    const crossingSet = new Set(hidden.crossings);
    for (const r of hidden.crossings) if (api.pieces(r).length) crossingDrawn++;
    for (const r of hidden.hidden) if (api.pieces(r).length) hiddenDrawn++;
    for (let r = 0; r < D.roads.length; r++) {
      // Cầu bộ hành (bridge=yes) kiểm riêng ở vòng dưới (bước G); vòng này chỉ tính footway thường cho tiêu chí E2.
      if (D.roads[r].type !== 'footway' || D.roads[r].bridge) continue;
      const pieces = api.pieces(r); if (!pieces.length) continue;
      let n = 0, on = 0;
      for (const piece of pieces) { const c = piece.center; for (let k = 0; k < c.length / 3 - 1; k++) for (const t of [.25, .75]) { const x = c[k * 3] + (c[k * 3 + 3] - c[k * 3]) * t, z = c[k * 3 + 2] + (c[k * 3 + 5] - c[k * 3 + 2]) * t, y = c[k * 3 + 1]; n++; if (asphaltYs(x, z).some(v => Math.abs(v - y) < 1)) on++; } }
      if (n && on / n >= limits.FOOTWAY_ON_ROAD_SHARE) { footwayOnRoad++; if (footSamples.length < 6) footSamples.push({ road: r, way: D.roads[r].id, share: +(on / n).toFixed(2), crossing: crossingSet.has(r) }); }
    }
    Object.assign(out, { crossingDrawn, hiddenDrawn, footwayOnRoad, footSamples });
    // --- Bước G: mọi footway/path/cycleway/pedestrian/steps bridge=yes còn vẽ ribbon mà ≥ 60 % tim nằm phẳng trên
    //     asphalt đường xe (cùng cao độ ±1 m) = cầu bộ hành bị "dán" lên lòng đường. Phải bằng 0: hoặc nâng thành
    //     cầu vượt đi bộ thủ tục, hoặc ẩn có lý do.
    const FOOT = new Set(['footway', 'pedestrian', 'path', 'cycleway', 'steps', 'bridleway', 'corridor']);
    const footRoad = i => FOOT.has(D.roads[i].type);
    out.footbridgesOnRoad = []; out.footbridgesChecked = 0;
    for (let r = 0; r < D.roads.length; r++) {
      if (!D.roads[r].bridge || !footRoad(r)) continue;
      const pieces = api.pieces(r); if (!pieces.length) continue;
      out.footbridgesChecked++;
      let n = 0, on = 0;
      for (const piece of pieces) { const c = piece.center; for (let k = 0; k < c.length / 3 - 1; k++) for (const t of [.25, .75]) { const x = c[k * 3] + (c[k * 3 + 3] - c[k * 3]) * t, z = c[k * 3 + 2] + (c[k * 3 + 5] - c[k * 3 + 2]) * t, y = c[k * 3 + 1] + (c[k * 3 + 4] - c[k * 3 + 1]) * t; n++; if (asphaltYs(x, z, footRoad).some(v => Math.abs(v - y) < 1)) on++; } }
      if (n && on / n >= limits.FOOTWAY_ON_ROAD_SHARE) out.footbridgesOnRoad.push({ road: r, way: D.roads[r].id, type: D.roads[r].type, name: D.roads[r].name, share: +(on / n).toFixed(2) });
    }
    const fb = status.bridges?.footbridges;
    out.footbridges = fb ? { state: fb.state, count: fb.count, hidden: fb.hidden, stairs: fb.stairs, clearanceMin: fb.clearanceMin, ways: fb.ways } : null;

    // --- API cho bước E: danh sách instance có cờ signature; setVisibleFraction thưa đều, không giảm signature.
    if (sf?.api) {
      const list = sf.api.instances(), sig = list.filter(i => i.signature).length, mesh = sf.api.lampMesh;
      out.api = { instances: list.length, signature: sig, kinds: [...new Set(list.map(i => i.kind))], hasSetDensity: typeof sf.api.setDensity === 'function' };
      sf.api.setVisibleFraction(.5);
      const half = mesh.count, shown = list.slice(0, half), cells = new Map();
      out.api.halfCount = half; out.api.halfSignature = shown.filter(i => i.signature).length;
      for (const i of list) { const k = Math.floor(i.x / 300) + ',' + Math.floor(i.z / 300); const c = cells.get(k) || { all: 0, shown: 0 }; c.all++; cells.set(k, c); }
      for (const i of shown) cells.get(Math.floor(i.x / 300) + ',' + Math.floor(i.z / 300)).shown++;
      out.api.emptiedCells = [...cells.values()].filter(c => c.all >= 6 && c.shown / c.all < .25).length;
      sf.api.setVisibleFraction(0);
      out.api.zeroCount = mesh.count;
      sf.api.setDensity('high');
      out.api.restoredCount = mesh.count;
      out.counts = sf.counts; out.rejected = sf.rejected;
    }
    // --- Đèn đêm: vật liệu đầu đèn phát sáng theo nightLevel như 30B.
    const head = headMeshes[0];
    out.emissiveNow = head ? head.material.emissiveIntensity : null;
    return out;
  }, { hidden, limits: { JUNCTION_CLEAR_M, CROSSING_CLEAR_M, POLE_RADIUS_M, BRIDGE_CLEARANCE_M, FOOTWAY_ON_ROAD_SHARE } });
}

async function runBackend(browser, backend, hidden) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(() => {
    const hook = new EventTarget();
    hook.addEventListener('observe', event => { const o = event.detail; if (o?.isScene) (window.__probeScenes = window.__probeScenes || []).push(o); });
    window.__THREE_DEVTOOLS__ = hook;
  });
  await page.goto(`${BASE}?v=30b&view=overview${backend === 'webgl' ? '&backend=webgl' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 240000 });
  const result = await inspect(page, hidden);
  // Đèn đêm và giờ vàng: bấm nút ánh sáng như người dùng.
  const emissive = {};
  for (const light of ['day', 'golden', 'night']) {
    await page.click(`#cityNav [data-light="${light}"]`); await page.waitForTimeout(400);
    emissive[light] = await page.evaluate(() => { let v = null; for (const s of window.__probeScenes || []) s.traverse(o => { if (v === null && o.isMesh && /Street lamp heads/.test(o.name)) v = o.material.emissiveIntensity; }); return v; });
  }
  await page.click('#cityNav [data-light="day"]');
  result.emissive = emissive;
  result.actualBackend = await page.evaluate(() => window.webgpuMaterials24.backend);
  result.errors = errors;
  await context.close();
  return result;
}

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const hidden = { crossings: (furniture?.crossings || []).map(c => c.road), hidden: (furniture?.hiddenFootways || []).map(h => h.road) };
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {};
  try {
    for (const backend of backends) {
      let r;
      try { r = report[backend] = await runBackend(browser, backend, hidden); }
      catch (error) { check(`[${backend}] mở app và dựng xong`, () => { throw error; }); continue; }
      const tag = `[${backend}] `;
      check(tag + 'street-furniture-31 đã dựng xong', () => assert.equal(r.sfState, 'ready', `state=${r.sfState}`));
      check(tag + 'có cột đèn (≥ 500) trong đúng 1 InstancedMesh cột + 1 InstancedMesh đầu đèn', () => {
        assert(r.lampCount >= 500, `chỉ ${r.lampCount} cột`);
        assert.equal(r.poleMeshes.length, 1, JSON.stringify(r.poleMeshes)); assert.equal(r.headMeshes.length, 1, JSON.stringify(r.headMeshes));
      });
      check(tag + 'tam giác đèn không tăng so với 30B (cùng hình cột/đầu đèn)', () => {
        const per = r.poleMeshes[0].triangles + r.headMeshes[0].triangles;
        assert(r.lampCount * per <= r.legacyLamps * 40, `${r.lampCount}×${per} > ${r.legacyLamps}×40`);
      });
      check(tag + '0 cột đèn nằm trên mặt asphalt hoặc polygon giao lộ (bán kính cột 0,3 m)', () => assert.equal(r.bad.onAsphalt.count, 0, JSON.stringify(r.bad.onAsphalt)));
      check(tag + 'đèn/cột InstancedMesh khác (hero corridor 30…): 0 cột trong mặt asphalt hoặc giao lộ (bước G)', () => {
        assert(r.otherLampMeshes.some(m => m.name === 'Lam Son street lamps' && m.count > 0), JSON.stringify(r.otherLampMeshes));
        assert.equal(r.otherLampBad.onAsphalt.count, 0, JSON.stringify(r.otherLampBad.onAsphalt));
        assert.equal(r.otherLampBad.inJunction.count, 0, JSON.stringify(r.otherLampBad.inJunction));
      });
      check(tag + '0 cột đèn trong vòng xoay', () => { assert(r.roundabouts >= 5, `chỉ ${r.roundabouts} vòng xoay`); assert.equal(r.bad.inRoundabout.count, 0, JSON.stringify(r.bad.inRoundabout)); });
      check(tag + '0 cột đèn trên cầu hoặc xuyên mặt cầu', () => assert.equal(r.bad.onBridge.count, 0, JSON.stringify(r.bad.onBridge)));
      check(tag + `cột đèn cách polygon giao lộ ≥ ${JUNCTION_CLEAR_M} m`, () => assert.equal(r.bad.nearJunction.count, 0, JSON.stringify(r.bad.nearJunction)));
      check(tag + `cột đèn cách dải zebra ≥ ${CROSSING_CLEAR_M} m`, () => { assert(r.zebraBands >= 200, `chỉ ${r.zebraBands} dải zebra`); assert.equal(r.bad.nearCrossing.count, 0, JSON.stringify(r.bad.nearCrossing)); });
      check(tag + 'đèn signature (hero corridor + Nguyễn Huệ + Bạch Đằng) không ít hơn 30B', () => assert(r.signatureActual >= r.legacySignature, `${r.signatureActual} < 30B ${r.legacySignature}`));
      check(tag + 'zebra: 1 mesh, polygonOffset mạnh hơn asphalt', () => {
        assert.equal(r.zebraMeshes.length, 1, JSON.stringify(r.zebraMeshes));
        const z = r.zebraMeshes[0]; assert(z.polygonOffset === true); assert(z.factor < r.asphaltOffset && z.units < r.asphaltOffset, JSON.stringify({ z, asphalt: r.asphaltOffset }));
      });
      check(tag + 'zebra: mọi góc vạch nằm trên asphalt, lệch mặt ≤ 0,05 m (không lơ lửng, không chìm)', () => {
        assert(r.zebraStripes >= 1000, `chỉ ${r.zebraStripes} vạch`);
        assert.equal(r.zebraOff, 0, `${r.zebraOff}/${r.zebraCorners} góc ra ngoài asphalt ${JSON.stringify(r.zebraSamples)}`);
        assert(r.zebraYWorst <= ZEBRA_Y_TOL_M, `lệch ${r.zebraYWorst}`);
      });
      check(tag + 'footway=crossing và footway trùng lòng đường không còn vẽ thành dải be', () => {
        assert(hidden.crossings.length > 0, 'thiếu danh sách crossing');
        assert.equal(r.crossingDrawn, 0); assert.equal(r.hiddenDrawn, 0);
        assert.equal(r.footwayOnRoad, 0, JSON.stringify(r.footSamples));
      });
      check(tag + 'cầu bộ hành bridge=yes (footway/path/cycleway…) không còn vẽ phẳng trên lòng đường xe (bước G)', () => {
        assert(r.footbridgesChecked > 0, 'không có cầu bộ hành nào được kiểm');
        assert.deepEqual(r.footbridgesOnRoad, []);
      });
      check(tag + 'cầu vượt đi bộ Văn Thánh dựng nâng, tĩnh không ≥ 4,5 m, có cầu thang (bước G)', () => {
        assert(r.footbridges && r.footbridges.state === 'ready', JSON.stringify(r.footbridges));
        const vt = r.footbridges.ways.find(w => w.way === 292941640);
        assert(vt && vt.mode === 'elevated', JSON.stringify(r.footbridges.ways));
        assert(vt.clearance >= 4.5, `tĩnh không ${vt.clearance}`); assert(vt.stairs >= 2, `cầu thang ${vt.stairs}`);
      });
      check(tag + 'API bước E: instances có cờ signature, setVisibleFraction thưa đều và giữ signature', () => {
        assert(r.api, 'thiếu streetFurniture.api');
        assert(r.api.instances === r.lampCount && r.api.signature > 0 && r.api.hasSetDensity, JSON.stringify(r.api));
        assert.equal(r.api.halfSignature, r.api.signature, 'f=0,5 làm mất đèn signature');
        assert(r.api.halfCount < r.api.instances && r.api.halfCount > r.api.signature, JSON.stringify(r.api));
        assert.equal(r.api.zeroCount, r.api.signature, 'f=0 phải còn đúng đèn signature');
        assert.equal(r.api.emptiedCells, 0, 'f=0,5 làm trống cả một ô 300 m');
        assert.equal(r.api.restoredCount, r.api.instances);
      });
      check(tag + 'đèn đêm: phát sáng ở đêm (> 2,5) và giờ vàng cao hơn ngày, như 30B', () => {
        const e = r.emissive; assert(e.night > 2.5 && e.golden > e.day && e.day < .1, JSON.stringify(e));
      });
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, { lampCount: r.lampCount, legacyLamps: r.legacyLamps, signatureActual: r.signatureActual, legacySignature: r.legacySignature, bad: Object.fromEntries(Object.entries(r.bad || {}).map(([n, v]) => [n, v.count])), zebraBands: r.zebraBands, zebraStripes: r.zebraStripes, zebraYWorst: r.zebraYWorst, footwayOnRoad: r.footwayOnRoad, footbridgesOnRoad: r.footbridgesOnRoad, counts: r.counts, rejected: r.rejected, api: r.api, emissive: r.emissive, poleMeshes: r.poleMeshes, headMeshes: r.headMeshes, zebraMeshes: r.zebraMeshes, errors: r.errors }]));
    console.log(JSON.stringify({ suite: 'street-furniture-31 · E2', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
