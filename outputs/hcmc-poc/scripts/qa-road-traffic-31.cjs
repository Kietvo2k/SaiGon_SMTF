/*
 * QA 31A · mạng đường và giao thông (bước B: phần "road surface"; bước C: phần "bridges").
 * Bước release hoàn thiện tiêu chí 1–4; file này kiểm mặt đường city-road-network-31.js và kết cấu cầu city-bridges-31.js
 * (cùng bảng sửa lỗi công trình BRIDGE_CORRECTIONS_31) trong trình duyệt thật.
 *
 * Chạy (server serve.py phải đang chạy):
 *   node outputs/hcmc-poc/scripts/qa-road-traffic-31.cjs            → WebGPU + WebGL 2
 *   node outputs/hcmc-poc/scripts/qa-road-traffic-31.cjs webgpu     → chỉ một backend
 * Biến môi trường: PORT (mặc định 8768) hoặc CITY_URL, PW_MODULE, PW_CHROME.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || `http://127.0.0.1:${process.env.PORT || 8768}/hcmc-poc/webgpu-materials-24.html`;
const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'webgpu-materials-24.js'), 'utf8');
// Baseline 30B (research/baseline-30b/baseline-30b-metrics.json, overview ngày): edge 97 182 + asphalt 74 860
// + pedestrian 22 322 + marking 12 386 tam giác. Ngân sách bước B: tăng tối đa 20 %.
const BASELINE_ROAD_TRIANGLES = 206750;
const ROAD_TRIANGLE_BUDGET = Math.round(BASELINE_ROAD_TRIANGLES * 1.2);
const PROFILE_TOL_M = 0.05;

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 400) }); } };

check('mã nguồn: không còn hằng số cầu y=13 và module mới được nạp', () => {
  assert(!/road\.bridge\s*\?\s*13/.test(renderer), 'còn y=road.bridge?13');
  assert(/from '\.\/city-road-network-31\.js(\?v=[^']+)?'/.test(renderer), 'chưa import city-road-network-31.js');
  assert(fs.existsSync(path.join(root, 'city-road-network-31.js')));
});

// Chạy trong trang: mọi phép đo trên dữ liệu thật mà module đã dựng.
async function inspect(page) {
  return page.evaluate(async () => {
    const status = window.webgpuMaterials24, net = status.roadNetwork, G = window.ROAD_GRAPH_31, D = window.CITY_DATA;
    if (!net || net.state !== 'ready' || !net.api) return { missing: true, state: net?.state };
    const api = net.api, groundY = G.frame.groundY;
    const profileY = (edge, s) => {
      const p = edge.profile; if (!p) return groundY;
      if (s <= p[0]) return p[1];
      for (let k = 2; k < p.length; k += 2) if (s <= p[k]) { const t = (s - p[k - 2]) / Math.max(1e-9, p[k] - p[k - 2]); return p[k - 1] + (p[k + 1] - p[k - 1]) * t; }
      return p[p.length - 1];
    };
    const out = { stats: net.stats, layers: net.layers, miterLimit: net.miterLimit, markingGapM: net.markingGapM };
    // 1) Cầu: mọi đỉnh mặt đường (tâm, mép trái, mép phải) khớp profile; không road cầu nào kẹt y=13 cố định.
    let bridgeVertices = 0, profileWorst = 0, fixed13 = 0, bridgeRoadsDrawn = 0, sideMismatch = 0;
    const bridgeRoads = G.roads.filter(r => ['low', 'canal', 'overpass', 'river'].includes(r.elevationClass));
    for (const road of bridgeRoads) {
      const pieces = api.pieces(road.index); if (!pieces.length) continue; bridgeRoadsDrawn++;
      let all13 = true, profileHas13Only = true;
      for (const e of road.edges) { const p = G.edges[e].profile; if (p) for (let k = 1; k < p.length; k += 2) if (Math.abs(p[k] - 13) > 1e-6) profileHas13Only = false; }
      for (const piece of pieces) for (let i = 0; i < piece.edge.length; i++) {
        const y = piece.center[i * 3 + 1], want = profileY(G.edges[piece.edge[i]], piece.s[i]);
        bridgeVertices++; profileWorst = Math.max(profileWorst, Math.abs(y - want));
        if (Math.abs(piece.left[i * 3 + 1] - y) > 1e-4 || Math.abs(piece.right[i * 3 + 1] - y) > 1e-4) sideMismatch++;
        if (Math.abs(y - 13) > 1e-6) all13 = false;
      }
      if (all13 && !profileHas13Only) fixed13++;
    }
    Object.assign(out, { bridgeRoads: bridgeRoads.length, bridgeRoadsDrawn, bridgeVertices, profileWorst, fixed13, sideMismatch });
    // 2) Gai/khe: đỉnh mép không xa tâm quá giới hạn miter; cạnh mép không dài bất thường so với cạnh tâm.
    let spikes = 0, longEdges = 0, nanVertices = 0, pieceCount = 0, worstOffsetRatio = 0, hideDrawn = 0, tunnelDrawn = 0;
    for (let r = 0; r < G.roads.length; r++) {
      const pieces = api.pieces(r);
      if (pieces.length && G.roads[r].skipRender === 'hide') hideDrawn++;
      if (pieces.length && D.roads[r].tunnel) tunnelDrawn++;
      for (const piece of pieces) {
        pieceCount++;
        const n = piece.edge.length, limit = piece.halfWidth * net.miterLimit + 1e-3;
        for (let i = 0; i < n; i++) {
          for (const side of [piece.left, piece.right]) {
            const dx = side[i * 3] - piece.center[i * 3], dz = side[i * 3 + 2] - piece.center[i * 3 + 2], d = Math.hypot(dx, dz);
            if (!Number.isFinite(d)) nanVertices++;
            worstOffsetRatio = Math.max(worstOffsetRatio, d / piece.halfWidth);
            if (d > limit) spikes++;
            if (i + 1 < n) {
              const c = Math.hypot(piece.center[i * 3 + 3] - piece.center[i * 3], piece.center[i * 3 + 5] - piece.center[i * 3 + 2]);
              const e = Math.hypot(side[i * 3 + 3] - side[i * 3], side[i * 3 + 5] - side[i * 3 + 2]);
              if (e > c + 2 * limit) longEdges++;
            }
          }
        }
      }
    }
    Object.assign(out, { spikes, longEdges, nanVertices, pieceCount, worstOffsetRatio, hideDrawn, tunnelDrawn });
    // 3) Giao lộ: polygon tại nút bậc ≥ 3; y của polygon tại nút nâng = y nút; vạch kẻ không lọt vào polygon giao lộ.
    const junctions = api.junctions(), nodeById = new Map(G.nodes.map(n => [n.id, n]));
    let junctionYWorst = 0, degreeBad = 0;
    const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[2] > z) !== (b[2] > z) && x < (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]) + a[0]) c = !c; } return c; };
    const cell = 40, grid = new Map();
    for (const j of junctions) {
      const node = nodeById.get(j.node); if (!node || node.degree < 3) degreeBad++;
      junctionYWorst = Math.max(junctionYWorst, Math.abs(j.y - node.y));
      const xs = j.polygon.map(p => p[0]), zs = j.polygon.map(p => p[2]);
      for (let gx = Math.floor(Math.min(...xs) / cell); gx <= Math.floor(Math.max(...xs) / cell); gx++)
        for (let gz = Math.floor(Math.min(...zs) / cell); gz <= Math.floor(Math.max(...zs) / cell); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(j); }
    }
    let markingPoints = 0, markingInJunction = 0;
    for (const m of api.markingPieces()) for (let i = 0; i < m.center.length; i += 3) {
      markingPoints++;
      const x = m.center[i], z = m.center[i + 2];
      for (const j of grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || []) if (j.group === 'asphalt' && Math.abs(j.y - m.center[i + 1]) < 1.5 && inside(j.polygon, x, z)) { markingInJunction++; break; }
    }
    Object.assign(out, { junctionPolygons: junctions.length, junctionYWorst, degreeBad, markingPoints, markingInJunction });
    // 3b) Bó vỉa của dốc dẫn không nhô lên trên mặt giao lộ: tia thẳng đứng tại giữa đoạn trim của nhánh có profile
    // thay đổi phải gặp mặt đường (không phải bó vỉa) đầu tiên.
    {
      const T = await import('three/webgpu'), ray = new T.Raycaster(), meshes = api.meshes.filter(m => m.parent);
      let curbProbes = 0, curbOnTop = 0; const curbSamples = [];
      for (const j of junctions) {
        if (j.group !== 'asphalt' || j.elevated) continue;
        for (const arm of j.arms) {
          const e = G.edges[arm.edge]; if (!e.y || Math.max(...e.y) - Math.min(...e.y) < .05 || arm.t < 1) continue;
          const c = e.c, n = c.length / 2, want = arm.t / 2; let acc = 0, px = null, pz = null;
          for (let k = 0; k < n - 1 && px === null; k++) {
            const i = arm.end === 0 ? k : n - 1 - k, i2 = arm.end === 0 ? k + 1 : n - 2 - k;
            const L = Math.hypot(c[i2 * 2] - c[i * 2], c[i2 * 2 + 1] - c[i * 2 + 1]);
            if (acc + L >= want) { const u = L ? (want - acc) / L : 0; px = c[i * 2] + (c[i2 * 2] - c[i * 2]) * u; pz = c[i * 2 + 1] + (c[i2 * 2 + 1] - c[i * 2 + 1]) * u; }
            acc += L;
          }
          if (px === null) continue;
          ray.set(new T.Vector3(px, j.y + 3, pz), new T.Vector3(0, -1, 0)); ray.far = 6;
          const hits = ray.intersectObjects(meshes, false), road = hits.find(h => !h.object.name.includes('bó vỉa')), hit = hits[0];
          if (!hit || !road) continue;
          curbProbes++;
          // Bó vỉa đồng phẳng với asphalt (do polygonOffset quyết định) không tính; chỉ tính khi nhô cao hơn > 5 mm.
          if (hit.object.name.includes('bó vỉa') && hit.point.y > road.point.y + .005) { curbOnTop++; if (curbSamples.length < 6) curbSamples.push({ node: j.node, edge: arm.edge, x: +px.toFixed(1), z: +pz.toFixed(1), y: +hit.point.y.toFixed(3) }); }
        }
      }
      Object.assign(out, { curbProbes, curbOnTop, curbSamples });
      // 3c) Bước G lỗi 5/6: khe đất kín giữa hai chiều đường đôi phía nam vòng xoay Ba Son (camera 01 của 30B) đã lấp;
      // đảo tròn vòng xoay vẫn để trống. Điểm lấy từ raster 1 m của hình học trước sửa (thành phần kín 197 ô).
      const probe = ([x, z]) => { ray.set(new T.Vector3(x, groundY + 2, z), new T.Vector3(0, -1, 0)); ray.far = 4; return ray.intersectObjects(meshes, false).map(h => h.object.name); };
      const gapPoints = [[574.5, -1164.5], [571.5, -1161.5], [567.5, -1159.5]], islandPoint = [554.5, -1143.5];
      out.medianGap = { open: gapPoints.filter(p => !probe(p).length), islandHits: probe(islandPoint) };
    }
    // 4) Thứ tự vẽ: polygonOffset đặt trên vật liệu thật của từng mesh đường.
    out.meshes = api.meshes.map(mesh => ({ name: mesh.name, polygonOffset: mesh.material.polygonOffset, factor: mesh.material.polygonOffsetFactor, units: mesh.material.polygonOffsetUnits, renderOrder: mesh.renderOrder, triangles: mesh.geometry.attributes.position.count / 3, inScene: !!mesh.parent }));
    // 5) Xe không chìm dưới mặt đường mới.
    out.motion = { belowRoad: status.motion?.belowRoad, checked: status.motion?.surfaceChecked };
    // 6) Nền đất bớt sáng (độ sáng tương đối của màu nhân với ảnh Sentinel).
    const THREE = await import('three/webgpu'), luma = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    let groundLuma = null; for (const sc of window.__probeScenes || []) sc.traverse(o => { if (o.name === 'Nền đất · Sentinel-2 2016') groundLuma = luma(o.material.color); });
    out.groundLuma = groundLuma === null ? null : groundLuma / luma(new THREE.Color('#b9b29e'));
    // 7) Mẫu sampleY cho bước D: tâm một đoạn cầu trả về đúng y profile.
    const sample = bridgeRoads.map(r => api.pieces(r.index)[0]).find(p => p && p.edge.length > 2);
    if (sample) { const i = 1; out.sampleY = { got: api.sampleY(sample.center[i * 3], sample.center[i * 3 + 2], sample.center[i * 3 + 1]), want: sample.center[i * 3 + 1] }; }
    return out;
  });
}

// Bước C · phần "bridges": kết cấu cầu thủ tục, Ba Son, Bạch Đằng và bảng sửa lỗi công trình, đo trên cảnh thật.
async function inspectBridges(page) {
  return page.evaluate(async () => {
    const T = await import('three/webgpu');
    const status = window.webgpuMaterials24, G = window.ROAD_GRAPH_31, D = window.CITY_DATA, C = window.BRIDGE_CORRECTIONS_31;
    const net = status.roadNetwork?.api, br = status.bridges, api = br?.api;
    if (!net || !br || br.state !== 'ready' || !api) return { missing: true, state: br?.state };
    const groundY = G.frame.groundY, BRIDGE = new Set(['river', 'canal', 'overpass', 'low']);
    const out = { stats: br.stats, classification: br.classification, label: br.label, dataset: document.body.dataset.bridgeStructure };
    out.uiNote = [...document.querySelectorAll('[data-bridge-note]')].map(el => el.textContent).join(' | ');
    const drawnRoads = G.roads.map((r, i) => net.pieces(i).length > 0);
    // 1) Đầu road cầu: nối road khác cùng cao độ (≤ 0,05 m), hoặc đầu cụt chạm đất. Đầu bị cắt ở biên bbox tải dữ liệu
    //    (nút kind=boundary) không có cạnh tiếp nối trong cảnh nên được miễn; đầu nối vào hầm (tunnel, không vẽ) cũng miễn.
    const [ex0, ex1, ez0, ez1] = G.frame.extent, onBoundary = p => Math.min(Math.abs(p[0] - ex0), Math.abs(p[0] - ex1), Math.abs(p[1] - ez0), Math.abs(p[1] - ez1)) < 0.05;
    const at = new Map(), tunnelAt = new Set();
    D.roads.forEach((road, i) => { if (G.roads[i].tunnel) road.c.forEach(p => tunnelAt.add(p[0].toFixed(2) + ',' + p[1].toFixed(2))); });
    D.roads.forEach((road, i) => { if (!drawnRoads[i]) return; road.c.forEach((p, k) => { const key = p[0].toFixed(2) + ',' + p[1].toFixed(2); if (!at.has(key)) at.set(key, []); at.get(key).push([i, k]); }); });
    let bridgeEnds = 0, endBad = 0, tunnelEnds = 0; const endSamples = [];
    G.roads.forEach((road, i) => {
      if (!BRIDGE.has(road.elevationClass) || !drawnRoads[i]) return;
      const c = D.roads[i].c;
      for (const k of [0, c.length - 1]) {
        if (onBoundary(c[k])) continue;
        bridgeEnds++;
        const y = net.vertexY(i, k), key = c[k][0].toFixed(2) + ',' + c[k][1].toFixed(2), others = (at.get(key) || []).filter(([j]) => j !== i);
        if (!others.length && tunnelAt.has(key)) { tunnelEnds++; continue; }
        const worst = others.length ? Math.max(...others.map(([j, kk]) => Math.abs(net.vertexY(j, kk) - y))) : Math.abs(y - groundY);
        if (worst > 0.05) { endBad++; if (endSamples.length < 6) endSamples.push({ way: road.id, end: k, y: +y.toFixed(2), worst: +worst.toFixed(2), neighbours: others.length }); }
      }
    });
    Object.assign(out, { bridgeEnds, endBad, tunnelEnds, endSamples });
    // 2) 0 bậc: mọi cặp đỉnh liên tiếp của mảnh nâng có |Δy|/độ dài ≤ 8 % (cặp < 0,5 m: |Δy| ≤ 0,05 m).
    let gradePairs = 0, steps = 0; const stepSamples = [];
    for (const piece of net.elevatedPieces()) {
      const c = piece.center;
      for (let k = 0; k + 1 < c.length / 3; k++) {
        const L = Math.hypot(c[k * 3 + 3] - c[k * 3], c[k * 3 + 5] - c[k * 3 + 2]), dy = Math.abs(c[k * 3 + 4] - c[k * 3 + 1]);
        gradePairs++;
        if (L >= 0.5 ? dy / L > 0.08 : dy > 0.05) { steps++; if (stepSamples.length < 6) stepSamples.push({ way: G.roads[piece.road].id, x: +c[k * 3].toFixed(1), z: +c[k * 3 + 2].toFixed(1), L: +L.toFixed(2), dy: +dy.toFixed(2) }); }
      }
    }
    Object.assign(out, { gradePairs, steps, stepSamples });
    // 3) Ba Son: đỉnh hộp signature khớp mặt đường profile (≤ 0,05 m) dọc tim, không đoạn hộp nào cao hơn mặt đường.
    const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), up = new T.Vector3(0, 1, 0);
    const baSonDeck = [];
    for (const sc of window.__probeScenes || []) sc.traverse(o => { if (o.isMesh && o.parent?.name === 'Cầu Ba Son · mặt cầu') baSonDeck.push(o); });
    const bsRoad = G.roads.findIndex(r => r.id === 321564421), bsC = D.roads[bsRoad]?.c || [];
    let bsSamples = 0, bsHits = 0, bsAbove = 0, bsWorst = 0;
    for (let k = 0; k + 1 < bsC.length; k++) {
      const L = Math.hypot(bsC[k + 1][0] - bsC[k][0], bsC[k + 1][1] - bsC[k][1]), n = Math.max(1, Math.ceil(L / 10));
      for (let q = 0; q <= n; q++) {
        const u = q / n, x = bsC[k][0] + (bsC[k + 1][0] - bsC[k][0]) * u, z = bsC[k][1] + (bsC[k + 1][1] - bsC[k][1]) * u, y = net.roadY(bsRoad, k, u);
        bsSamples++;
        ray.set(new T.Vector3(x, 60, z), down); ray.far = 80;
        const hit = ray.intersectObjects(baSonDeck, false)[0];
        if (!hit) continue;
        bsHits++; bsWorst = Math.max(bsWorst, Math.abs(hit.point.y - y));
        if (hit.point.y > y + 0.05) bsAbove++;
      }
    }
    // 3b) Bước G: ở cầu dẫn (mặt đường thấp hơn đỉnh hộp nhịp phẳng 12,85 m quá 0,6 m — đoạn chuyển tiếp 24 m từ hộp
    // 24 m về mép thật nằm trong 0,6 m đầu của dốc smoothstep) hộp
    // không được thò ra ngoài mặt đường OSM: mọi điểm hộp chiếu thẳng xuống phải có mặt đường cùng cao độ (± 0,3 m)
    // trong vòng 1,2 m ngang (bó vỉa 0,9 m + sai số). Quét ngang −24…+24 m mỗi 0,5 m, dọc tim mỗi 5 m.
    let overhang = 0, rampSamples = 0; const overhangSamples = [];
    for (let k = 0; k + 1 < bsC.length; k++) {
      const dx = bsC[k + 1][0] - bsC[k][0], dz = bsC[k + 1][1] - bsC[k][1], L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 5)), px = -dz / L, pz = dx / L;
      for (let q = 0; q <= n; q++) {
        const u = q / n, x = bsC[k][0] + dx * u, z = bsC[k][1] + dz * u, y = net.roadY(bsRoad, k, u);
        if (y >= 12.85 - 0.6) continue;
        rampSamples++;
        for (let off = -24; off <= 24; off += 0.5) {
          const sx = x + px * off, sz = z + pz * off;
          ray.set(new T.Vector3(sx, 60, sz), down); ray.far = 80;
          const hit = ray.intersectObjects(baSonDeck, false)[0];
          if (!hit || hit.point.y < groundY + 0.2) continue;
          const covered = [0, 1.2, -1.2].some(d => net.surfaceYs(sx + px * d, sz + pz * d).some(v => Math.abs(v - hit.point.y) < 0.3));
          if (!covered) { overhang++; if (overhangSamples.length < 6) overhangSamples.push({ x: +sx.toFixed(1), z: +sz.toFixed(1), off, y: +hit.point.y.toFixed(2) }); }
        }
      }
    }
    out.baSon = { deckMeshes: baSonDeck.length, samples: bsSamples, hits: bsHits, above: bsAbove, worst: +bsWorst.toFixed(3), decision: br.baSon?.decision, rampSamples, overhang, overhangSamples };
    // 4) Trụ/lan can là InstancedMesh có instance; ngân sách tam giác và số mesh mới.
    out.meshes = api.meshes.map(m => ({ name: m.name, instanced: !!m.isInstancedMesh, count: m.isInstancedMesh ? m.count : 1, triangles: (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1), inScene: !!m.parent }));
    out.procedural = api.procedural.map(m => m.name);
    // 5) 0 trụ trong mặt đường: tại tâm và 4 điểm biên trụ không có mặt đường nào thấp hơn đáy bản mặt.
    let piersChecked = 0, piersInRoad = 0; const pierSamples = [];
    for (const pier of api.piers) {
      piersChecked++;
      const pts = [[0, 0], [pier.radius, 0], [-pier.radius, 0], [0, pier.radius], [0, -pier.radius]];
      const bad = pts.some(([dx, dz]) => net.surfaceYs(pier.x + dx, pier.z + dz).some(y => y < pier.top - 0.3));
      if (bad) { piersInRoad++; if (pierSamples.length < 6) pierSamples.push(pier); }
    }
    Object.assign(out, { piersChecked, piersInRoad, pierSamples });
    // 6) Bản mặt có mặt dưới: tia từ dưới lên tại giữa đoạn giữa của mảnh cầu phải gặp mặt dưới bản mặt ở y mặt − bề dày
    //    (± 0,1 m) trong số các mặt trên đường tia.
    const deckMesh = api.meshes.filter(m => m.name.includes('bản mặt'));
    let undersideProbes = 0, undersideBad = 0; const undersideSamples = [];
    G.roads.forEach((road, i) => {
      if (!BRIDGE.has(road.elevationClass) || road.signature) return;
      for (const piece of net.pieces(i)) {
        const c = piece.center, n = c.length / 3; if (n < 2) continue;
        const k = Math.floor((n - 1) / 2), x = (c[k * 3] + c[k * 3 + 3]) / 2, y = (c[k * 3 + 1] + c[k * 3 + 4]) / 2, z = (c[k * 3 + 2] + c[k * 3 + 5]) / 2, thick = api.thicknessOf(i);
        if (y - thick < groundY + 0.5 || undersideProbes >= 400) continue;
        undersideProbes++;
        ray.set(new T.Vector3(x, groundY + 0.1, z), up); ray.far = y - groundY + 1;
        const hits = ray.intersectObjects(deckMesh, false), hit = hits.find(h => Math.abs(h.point.y - (y - thick)) <= 0.1) || hits[0];
        if (!hit || Math.abs(hit.point.y - (y - thick)) > 0.1) { undersideBad++; if (undersideSamples.length < 6) undersideSamples.push({ way: road.id, y: +y.toFixed(2), hit: hit ? +hit.point.y.toFixed(2) : null, thick }); }
      }
    });
    Object.assign(out, { undersideProbes, undersideBad, undersideSamples });
    // 7) 0 công trình giao mặt cầu: điểm mẫu (tim, mép, giữa) của mảnh nâng nằm trong footprint đang vẽ và chồng chiều cao.
    //    Như bảng sửa lỗi: road cầu từ groundY + 1,5 m, dốc dẫn trên road mặt đất từ groundY + 4 m.
    const reg = window.SIGNATURE_REGISTRY_31, signatureIds = new Set((reg?.entries || []).filter(e => e.kind === 'building').flatMap(e => e.ids.map(Number)));
    const corr = new Map((C?.buildings || []).map(e => [Number(e.id), e]));
    const cell = 40, grid = new Map();
    D.buildings.forEach((b, bi) => {
      const e = corr.get(Number(b.id)); if (e?.action === 'hide') return;
      const ring = b.r[0], xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / cell); gx <= Math.floor(Math.max(...xs) / cell); gx++)
        for (let gz = Math.floor(Math.min(...zs) / cell); gz <= Math.floor(Math.max(...zs) / cell); gz++) { const key = gx + ',' + gz; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(bi); }
    });
    const inRing = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const FOOT = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'corridor']);
    const conflicts = new Map();
    G.roads.forEach((road, i) => {
      const floorY = groundY + (BRIDGE.has(road.elevationClass) ? 1.5 : 4.0), clear = FOOT.has(road.highway) ? 2.5 : 4.5;
      for (const piece of net.pieces(i)) {
        if (!piece.elevated) continue;
        const n = piece.center.length / 3;
        for (let k = 0; k < n; k++) {
          const y = piece.center[k * 3 + 1]; if (y < floorY) continue;
          for (const t of [0, 0.5, 1, 1.5, 2]) {
            const a = t <= 1 ? piece.left : piece.right, w = t <= 1 ? 1 - t : t - 1;
            const x = piece.center[k * 3] + (a[k * 3] - piece.center[k * 3]) * w * 0.98, z = piece.center[k * 3 + 2] + (a[k * 3 + 2] - piece.center[k * 3 + 2]) * w * 0.98;
            for (const bi of grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || []) {
              const b = D.buildings[bi], e = corr.get(Number(b.id));
              const base = (e?.setMin ?? b.min ?? 0) + 1.5, top = (e?.setH ?? b.h) + 1.5;
              if (!(base < y + clear && top > y - 1.5)) continue;
              if (!b.r.length || !inRing(b.r[0], x, z) || b.r.slice(1).some(h => inRing(h, x, z))) continue;
              if (!conflicts.has(b.id)) conflicts.set(b.id, { id: b.id, way: road.id, y: +y.toFixed(2), signature: signatureIds.has(Number(b.id)) });
            }
          }
        }
      }
    });
    out.buildingConflicts = [...conflicts.values()];
    // 8) Bảng sửa lỗi đã áp: số mục ẩn/chỉnh khớp bảng, không mục nào là signature, mọi mục có lý do.
    out.corrections = {
      status: status.buildingCorrections ? { ...status.buildingCorrections } : null,
      table: C ? { entries: C.buildings.length, hide: C.buildings.filter(e => e.action === 'hide').length, adjust: C.buildings.filter(e => e.action !== 'hide').length,
        noReason: C.buildings.filter(e => !e.reason).length, signature: C.buildings.filter(e => signatureIds.has(Number(e.id))).map(e => e.id),
        plaza: C.buildings.filter(e => e.rule === 'nguyen-hue-plaza').length, reported: (C.nguyenHueReported || []).map(r => [r.id, r.decision]) } : null
    };
    // 9) Bạch Đằng: có mặt trong runtime WebGPU, hai đầu cầu dẫn chạm đất, đầu nhịp chính có mố.
    out.bachDang = br.bachDang ? { ...br.bachDang } : null;
    // 10) API bước D: deckY(x, z, nearY) và tilt(x, z, dirX, dirZ, nearY).
    out.api = { deckY: typeof api.deckY, tilt: typeof api.tilt, signature: (api.signature || []).map(m => m.name) };
    if (typeof api.deckY === 'function') {
      const p = net.pieces(bsRoad)[0];
      if (p) { const i = Math.floor(p.center.length / 6); out.api.sample = { got: api.deckY(p.center[i * 3], p.center[i * 3 + 2], p.center[i * 3 + 1]), want: p.center[i * 3 + 1], tilt: api.tilt(p.center[i * 3], p.center[i * 3 + 2], 1, 0, p.center[i * 3 + 1]) }; }
    }
    return out;
  });
}

// polygonOffset có tác dụng thật trên backend đang chạy: hai mặt đồng phẳng ở xa 7 km, mặt vẽ trước có offset âm phải thắng.
async function polygonOffsetProbe(page) {
  return page.evaluate(async () => {
    const THREE = await import('three/webgpu');
    const renderer = window.__probeRenderer; if (!renderer) return { error: 'no renderer' };
    const run = async useOffset => {
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 3, 30000);
      camera.position.set(0, 4200, 5600); camera.lookAt(0, 0, 0);
      const plane = (color, units, order) => {
        const m = new THREE.MeshBasicNodeMaterial({ color, side: THREE.DoubleSide });
        if (useOffset) { m.polygonOffset = true; m.polygonOffsetFactor = units; m.polygonOffsetUnits = units; }
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2), m); mesh.position.y = 1; mesh.renderOrder = order; scene.add(mesh); return mesh;
      };
      plane('#ff0000', -3, 0); plane('#0000ff', 0, 1);
      const target = new THREE.RenderTarget(64, 64, { depthBuffer: true });
      renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64);
      let red = 0, blue = 0; for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] > 200 && pixels[i + 2] < 60) red++; else if (pixels[i + 2] > 200 && pixels[i] < 60) blue++; }
      target.dispose(); return { red, blue };
    };
    return { withOffset: await run(true), withoutOffset: await run(false), backend: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2' };
  });
}

async function runBackend(browser, backend) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(() => {
    const hook = new EventTarget();
    hook.addEventListener('observe', event => { const o = event.detail; if (o?.isScene) (window.__probeScenes = window.__probeScenes || []).push(o); if (o?.isWebGPURenderer || o?.isRenderer) window.__probeRenderer = o; });
    window.__THREE_DEVTOOLS__ = hook;
  });
  await page.goto(`${BASE}?v=30b&view=overview${backend === 'webgl' ? '&backend=webgl' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 240000 });
  const result = await inspect(page);
  result.bridges = await inspectBridges(page);
  result.offsetProbe = await polygonOffsetProbe(page);
  result.actualBackend = await page.evaluate(() => window.webgpuMaterials24.backend);
  result.errors = errors;
  await context.close();
  return result;
}

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {};
  try {
    for (const backend of backends) {
      let r;
      // Không mở được trang (server tắt, timeout) phải hiện là check thất bại, không chỉ là stack trace.
      try { r = report[backend] = await runBackend(browser, backend); }
      catch (error) { check(`[${backend}] mở app và dựng xong`, () => { throw error; }); continue; }
      const tag = `[${backend}] `;
      check(tag + 'road-network-31 đã dựng xong', () => assert(!r.missing, `roadNetwork chưa sẵn sàng (state=${r.state})`));
      check(tag + 'giao lộ bậc ≥ 3 có polygon (≥ 95 % ứng viên, ≥ 5000)', () => {
        assert(r.junctionPolygons >= 5000, `chỉ ${r.junctionPolygons} polygon`);
        assert(r.junctionPolygons >= 0.95 * r.stats.junctionCandidates, `${r.junctionPolygons}/${r.stats.junctionCandidates}`);
        assert.equal(r.degreeBad, 0);
      });
      check(tag + '0 road cầu kẹt y=13 cố định; mọi đỉnh mặt cầu khớp profile ≤ 0,05 m', () => {
        assert(r.bridgeRoadsDrawn > 100, `chỉ ${r.bridgeRoadsDrawn} road cầu được vẽ`);
        assert.equal(r.fixed13, 0);
        assert(r.profileWorst <= PROFILE_TOL_M, `lệch profile ${r.profileWorst.toFixed(3)} m`);
        assert.equal(r.sideMismatch, 0);
      });
      check(tag + 'polygon giao lộ dùng y của nút (≤ 0,05 m)', () => assert(r.junctionYWorst <= PROFILE_TOL_M, `${r.junctionYWorst}`));
      check(tag + 'không gai/khe: offset mép ≤ giới hạn miter, không cạnh mép dài bất thường, không NaN', () => {
        assert.equal(r.nanVertices, 0); assert.equal(r.spikes, 0); assert.equal(r.longEdges, 0);
        assert(r.miterLimit > 1 && r.miterLimit <= 3, `miterLimit ${r.miterLimit}`);
      });
      check(tag + 'road skipRender=hide và hầm không vẽ', () => { assert.equal(r.hideDrawn, 0); assert.equal(r.tunnelDrawn, 0); });
      check(tag + 'vạch kẻ dừng trước giao lộ (0 điểm vạch trong polygon giao lộ cùng cao độ)', () => {
        assert(r.markingPoints > 1000, `chỉ ${r.markingPoints} điểm vạch`); assert.equal(r.markingInJunction, 0);
      });
      check(tag + 'bó vỉa dốc dẫn không nhô lên mặt giao lộ (0 tia gặp bó vỉa trước asphalt)', () => {
        assert(r.curbProbes > 50, `chỉ ${r.curbProbes} tia`); assert.equal(r.curbOnTop, 0, JSON.stringify(r.curbSamples));
      });
      check(tag + 'khe đất kín giữa hai chiều đường đôi đã lấp, không lấp khối nhà/đảo vòng xoay (bước G)', () => {
        const s = r.stats;
        assert(s.medianHoles >= 300, `chỉ lấp ${s.medianHoles} khe`);
        assert(s.medianHoleRejected?.building > 0 && s.medianHoleRejected?.roundabout > 0, JSON.stringify(s.medianHoleRejected));
        assert.deepEqual(r.medianGap.open, [], 'điểm khe phía nam vòng xoay còn trống');
        assert.deepEqual(r.medianGap.islandHits, [], 'đảo tròn vòng xoay bị lấp');
      });
      check(tag + 'polygonOffset đặt trên mọi mesh đường, thứ tự median < bó vỉa < vỉa hè < asphalt < vạch', () => {
        assert(r.meshes.length >= 5 && r.meshes.length <= 12, `${r.meshes.length} mesh`);
        for (const m of r.meshes) { assert(m.polygonOffset === true, m.name); assert(m.inScene, m.name); }
        const units = name => r.meshes.find(m => m.name.endsWith(name))?.units;
        const order = ['mặt đất · median', 'mặt đất · bó vỉa', 'mặt đất · vỉa hè', 'mặt đất · asphalt', 'mặt đất · vạch kẻ'].map(units);
        assert(order.every(v => typeof v === 'number'), JSON.stringify(order));
        for (let i = 1; i < order.length; i++) assert(order[i] < order[i - 1], `thứ tự offset ${JSON.stringify(order)}`);
      });
      check(tag + 'polygonOffset có tác dụng thật trên backend', () => {
        const p = r.offsetProbe; assert(!p.error, p.error);
        assert(p.withOffset.red > 1000 && p.withOffset.blue === 0, JSON.stringify(p));
      });
      check(tag + `tam giác nhóm đường ≤ ${ROAD_TRIANGLE_BUDGET} (+20 % so với 30B)`, () => {
        const total = r.meshes.reduce((s, m) => s + m.triangles, 0);
        assert(total <= ROAD_TRIANGLE_BUDGET, `${total} tam giác`);
      });
      check(tag + 'xe không chìm dưới mặt đường', () => { assert(r.motion.checked > 1000, JSON.stringify(r.motion)); assert.equal(r.motion.belowRoad, 0); });
      check(tag + 'nền đất bớt sáng so với #b9b29e (độ sáng tuyến tính < 90 %, > 50 %)', () => assert(r.groundLuma !== null && r.groundLuma < 0.9 && r.groundLuma > 0.5, `tỉ lệ ${r.groundLuma}`));
      check(tag + 'sampleY trả về y mặt cầu (≤ 0,05 m)', () => assert(r.sampleY && Math.abs(r.sampleY.got - r.sampleY.want) <= PROFILE_TOL_M, JSON.stringify(r.sampleY)));
      // --- bridges (bước C) ---
      const b = r.bridges || { missing: true };
      check(tag + 'bridges: nhóm cầu đã dựng xong', () => assert(!b.missing, `bridges chưa sẵn sàng (state=${b.state})`));
      if (!b.missing) {
        check(tag + 'bridges: mọi đầu road cầu nối cạnh cùng cao độ (≤ 0,05 m) hoặc đầu cụt chạm đất', () => {
          assert(b.bridgeEnds > 200, `chỉ ${b.bridgeEnds} đầu`); assert.equal(b.endBad, 0, JSON.stringify(b.endSamples));
        });
        check(tag + 'bridges: 0 bậc trên mặt nâng (|Δy|/độ dài ≤ 8 %)', () => { assert(b.gradePairs > 1000, `${b.gradePairs}`); assert.equal(b.steps, 0, JSON.stringify(b.stepSamples)); });
        check(tag + 'bridges: Ba Son — mặt đường OSM khớp đỉnh hộp (≤ 0,05 m), không đoạn hộp nào cao hơn mặt đường', () => {
          const s = b.baSon; assert(s.deckMeshes > 0, 'không thấy nhóm "Cầu Ba Son · mặt cầu"');
          assert(s.hits >= 0.9 * s.samples, `hộp chỉ phủ ${s.hits}/${s.samples} mẫu`); assert.equal(s.above, 0, `${s.above} mẫu hộp cao hơn mặt đường`);
          assert(s.worst <= 0.05, `lệch ${s.worst} m`);
        });
        check(tag + 'bridges: Ba Son — hộp cầu dẫn không thò ra ngoài mặt đường OSM (bước G)', () => {
          const s = b.baSon; assert(s.rampSamples >= 20, `chỉ ${s.rampSamples} mẫu cầu dẫn`);
          assert.equal(s.overhang, 0, `${s.overhang} điểm hộp ngoài mặt đường ${JSON.stringify(s.overhangSamples)}`);
        });
        check(tag + 'bridges: trụ và lan can là InstancedMesh có instance > 0', () => {
          for (const key of ['trụ', 'lan can']) { const m = b.meshes.find(x => x.name.includes(key)); assert(m, `thiếu mesh ${key}`); assert(m.instanced && m.count > 0, JSON.stringify(m)); }
        });
        check(tag + 'bridges: 0 trụ nằm trong mặt đường', () => { assert(b.piersChecked > 50, `chỉ ${b.piersChecked} trụ`); assert.equal(b.piersInRoad, 0, JSON.stringify(b.pierSamples)); });
        check(tag + 'bridges: bản mặt cầu thủ tục có mặt dưới đúng bề dày (± 0,1 m)', () => { assert(b.undersideProbes > 50, `${b.undersideProbes}`); assert.equal(b.undersideBad, 0, JSON.stringify(b.undersideSamples)); });
        check(tag + 'bridges: 0 công trình giao mặt cầu/dốc dẫn cao', () => assert.deepEqual(b.buildingConflicts, []));
        check(tag + 'bridges: bảng sửa lỗi đã áp, mọi mục có lý do, không đụng signature', () => {
          const t = b.corrections.table, st = b.corrections.status; assert(t && st, 'thiếu BRIDGE_CORRECTIONS_31 hoặc status.buildingCorrections');
          assert.equal(st.hidden, t.hide); assert.equal(st.adjusted, t.adjust); assert.equal(t.noReason, 0); assert.deepEqual(t.signature, []);
          assert(t.plaza > 0, 'không ẩn footprint nào trong lòng phố đi bộ Nguyễn Huệ');
        });
        check(tag + 'bridges: Bạch Đằng có trong runtime WebGPU, hai đầu cầu dẫn chạm đất, đầu nhịp chính có mố', () => {
          const s = b.bachDang; assert(s && s.meshes > 0, JSON.stringify(s));
          assert(s.ends.length >= 2 && s.ends.every(e => Math.abs(e.y - e.groundY) <= 0.05), JSON.stringify(s.ends));
          assert(s.abutments >= 2, `${s.abutments} mố`);
        });
        check(tag + 'bridges: status và UI có nhãn minh họa (illustrative)', () => {
          assert.equal(b.classification, 'illustrative'); assert(/minh họa/.test(b.label), b.label); assert.equal(b.dataset, 'illustrative'); assert(/minh họa/.test(b.uiNote), `UI: ${b.uiNote}`);
        });
        check(tag + 'bridges: ≤ 150 000 tam giác, ≤ 6 mesh mới, danh sách mesh thủ tục cho bước E', () => {
          const tris = b.meshes.reduce((s, m) => s + m.triangles, 0); assert(tris <= 150000, `${tris} tam giác`);
          assert(b.meshes.length <= 6, `${b.meshes.length} mesh`); assert(b.meshes.every(m => m.inScene)); assert(b.procedural.length >= 3, JSON.stringify(b.procedural));
        });
        check(tag + 'bridges: API bước D deckY/tilt trả về y mặt cầu', () => {
          assert.equal(b.api.deckY, 'function'); assert.equal(b.api.tilt, 'function');
          assert(b.api.sample && Math.abs(b.api.sample.got - b.api.sample.want) <= PROFILE_TOL_M, JSON.stringify(b.api.sample));
        });
      }
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, r.missing ? r : { stats: r.stats, junctionPolygons: r.junctionPolygons, bridgeRoadsDrawn: r.bridgeRoadsDrawn, bridgeVertices: r.bridgeVertices, profileWorst: r.profileWorst, worstOffsetRatio: r.worstOffsetRatio, markingPoints: r.markingPoints, meshes: r.meshes, offsetProbe: r.offsetProbe, motion: r.motion, groundLuma: r.groundLuma, bridges: r.bridges && { ...r.bridges, buildingConflicts: (r.bridges.buildingConflicts || []).slice(0, 12), conflictCount: (r.bridges.buildingConflicts || []).length }, errors: r.errors }]));
    console.log(JSON.stringify({ suite: 'road-traffic-31 · road surface + bridges', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
