/*
 * QA 31A · bước H: "Khu mô phỏng" (Toàn bộ / Lõi Quận 1 / Ven sông · Thủ Thiêm / Phía bắc / Phía nam) kết hợp "Mật độ chi tiết".
 * Mọi phép đo chạy trong trình duyệt thật trên mesh đã dựng (đọc drawRange, ma trận instance, renderer.info), không tin số liệu tự báo.
 *
 * Chạy (server serve.py phải đang chạy):
 *   PORT=8811 node outputs/hcmc-poc/scripts/qa-region-31.cjs            → WebGPU + WebGL 2
 *   PORT=8811 node outputs/hcmc-poc/scripts/qa-region-31.cjs webgpu     → chỉ một backend
 * Biến môi trường: PORT (mặc định 8768) hoặc CITY_URL, PW_MODULE, PW_CHROME. Ghi bảng tam giác/draw call vào stdout (JSON).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || `http://127.0.0.1:${process.env.PORT || 8768}/hcmc-poc/webgpu-materials-24.html`;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const REGIONS = ['trung-tam', 'ven-song', 'bac', 'nam'];
const REGION_LABELS = { 'trung-tam': 'Lõi Quận 1 · Bến Nghé', 'ven-song': 'Ven sông · Ba Son · Thủ Thiêm', bac: 'Phía bắc · Thị Nghè · Bình Thạnh', nam: 'Phía nam · Quận 4 · Khánh Hội' };
const BUTTON_TEXT = ['Toàn bộ', 'Lõi Quận 1', 'Ven sông · Thủ Thiêm', 'Phía bắc', 'Phía nam'];
const SWITCH_MS = 300;                 // đổi khu: khung dài nhất (gồm camera bay tới khu) ≤ 300 ms
const FULL_TRI_RATIO = .7;             // Đầy đủ: tam giác một khu ≤ 70 % Toàn bộ (cùng camera Toàn vùng của khu)
const CENTER = [106.7115, 10.779];     // CITY_DATA.meta.center
// Tâm các góc data-view (cùng công thức xyz của app; QA tự tính, không đọc từ app).
const xyz = (lon, lat) => [(lon - CENTER[0]) * 111320 * Math.cos(CENTER[1] * Math.PI / 180), (CENTER[1] - lat) * 110574];
const VIEW_TARGETS = { materials: xyz(106.7060, 10.7764), river: xyz(106.7085, 10.7738), boulevard: xyz(106.7039, 10.7747), corridor: [-924, 249], bason: [-300, -360], flood25: xyz(106.7305, 10.8030) };

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 900) }); } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

check('mã nguồn: city-region-31.js xuất hằng và regionOf; HTML có radiogroup "Khu mô phỏng" đủ 5 nút; module nạp có khóa cache 30b-31h', () => {
  assert(fs.existsSync(path.join(root, 'city-region-31.js')), 'thiếu city-region-31.js');
  const region = read('city-region-31.js'), app = read('webgpu-materials-24.js'), html = read('webgpu-materials-24.html'), density = read('city-density-31.js');
  for (const name of ['REGIONS_31', 'regionOf', 'regionContains', 'regionPolygon', 'REGION_ALL_ID', 'REGION_URL_PARAM']) assert(new RegExp(`export (const|function) ${name}\\b`).test(region), `thiếu export ${name}`);
  assert(/from '\.\/city-region-31\.js\?v=30b-31h'/.test(app) && /from '\.\/city-region-31\.js\?v=30b-31h'/.test(density), 'import city-region-31.js?v=30b-31h');
  assert(/id="regionControl"[^>]*role="radiogroup"/.test(html) || /role="radiogroup"[^>]*id="regionControl"/.test(html), 'thiếu radiogroup #regionControl');
  for (const id of ['all', ...REGIONS]) assert(html.includes(`data-region="${id}"`), `HTML thiếu data-region="${id}"`);
  assert(/api\.setRegion|setRegion\(/.test(density) && /regionTrafficPayload/.test(density), 'bộ điều phối phải gọi traffic.api.setRegion theo hợp đồng');
});

function initProbe() {
  const probe = window.__probe = { scenes: [], renderers: [], camera: null, pose: null, frames: [], pipelines: 0 };
  const hook = new EventTarget();
  hook.addEventListener('observe', event => {
    const object = event.detail;
    if (object?.isScene) {
      probe.scenes.push(object);
      object.onBeforeRender = (renderer, scene, camera) => {
        if (!(camera.isPerspectiveCamera && camera.near === 3)) return;
        probe.camera = camera;
        if (probe.pose) {
          camera.position.fromArray(probe.pose.position);
          if (camera.fov !== probe.pose.fov) { camera.fov = probe.pose.fov; camera.updateProjectionMatrix(); }
          camera.lookAt(...probe.pose.target); camera.updateMatrixWorld(true);
        }
      };
    }
    if (object?.isWebGPURenderer || object?.isRenderer) {
      probe.renderers.push(object);
      const info = object.info, reset = info.reset.bind(info);
      info.reset = () => {
        if (info.render.drawCalls) { probe.frames.push({ triangles: info.render.triangles, drawCalls: info.render.drawCalls, t: performance.now() }); if (probe.frames.length > 400) probe.frames.shift(); }
        reset();
      };
    }
  });
  window.__THREE_DEVTOOLS__ = hook;
}

async function open(browser, query, { storage = null, clear = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(initProbe);
  if (clear) await page.addInitScript(values => { try { if (!sessionStorage.getItem('qa31h')) { localStorage.clear(); for (const [k, v] of Object.entries(values || {})) localStorage.setItem(k, v); sessionStorage.setItem('qa31h', '1'); } } catch {} }, storage);
  await page.goto(`${BASE}?v=30b${query}`, { waitUntil: 'load' });
  await waitReady(page);
  return { context, page, errors };
}
async function waitReady(page) {
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.density?.level && window.webgpuMaterials24?.region?.id, null, { timeout: 240000 });
}
async function openControls(page) {
  if (await page.locator('#controls').evaluate(el => el.classList.contains('collapsed'))) await page.click('#collapse');
  await sleep(350);
}
async function waitSmooth(page, quietMs = 1500, limitMs = 25000) {
  return page.evaluate(async ([quiet, limit]) => new Promise(resolve => {
    const t0 = performance.now(); let last = t0, calm = t0;
    const tick = now => { const dt = now - last; last = now; if (dt > 80) calm = now; if (now - calm > quiet || now - t0 > limit) resolve(Math.round(now - t0)); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), [quietMs, limitMs]);
}
async function measureInfo(page, settleMs = 1600) {
  await sleep(settleMs);
  await page.waitForFunction(() => window.webgpuMaterials24.density.api.aoReady?.() !== false, null, { timeout: 60000, polling: 200 });
  return page.evaluate(async () => {
    window.__probe.frames.length = 0;
    await new Promise(resolve => { const tick = () => window.__probe.frames.length >= 40 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
    const med = list => { const s = list.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const frames = window.__probe.frames.slice();
    return { triangles: med(frames.map(f => f.triangles)), drawCalls: med(frames.map(f => f.drawCalls)) };
  });
}
// Bấm nút (density/region) và đo: click → trạng thái áp dụng; khung dài nhất trong windowMs (gồm camera bay tới khu).
async function click(page, selector, expectKey, expectValue, windowMs = 3200) {
  await openControls(page);
  return page.evaluate(async ([selector, expectKey, expectValue, windowMs]) => {
    const button = document.querySelector(selector);
    const times = []; let firstApplied = null, stop = false;
    const read = () => expectKey === 'region' ? window.webgpuMaterials24.region.id : window.webgpuMaterials24.density.level;
    const t0 = performance.now();
    const tick = () => { const now = performance.now(); times.push(now); if (firstApplied === null && read() === expectValue) firstApplied = now; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    button.click();
    await new Promise(resolve => setTimeout(resolve, windowMs)); stop = true;
    const all = [t0, ...times], deltas = all.slice(1).map((t, i) => t - all[i]);
    return { switchMs: firstApplied === null ? null : Math.round(firstApplied - t0), maxFrameMs: Math.round(Math.max(...deltas, 0)), applyMs: window.webgpuMaterials24.region.applyMs };
  }, [selector, expectKey, expectValue, windowMs]);
}

// Trạng thái đọc độc lập từ mesh đã dựng.
async function sceneState(page) {
  return page.evaluate(async () => {
    const status = window.webgpuMaterials24, D = window.CITY_DATA, scenes = window.__probe.scenes;
    const registry = (await import('./signature-registry-31.js?v=30b-31e2')).loadSignatureRegistry(window.SIGNATURE_REGISTRY_31);
    const R = await import('./city-region-31.js?v=30b-31h');
    const regionId = status.density.api.regionState().id, inside = (x, z) => regionId === 'all' || R.regionOf(x, z) === regionId;
    const chunks = [], treeChunks = [], farGroups = [];
    for (const s of scenes) s.traverse(o => {
      if (o.userData?.densityChunk) chunks.push(o);
      if (o.isInstancedMesh && o.userData?.densityInstances?.source === 'trunks') treeChunks.push(o);
      if (o.isInstancedMesh && o.userData?.densityInstances?.far && o.userData.densityInstances.split) farGroups.push(o);
    });
    const hero = new Set([801710792, 2000032897, 39598465]);
    const hidden = new Set((window.BRIDGE_CORRECTIONS_31?.buildings || []).filter(e => e.action === 'hide').map(e => Number(e.id)));
    const shownIdx = new Set(); let cityTriangles = 0;
    for (const mesh of chunks) {
      if (!mesh.visible) continue;
      const { buildings, vertexEnds } = mesh.userData.densityChunk, position = mesh.geometry.attributes.position;
      const count = Math.min(position.count, mesh.geometry.drawRange.count);
      cityTriangles += count / 3;
      for (let k = 0; k < buildings.length && vertexEnds[k] <= count; k++) shownIdx.add(buildings[k]);
    }
    const sig = new Set(registry.signatureBuildingIds());
    const outside = [], notShownSignature = [];
    for (const i of shownIdx) { const b = D.buildings[i]; if (!inside(b.center[0], b.center[1]) && !sig.has(Number(b.id))) outside.push(Number(b.id)); }
    const shownIds = new Set([...shownIdx].map(i => Number(D.buildings[i].id)));
    for (const id of sig) if (!hero.has(id) && !hidden.has(id) && D.buildings.some(b => Number(b.id) === id) && !shownIds.has(id)) notShownSignature.push(id);
    // Cây: chỉ mục đang cho phép (densityCount) của chunk đang hiện; ngoài khu chỉ được là mục bảo vệ (vùng giữ cây).
    let treesShown = 0, treesOutsideUnprotected = 0, treesInside = 0;
    for (const mesh of treeChunks) {
      if (!mesh.visible) continue;
      const m = mesh.instanceMatrix.array, drawn = mesh.userData.densityCount ?? mesh.count;
      for (let i = 0; i < drawn; i++) {
        const x = m[i * 16 + 12], z = m[i * 16 + 14]; treesShown++;
        if (inside(x, z)) treesInside++; else if (!registry.inProtectedZone(x, z, 'tree')) treesOutsideUnprotected++;
      }
    }
    const farVisible = farGroups.filter(m => m.visible).map(m => m.userData.densityInstances.region);
    const api = status.traffic?.api ?? status.motion?.api;
    let vehicles = null;
    if (typeof api?.poses === 'function') {
      const poses = api.poses(); let active = 0, outsideVehicles = 0;
      for (let i = 0; i + 4 < poses.length; i += 5) { if (!poses[i] && !poses[i + 2]) continue; active++; if (!inside(poses[i], poses[i + 2])) outsideVehicles++; }
      vehicles = { active, outside: outsideVehicles, region: api.getRegion?.() ?? null };
    }
    const r = status.region;
    return {
      region: regionId, label: r.label, audit: status.density.audit, dataset: { region: document.body.dataset.region, audit: document.body.dataset.densityAudit },
      shown: shownIdx.size, outside, notShownSignature, cityTriangles, visibleChunks: chunks.filter(m => m.visible).length,
      trees: { shown: treesShown, inside: treesInside, outsideUnprotected: treesOutsideUnprotected, farVisible },
      vehicles, vessels: { inRegion: status.motion?.vesselsInRegion, total: status.motion?.vessels },
      state: { buildings: r.buildings, buildingsInRegion: r.buildingsInRegion, buildingsRegionTotal: r.buildingsRegionTotal, trees: r.trees, lamps: r.lamps, vehicles: r.vehicles, vehiclesRegionVia: r.vehiclesRegionVia, source: r.source, label: r.label }
    };
  });
}

// Camera nhìn thẳng xuống một công trình rồi nhờ app chọn (raycast) tại tâm màn hình.
async function pickAt(page, building, aboveM = 400) {
  const pose = { position: [building.x + 40, building.h + aboveM, building.z + 40], target: [building.x, building.h, building.z], fov: 42 };
  await page.evaluate(p => { window.__probe.pose = p; }, pose);
  await sleep(700);
  return page.evaluate(() => window.webgpuMaterials24.pickBuilding(innerWidth / 2, innerHeight / 2));
}

async function runBackend(browser, backend) {
  const q = backend === 'webgl' ? '&backend=webgl' : '';
  const out = { backend, matrix: {}, errors: [] };
  // 1) điều khiển + bao phủ + ma trận khu × mật độ.
  {
    const { context, page, errors } = await open(browser, `&view=overview${q}`);
    out.actualBackend = await page.evaluate(() => window.webgpuMaterials24.backend);
    out.initial = await page.evaluate(() => ({ region: window.webgpuMaterials24.region.id, source: window.webgpuMaterials24.region.source, dataset: document.body.dataset.region }));
    await openControls(page);
    out.control = await page.evaluate(() => {
      const group = document.querySelector('#controlBody #regionControl');
      const buttons = group ? [...group.querySelectorAll('[data-region]')] : [];
      return { exists: !!group, role: group?.getAttribute('role'), label: document.getElementById(group?.getAttribute('aria-labelledby') || '')?.textContent || '', describedBy: group?.getAttribute('aria-describedby'),
        buttons: buttons.map(b => ({ id: b.dataset.region, text: b.textContent.trim(), role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), tabindex: b.getAttribute('tabindex'), active: b.classList.contains('active') })) };
    });
    // Bao phủ: bốn khu phủ toàn bộ công trình đúng một lần (đa giác thuần túy + chunk).
    out.coverage = await page.evaluate(async () => {
      const R = await import('./city-region-31.js?v=30b-31h'), D = window.CITY_DATA, counts = {}, bad = [];
      for (const b of D.buildings) {
        const hits = R.regionHits(b.center[0], b.center[1]);
        if (hits.length !== 1 || R.regionOf(b.center[0], b.center[1]) !== hits[0]) bad.push([b.id, hits.join('+')]);
        counts[hits[0]] = (counts[hits[0]] || 0) + 1;
      }
      let sweepBad = 0, sweepN = 0;
      for (let x = -3500; x <= 3500; x += 41.3) for (let z = -3500; z <= 3500; z += 43.1) { sweepN++; if (R.regionHits(x, z).length !== 1) sweepBad++; }
      const chunkMismatch = [], chunkCounts = {}, seen = new Set(); let dupes = 0;
      for (const s of window.__probe.scenes) s.traverse(o => {
        const c = o.userData?.densityChunk; if (!c || c.cell.startsWith('merged')) return;
        for (const i of c.buildings) { const b = D.buildings[i]; if (R.regionOf(b.center[0], b.center[1]) !== c.region) chunkMismatch.push(b.id); if (seen.has(i)) dupes++; seen.add(i); chunkCounts[c.region] = (chunkCounts[c.region] || 0) + 1; }
      });
      return { total: D.buildings.length, counts, bad: bad.slice(0, 5), badCount: bad.length, sweepN, sweepBad, chunkMismatch: chunkMismatch.slice(0, 5), chunkMismatchCount: chunkMismatch.length, chunkCounts, dupes, drawable: seen.size,
        polygons: R.REGIONS_31.map(r => ({ id: r.id, n: r.polygon.length })), ids: R.REGIONS_31.map(r => r.id) };
    });
    // Ma trận: mật độ (Đầy đủ, Tối thiểu) × khu (Toàn bộ + 4), cùng camera Toàn vùng của khu.
    for (const level of ['full', 'minimal']) {
      await click(page, `#controlBody [data-density="${level}"]`, 'level', level, 900);
      for (const region of ['all', ...REGIONS]) {
        const timing = await click(page, `#controlBody [data-region="${region}"]`, 'region', region);
        await waitSmooth(page);
        const info = await measureInfo(page);
        const state = await sceneState(page);
        out.matrix[`${level}:${region}`] = { timing, info, state };
      }
    }
    // Quay về Đầy đủ: không tồn đọng trạng thái sau khi đi qua mọi khu.
    await click(page, '#controlBody [data-density="full"]', 'level', 'full', 900);
    await click(page, '#controlBody [data-region="all"]', 'region', 'all');
    await waitSmooth(page);
    out.afterAll = { info: await measureInfo(page), state: await sceneState(page) };
    out.errors.push(...errors);
    await context.close();
  }
  // 2) chọn công trình, camera/góc nhìn, xe/tàu, Flood Lab, bàn phím, đồng hành với mật độ.
  {
    const { context, page, errors } = await open(browser, `&view=overview&density=full${q}`);
    const D = await page.evaluate(() => window.CITY_DATA.buildings.map(b => ({ id: b.id, x: b.center[0], z: b.center[1], h: b.h, name: b.name || '' })));
    const info = await page.evaluate(async () => {
      const R = await import('./city-region-31.js?v=30b-31h'), registry = (await import('./signature-registry-31.js?v=30b-31e2')).loadSignatureRegistry(window.SIGNATURE_REGISTRY_31);
      return { sig: registry.signatureBuildingIds(), hidden: (window.BRIDGE_CORRECTIONS_31?.buildings || []).filter(e => e.action === 'hide').map(e => Number(e.id)) };
    });
    const sig = new Set(info.sig), hidden = new Set(info.hidden);
    const pickReport = {};
    const regionOfNode = async list => page.evaluate(async list => { const R = await import('./city-region-31.js?v=30b-31h'); return list.map(b => R.regionOf(b.x, b.z)); }, list);
    // Mẫu: công trình cao 40–120 m không signature, mỗi khu 6 mẫu trong khu + 3 mẫu ngoài khu. Camera nhìn xuống đỉnh mái; công
    // trình cao hơn ngay bên cạnh có thể che tia nên chỉ yêu cầu đa số trúng; mọi lần trúng phải là công trình trong khu hoặc signature.
    const candidates = D.filter(b => !sig.has(Number(b.id)) && !hidden.has(Number(b.id)) && b.h >= 40 && b.h <= 120).sort((a, b) => b.h - a.h).slice(0, 900);
    const ofRegion = await regionOfNode(candidates);
    const sample = {}; REGIONS.forEach(r => { sample[r] = candidates.filter((b, i) => ofRegion[i] === r).slice(0, 6); });
    const byId = new Map(D.map(b => [Number(b.id), b]));
    const regionOfId = async id => (await regionOfNode([byId.get(Number(id))]))[0];
    await openControls(page);
    for (const region of REGIONS) {
      await click(page, `#controlBody [data-region="${region}"]`, 'region', region, 800);
      await waitSmooth(page);
      const insideHits = [], outsideHits = [];
      for (const b of sample[region]) { const r = await pickAt(page, b); insideHits.push({ id: b.id, picked: r?.id ?? null, pickedRegion: r ? await regionOfId(r.id) : null, pickedSignature: r ? sig.has(Number(r.id)) : false }); }
      const others = REGIONS.filter(r => r !== region);
      for (const other of others) for (const b of sample[other].slice(0, 2)) { const r = await pickAt(page, b); outsideHits.push({ id: b.id, region: other, picked: r?.id ?? null, pickedRegion: r ? await regionOfId(r.id) : null, pickedSignature: r ? sig.has(Number(r.id)) : false }); }
      await page.evaluate(() => { window.__probe.pose = null; });
      pickReport[region] = { insideHits, outsideHits };
    }
    out.pick = pickReport;
    // Camera: chọn khu → camera bay tới khung của khu (nhãn HUD + khoảng cách tới tâm khung).
    out.camera = {};
    for (const region of ['all', ...REGIONS]) {
      await click(page, `#controlBody [data-region="${region}"]`, 'region', region, 3600);
      await waitSmooth(page, 900);
      out.camera[region] = await page.evaluate(async region => {
        const R = await import('./city-region-31.js?v=30b-31h'), cam = window.__probe.camera, view = region === 'all' ? { target: [0, 0, 0], distance: 7600 } : R.regionById(region).view;
        const dx = cam.position.x - view.target[0], dy = cam.position.y - view.target[1], dz = cam.position.z - view.target[2];
        return { label: document.querySelector('#viewLabel').textContent, distance: Math.round(Math.hypot(dx, dy, dz)), expected: view.distance, url: location.search };
      }, region);
    }
    // Góc nhìn trong khu: tâm góc ở khu khác thì tự chuyển sang khu đó (thông báo), overview = khung khu, góc cùng khu giữ khu.
    out.views = {};
    await click(page, '#controlBody [data-region="nam"]', 'region', 'nam', 800);
    for (const view of ['bason', 'materials', 'river', 'boulevard', 'corridor', 'overview']) {
      await page.evaluate(v => document.querySelector(`#controlBody [data-view="${v}"]`).click(), view);
      await sleep(500);
      out.views[view] = await page.evaluate(() => ({ region: window.webgpuMaterials24.region.id, label: document.querySelector('#viewLabel').textContent, notice: document.querySelector('#regionNotice')?.hidden === false ? document.querySelector('#regionNotice').textContent : '', active: document.querySelector('#controlBody [data-view].active')?.dataset.view }));
      // Quay lại khu nam để mỗi góc kiểm độc lập.
      await page.evaluate(() => window.webgpuMaterials24.density.api.setRegion('nam', 'qa'));
      await sleep(300);
    }
    out.expectedViewRegion = await page.evaluate(async targets => { const R = await import('./city-region-31.js?v=30b-31h'); return Object.fromEntries(Object.entries(targets).map(([k, t]) => [k, R.regionOf(t[0], t[1])])); }, VIEW_TARGETS);
    // Flood Lab: mở khi đang ở khu khác → chuyển sang khu chứa Thảo Điền; đóng không lỗi.
    out.flood = {};
    await page.evaluate(() => window.webgpuMaterials24.density.api.setRegion('nam', 'qa')); await sleep(500);
    await page.click('#collapse').catch(() => null);
    await page.evaluate(() => document.querySelector('[data-open-flood]')?.click()); await sleep(1500);
    out.flood.open = await page.evaluate(() => ({ region: window.webgpuMaterials24.region.id, panel: !!document.querySelector('.flood-lab:not([hidden])') || document.body.classList.contains('flood-open') || !!document.querySelector('[data-flood-panel]'), label: document.querySelector('#viewLabel').textContent }));
    out.flood.rain = await page.evaluate(() => { window.webgpuMaterials24.setFloodRain(120); return { ok: true }; });
    await page.evaluate(() => window.webgpuMaterials24.setFloodRain(0));
    await page.evaluate(() => document.querySelector('#closeFloodLab')?.click()); await sleep(600);
    out.flood.closed = await page.evaluate(() => ({ open: document.body.classList.contains('flood-open'), region: window.webgpuMaterials24.region.id }));
    await page.evaluate(() => window.webgpuMaterials24.selectView('overview')); await sleep(800);
    // Xe/tàu theo khu.
    out.motion = {};
    for (const region of ['all', ...REGIONS]) {
      await page.evaluate(r => window.webgpuMaterials24.density.api.setRegion(r, 'qa'), region); await sleep(1800);
      out.motion[region] = await page.evaluate(async () => {
        const s = window.webgpuMaterials24, api = s.traffic?.api ?? s.motion?.api, r = s.region;
        return { vehicles: r.vehicles, via: r.vehiclesRegionVia, vessels: s.motion.vesselsInRegion, apiRegion: api?.getRegion?.() ?? null, total: api?.total ?? null };
      });
    }
    // Bàn phím trên radiogroup khu.
    await openControls(page);
    await page.evaluate(() => window.webgpuMaterials24.density.api.setRegion('all', 'qa')); await sleep(300);
    out.keyboard = [];
    await page.focus('#controlBody [data-region][aria-checked="true"]');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowLeft']) {
      await page.keyboard.press(key); await sleep(150);
      out.keyboard.push(await page.evaluate(() => ({ region: window.webgpuMaterials24.region.id, focus: document.activeElement?.dataset?.region, checked: document.querySelector('#controlBody [data-region][aria-checked="true"]')?.dataset.region, tabs: [...document.querySelectorAll('#controlBody [data-region]')].map(b => b.tabIndex) })));
    }
    out.counts = await page.evaluate(() => document.querySelector('#regionCounts')?.textContent || '');
    // Đổi mật độ khi đang ở một khu: giữ khu, tập hiện thị vẫn ⊆ khu ∪ signature.
    await page.evaluate(() => window.webgpuMaterials24.density.api.setRegion('bac', 'qa')); await sleep(500);
    out.withDensity = {};
    for (const level of ['balanced', 'light', 'minimal', 'full']) {
      await page.evaluate(l => window.webgpuMaterials24.density.api.setLevel(l, 'qa'), level); await sleep(900);
      const s = await sceneState(page);
      out.withDensity[level] = { region: s.region, level: await page.evaluate(() => window.webgpuMaterials24.density.level), outside: s.outside.length, notShownSignature: s.notShownSignature.length, shown: s.shown, audit: s.audit.complete };
    }
    out.errors.push(...errors);
    await context.close();
  }
  // 3) URL / localStorage.
  out.persist = {};
  {
    const readState = page => page.evaluate(() => ({ region: window.webgpuMaterials24.region.id, source: window.webgpuMaterials24.region.source, checked: document.querySelector('#controlBody [data-region][aria-checked="true"]')?.dataset.region, dataset: document.body.dataset.region, level: window.webgpuMaterials24.density.level, stored: localStorage.getItem('citylab.31h.region'), url: location.search, label: document.querySelector('#viewLabel').textContent }));
    let ctx = await open(browser, `&view=overview&region=bac${q}`);
    out.persist.url = await readState(ctx.page);
    await openControls(ctx.page);
    await ctx.page.click('#controlBody [data-region="nam"]'); await sleep(900);
    out.persist.urlAfterClick = await readState(ctx.page);
    await ctx.page.click('#cityNav [data-view="overview"]'); await sleep(900);
    out.persist.urlAfterView = await readState(ctx.page);
    await ctx.page.click('#cityNav [data-view="river"]'); await sleep(900);
    out.persist.urlAfterSwitch = await readState(ctx.page);
    out.errors.push(...ctx.errors); await ctx.context.close();
    ctx = await open(browser, `&view=overview${q}`, { storage: { 'citylab.31h.region': 'nam' } });
    out.persist.storage = await readState(ctx.page);
    await openControls(ctx.page);
    await ctx.page.click('#controlBody [data-region="trung-tam"]'); await sleep(900);
    out.persist.storageAfterClick = await readState(ctx.page);
    await ctx.page.reload({ waitUntil: 'load' }); await waitReady(ctx.page);
    out.persist.reload = await readState(ctx.page);
    out.errors.push(...ctx.errors); await ctx.context.close();
    ctx = await open(browser, `&view=overview&region=ven-song${q}`, { storage: { 'citylab.31h.region': 'nam' } });
    out.persist.urlWins = await readState(ctx.page);
    out.errors.push(...ctx.errors); await ctx.context.close();
    ctx = await open(browser, `&view=bason&region=nam&density=minimal${q}`);
    out.persist.combo = await readState(ctx.page);
    out.errors.push(...ctx.errors); await ctx.context.close();
    ctx = await open(browser, `&view=overview&region=khong-co${q}`);
    out.persist.invalid = await readState(ctx.page);
    out.errors.push(...ctx.errors); await ctx.context.close();
  }
  return out;
}

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {}, table = {};
  try {
    for (const backend of backends) {
      let r;
      try { r = report[backend] = await runBackend(browser, backend); }
      catch (error) { check(`[${backend}] mở app và chạy kịch bản khu mô phỏng`, () => { throw error; }); continue; }
      const tag = `[${backend}] `, M = r.matrix;
      check(tag + 'backend đúng yêu cầu', () => assert.equal(r.actualBackend, backend === 'webgl' ? 'webgl2-fallback' : 'webgpu'));
      check(tag + 'mặc định "Toàn bộ" khi chưa có URL/localStorage', () => assert.deepEqual(r.initial, { region: 'all', source: 'default', dataset: 'all' }));
      check(tag + 'điều khiển: radiogroup "Khu mô phỏng", 5 nút role=radio đúng nhãn tiếng Việt, đúng 1 aria-checked, roving tabindex', () => {
        const c = r.control; assert(c.exists && c.role === 'radiogroup', 'thiếu radiogroup khu');
        assert(/Khu mô phỏng/.test(c.label), `nhãn nhóm: ${c.label}`); assert.equal(c.describedBy, 'regionCounts');
        assert.deepEqual(c.buttons.map(b => b.id), ['all', ...REGIONS]); assert.deepEqual(c.buttons.map(b => b.text), BUTTON_TEXT);
        assert(c.buttons.every(b => b.role === 'radio')); assert.equal(c.buttons.filter(b => b.checked === 'true').length, 1);
        assert.deepEqual(c.buttons.map(b => b.tabindex), ['0', '-1', '-1', '-1', '-1']); assert(c.buttons[0].active);
      });
      check(tag + 'bốn khu phủ toàn bộ công trình đúng một lần (0 lỗ hở, 0 chồng), chunk đúng khu, không công trình trùng', () => {
        const c = r.coverage;
        assert.equal(c.badCount, 0, JSON.stringify(c.bad)); assert.equal(c.sweepBad, 0, `${c.sweepBad}/${c.sweepN} điểm lưới có ≠ 1 khu`);
        assert.deepEqual(c.ids, REGIONS); assert.equal(REGIONS.reduce((s, id) => s + c.counts[id], 0), c.total, JSON.stringify(c.counts));
        assert(REGIONS.every(id => c.counts[id] > 5000), JSON.stringify(c.counts));
        assert.equal(c.chunkMismatchCount, 0, JSON.stringify(c.chunkMismatch)); assert.equal(c.dupes, 0);
        assert.equal(REGIONS.reduce((s, id) => s + c.chunkCounts[id], 0), c.drawable, JSON.stringify(c.chunkCounts));
      });
      for (const level of ['full', 'minimal']) for (const region of ['all', ...REGIONS]) {
        const key = `${level}:${region}`, m = M[key], s = m?.state;
        check(tag + `${level}/${region}: công trình hiển thị ⊆ khu ∪ signature; signature 100 %; registry đủ`, () => {
          assert(s, 'thiếu số liệu'); assert.equal(s.region, region);
          assert.equal(s.outside.length, 0, `công trình ngoài khu không phải signature: ${s.outside.slice(0, 5)}`);
          assert.equal(s.notShownSignature.length, 0, `signature bị ẩn: ${s.notShownSignature.slice(0, 5)}`);
          assert(s.audit.complete && s.audit.visible === s.audit.total, JSON.stringify(s.audit)); assert.equal(s.dataset.audit, 'complete'); assert.equal(s.dataset.region, region);
          assert.equal(s.label, region === 'all' ? 'Toàn bộ' : REGION_LABELS[region]);
        });
        check(tag + `${level}/${region}: cây ngoài khu chỉ là mục bảo vệ; bản xa chỉ của khu + nhóm bảo vệ`, () => {
          assert.equal(s.trees.outsideUnprotected, 0, JSON.stringify(s.trees));
          if (region !== 'all') for (const g of s.trees.farVisible) assert(g === region || g === '@protected', `bản xa lạ: ${g}`);
          assert(s.trees.shown > 0, 'không có cây nào');
        });
        if (region !== 'all') check(tag + `${level}/${region}: số công trình trong khu + tổng tự báo khớp mesh`, () => {
          assert.equal(s.state.buildings, s.shown, JSON.stringify(s.state));
          assert(s.state.buildingsInRegion <= s.state.buildingsRegionTotal && s.state.buildingsInRegion > 0, JSON.stringify(s.state));
          assert(s.state.buildingsInRegion <= s.shown);
        });
      }
      check(tag + 'Đầy đủ: mỗi khu giảm rõ tam giác (≤ 70 %) và draw call (< Toàn bộ) so với Toàn bộ', () => {
        const base = M['full:all'].info;
        for (const region of REGIONS) { const i = M[`full:${region}`].info; assert(i.triangles <= base.triangles * FULL_TRI_RATIO, `${region}: ${i.triangles} / ${base.triangles}`); assert(i.drawCalls < base.drawCalls, `${region}: dc ${i.drawCalls} / ${base.drawCalls}`); }
      });
      check(tag + 'Tối thiểu: mỗi khu không nặng hơn Toàn bộ (tam giác ≤; draw call ≤ +3 do nhóm bản xa/thiết bị mái tách theo khu)', () => {
        const base = M['minimal:all'].info;
        for (const region of REGIONS) { const i = M[`minimal:${region}`].info; assert(i.triangles <= base.triangles && i.drawCalls <= base.drawCalls + 3, `${region}: ${JSON.stringify(i)} / ${JSON.stringify(base)}`); }
      });
      check(tag + `đổi khu: khung dài nhất (gồm camera bay) ≤ ${SWITCH_MS} ms, áp dụng ngay (switchMs nhỏ)`, () => {
        for (const [key, m] of Object.entries(M)) { assert(m.timing.maxFrameMs <= SWITCH_MS, `${key}: ${JSON.stringify(m.timing)}`); assert(m.timing.switchMs !== null && m.timing.switchMs <= SWITCH_MS, `${key}: ${JSON.stringify(m.timing)}`); }
      });
      check(tag + 'sau khi đi qua mọi khu rồi về "Toàn bộ": số liệu quay về như ban đầu', () => {
        const base = M['full:all'];
        assert.equal(r.afterAll.state.shown, base.state.shown); assert.equal(r.afterAll.state.trees.shown, base.state.trees.shown);
        assert(Math.abs(r.afterAll.info.drawCalls - base.info.drawCalls) <= 4, JSON.stringify([r.afterAll.info, base.info]));
        assert(Math.abs(r.afterAll.info.triangles - base.info.triangles) <= base.info.triangles * .03, JSON.stringify([r.afterAll.info, base.info]));
      });
      check(tag + 'chọn công trình: trong khu trúng đúng (đa số), mọi lần trúng là công trình trong khu hoặc signature; ngoài khu (không signature) không chọn được', () => {
        for (const region of REGIONS) {
          const p = r.pick[region]; assert(p.insideHits.length >= 4 && p.outsideHits.length >= 4, region);
          const exact = p.insideHits.filter(h => h.picked === h.id).length;
          assert(exact >= Math.ceil(p.insideHits.length * .6), `${region}: chỉ ${exact}/${p.insideHits.length} trúng đúng ${JSON.stringify(p.insideHits)}`);
          for (const h of [...p.insideHits, ...p.outsideHits]) if (h.picked !== null) assert(h.pickedRegion === region || h.pickedSignature, `${region}: chọn được công trình ngoài khu ${JSON.stringify(h)}`);
          for (const h of p.outsideHits) assert.notEqual(h.picked, h.id, `${region} ngoài khu vẫn chọn được: ${JSON.stringify(h)}`);
        }
      });
      check(tag + 'camera: chọn khu bay tới khung khu (nhãn HUD + khoảng cách); Toàn bộ về Toàn vùng; URL không bị thêm region khi không có', () => {
        for (const region of ['all', ...REGIONS]) {
          const c = r.camera[region]; assert(Math.abs(c.distance - c.expected) / c.expected < .03, `${region}: ${JSON.stringify(c)}`);
          assert(region === 'all' ? /TOÀN VÙNG/.test(c.label) : c.label.includes(REGION_LABELS[region].toUpperCase()), `${region}: ${c.label}`);
          assert(!/region=/.test(c.url), `${region}: ${c.url}`);
        }
      });
      check(tag + 'góc nhìn data-view trong khu: tâm góc ở khu khác → chuyển sang khu đó (có thông báo); Toàn vùng = khung khu; góc cùng khu giữ khu', () => {
        for (const view of ['bason', 'materials', 'river', 'boulevard', 'corridor']) {
          const v = r.views[view], expected = r.expectedViewRegion[view];
          assert.equal(v.region, expected, `${view}: ${JSON.stringify(v)}`);
          if (expected !== 'nam') assert(/khu/.test(v.notice), `${view}: thiếu thông báo ${JSON.stringify(v)}`);
          assert.equal(v.active, view);
        }
        assert.equal(r.views.overview.region, 'nam'); assert(/PHÍA NAM/.test(r.views.overview.label), r.views.overview.label); assert.equal(r.views.overview.active, 'overview');
      });
      check(tag + 'Flood Lab trong khu: mở sang khu chứa Thảo Điền (ven sông) không lỗi; kịch bản mưa vẫn chạy', () => {
        assert.equal(r.flood.open.region, r.expectedViewRegion.flood25, JSON.stringify(r.flood)); assert(r.flood.rain.ok); assert.equal(r.flood.closed.open, false);
      });
      check(tag + 'xe theo khu: dùng traffic.api.setRegion thật; tổng xe giảm theo khu; mọi xe đang chạy nằm trong khu', () => {
        const all = r.motion.all; assert.equal(all.via, 'traffic.api.setRegion', JSON.stringify(all));
        for (const region of REGIONS) { const m = r.motion[region]; assert.equal(m.via, 'traffic.api.setRegion'); assert(m.vehicles > 0 && m.vehicles < all.vehicles, `${region}: ${JSON.stringify(m)}`); assert.equal(m.apiRegion?.id, region, JSON.stringify(m)); }
        for (const key of ['full:' + REGIONS[0], 'full:' + REGIONS[1], 'full:' + REGIONS[2], 'full:' + REGIONS[3]]) { const v = M[key].state.vehicles; if (v) { assert.equal(v.outside, 0, `${key}: ${JSON.stringify(v)}`); assert(v.active > 0, JSON.stringify(v)); } }
        const sum = REGIONS.reduce((s, id) => s + r.motion[id].vehicles, 0); assert(sum <= all.vehicles * 1.05 && sum >= all.vehicles * .6, `tổng xe 4 khu ${sum} / toàn bộ ${all.vehicles}`);
      });
      check(tag + 'tàu theo khu: tổng 4 khu ≈ 22 tàu, mỗi khu chỉ vẽ tàu trong khu', () => {
        assert.equal(r.motion.all.vessels, 22); const sum = REGIONS.reduce((s, id) => s + r.motion[id].vessels, 0); assert(Math.abs(sum - 22) <= 3, `${sum} tàu / 22 (đo lần lượt, tàu đang chạy nên cho lệch ≤ 3): ${JSON.stringify(r.motion)}`); assert(REGIONS.every(id => r.motion[id].vessels < 22));
      });
      check(tag + 'bàn phím: mũi tên/Home/End đổi khu, focus đi theo, aria-checked khớp, roving tabindex', () => {
        const order = ['all', ...REGIONS], k = r.keyboard;
        assert.deepEqual(k.map(s => s.region), ['trung-tam', 'ven-song', 'trung-tam', 'nam', 'all', 'nam']);
        for (const s of k) { assert.equal(s.focus, s.region); assert.equal(s.checked, s.region); assert.deepEqual(s.tabs, order.map(id => id === s.region ? 0 : -1)); }
      });
      check(tag + 'số liệu hiển thị trong bảng điều khiển (nhà/cây/xe) và aria-live', () => assert(/nhà/.test(r.counts) && /cây/.test(r.counts) && /xe/.test(r.counts), r.counts));
      check(tag + 'kết hợp mọi mức mật độ: khu giữ nguyên, tập hiển thị ⊆ khu ∪ signature, registry đủ', () => {
        for (const level of ['balanced', 'light', 'minimal', 'full']) { const w = r.withDensity[level]; assert.equal(w.region, 'bac'); assert.equal(w.level, level); assert.equal(w.outside, 0, JSON.stringify(w)); assert.equal(w.notShownSignature, 0); assert(w.audit); }
        assert(r.withDensity.balanced.shown < r.withDensity.full.shown && r.withDensity.minimal.shown < r.withDensity.balanced.shown, JSON.stringify(r.withDensity));
      });
      check(tag + 'URL &region= ưu tiên localStorage; đổi khu cập nhật URL (nếu có) + localStorage; góc nhìn giữ &region=; giá trị lạ → Toàn bộ', () => {
        const p = r.persist;
        assert.equal(p.url.region, 'bac'); assert.equal(p.url.source, 'url'); assert.equal(p.url.checked, 'bac'); assert.equal(p.url.dataset, 'bac');
        assert.equal(p.urlAfterClick.region, 'nam'); assert.equal(p.urlAfterClick.stored, 'nam'); assert(/[?&]region=nam/.test(p.urlAfterClick.url), p.urlAfterClick.url);
        assert(/[?&]region=nam/.test(p.urlAfterView.url), p.urlAfterView.url); assert.equal(p.urlAfterView.region, 'nam');
        assert.equal(p.urlAfterSwitch.region, 'trung-tam'); assert(/[?&]region=trung-tam/.test(p.urlAfterSwitch.url) && /view=river/.test(p.urlAfterSwitch.url), p.urlAfterSwitch.url);
        assert.equal(p.storage.region, 'nam'); assert.equal(p.storage.source, 'storage'); assert(!/region=/.test(p.storage.url), p.storage.url);
        assert.equal(p.storageAfterClick.stored, 'trung-tam'); assert.equal(p.reload.region, 'trung-tam'); assert.equal(p.reload.source, 'storage');
        assert.equal(p.urlWins.region, 'ven-song'); assert.equal(p.urlWins.source, 'url');
        assert.equal(p.invalid.region, 'all'); assert.equal(p.invalid.source, 'default');
      });
      check(tag + 'kết hợp &density=minimal&region=nam&view=bason: cả hai áp dụng; góc ở khu khác → khu theo URL quyết định (khung khu)', () => {
        const c = r.persist.combo; assert.equal(c.region, 'nam'); assert.equal(c.level, 'minimal'); assert(/PHÍA NAM/.test(c.label), c.label);
      });
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
      table[backend] = Object.fromEntries(Object.entries(M).map(([key, v]) => [key, { triangles: v.info.triangles, drawCalls: v.info.drawCalls, buildings: v.state.state.buildings, inRegion: v.state.state.buildingsInRegion, trees: v.state.state.trees, vehicles: v.state.state.vehicles, switchMs: v.timing.switchMs, maxFrameMs: v.timing.maxFrameMs }]));
    }
  } finally {
    await browser.close();
    console.log(JSON.stringify({ suite: 'region-31 · H', passed: checks.length, failed: failures.length, failures, table, summary: Object.fromEntries(Object.entries(report).map(([k, r]) => [k, { coverage: r.coverage, camera: r.camera, views: r.views, flood: r.flood, motion: r.motion, pick: r.pick, withDensity: r.withDensity, persist: r.persist, errors: r.errors }])) }, null, 1));
    console.log('\nCHECKS PASS:\n' + checks.map(c => ' ✓ ' + c).join('\n'));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
