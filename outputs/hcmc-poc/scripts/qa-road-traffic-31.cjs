/*
 * QA 31A · mạng đường và giao thông (bước B: phần "road surface").
 * Bước release hoàn thiện tiêu chí 1–4; file này hiện kiểm mặt đường city-road-network-31.js trong trình duyệt thật.
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
      const r = report[backend] = await runBackend(browser, backend);
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
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, r.missing ? r : { stats: r.stats, junctionPolygons: r.junctionPolygons, bridgeRoadsDrawn: r.bridgeRoadsDrawn, bridgeVertices: r.bridgeVertices, profileWorst: r.profileWorst, worstOffsetRatio: r.worstOffsetRatio, markingPoints: r.markingPoints, meshes: r.meshes, offsetProbe: r.offsetProbe, motion: r.motion, groundLuma: r.groundLuma, errors: r.errors }]));
    console.log(JSON.stringify({ suite: 'road-traffic-31 · road surface', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
