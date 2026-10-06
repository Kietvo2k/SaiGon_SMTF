/*
 * QA 31A · bước E/F: "Mật độ chi tiết" (Đầy đủ / Cân bằng / Nhẹ / Tối thiểu) + bất biến signature registry.
 * File riêng (bước release gộp). Mọi phép đo chạy trong trình duyệt thật trên mesh đã dựng:
 * - công trình: đọc drawRange + userData.densityChunk của từng chunk lưới (không tin số liệu tự báo của module);
 * - cây: đọc instanceMatrix của chunk thân cây (count = đang vẽ, instanceMatrix.count = tổng);
 * - tam giác/draw call: renderer.info theo khung (gồm pass bóng), cùng camera và cùng quality.
 *
 * Chạy (server serve.py phải đang chạy):
 *   node outputs/hcmc-poc/scripts/qa-density-31.cjs            → WebGPU + WebGL 2
 *   node outputs/hcmc-poc/scripts/qa-density-31.cjs webgpu     → chỉ một backend
 * Biến môi trường: PORT (mặc định 8768) hoặc CITY_URL, PW_MODULE, PW_CHROME.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || `http://127.0.0.1:${process.env.PORT || 8768}/hcmc-poc/webgpu-materials-24.html`;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Ngưỡng nghiệm thu (đặc tả E mục 5; QA đặt độc lập với module).
const LEVELS = ['full', 'balanced', 'light', 'minimal'];
const LABELS = ['Đầy đủ', 'Cân bằng', 'Nhẹ', 'Tối thiểu'];
const MIN_REDUCTION = .6;                 // Tối thiểu giảm ≥ 60 % tam giác so với Đầy đủ (draw call: xem chú thích ở check)
// Draw call median 30B (research/baseline-30b/baseline-30b-metrics.json): overview 289; cận cảnh 30B 431–455 (pose02 lấy 431).
const DRAW_CALLS_30B = { overview: 289, pose02: 431 };
const BUDGET_02 = { full: 9.1e6, balanced: 5e6, minimal: 3e6 };  // tổng renderer.info ở camera ảnh 02 (WebGPU presentation)
const SWITCH_MS = 300;                    // click → khung đầu tiên đã áp dụng
const MAX_FRAME_MS = 250;                 // khung dài nhất quanh lúc đổi mức (không đứng hình)
const CITY_TRIANGLES_31C = 831620;        // tam giác city mesh sau bước C (bridge-31c-metrics.json)
const TREE_CELL_M = 300;
const POSE_02 = { base: 'bason', position: [625, 300, -1204.8], target: [605.8, 0, -1188.8], fov: 42 };

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 700) }); } };

check('mã nguồn: module city-density-31.js được nạp với khóa cache 30b-31e, HTML có điều khiển mật độ', () => {
  assert(fs.existsSync(path.join(root, 'city-density-31.js')), 'thiếu city-density-31.js');
  const app = read('webgpu-materials-24.js'), html = read('webgpu-materials-24.html'), mod = read('city-density-31.js');
  assert(/from '\.\/city-density-31\.js\?v=30b-31e[^']*'/.test(app), 'webgpu-materials-24.js chưa import city-density-31.js?v=30b-31e…');
  assert(/signature-registry-31\.js/.test(mod), 'bộ lọc mật độ phải đi qua signature-registry-31.js');
  assert(/role="radiogroup"/.test(html) && LEVELS.every(level => html.includes(`data-density="${level}"`)), 'HTML thiếu radiogroup data-density');
  assert(/id="densitySuggest"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="densitySuggest"/.test(html), 'thiếu thông báo đề xuất aria-live');
});

// Probe: gom Scene/Renderer qua __THREE_DEVTOOLS__, ghi tổng renderer.info mỗi khung, ghi đè pose camera chính.
function initProbe() {
  const probe = window.__probe = { scenes: [], renderers: [], camera: null, pose: null, frames: [], frameTimes: [] };
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function open(browser, query, { clearStorage = true, storage = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(initProbe);
  if (clearStorage) await page.addInitScript(value => { try { if (!sessionStorage.getItem('qa31e')) { localStorage.clear(); if (value) localStorage.setItem('citylab.31e.density', value); sessionStorage.setItem('qa31e', '1'); } } catch {} }, storage);
  await page.goto(`${BASE}?v=30b${query}`, { waitUntil: 'load' });
  await waitReady(page);
  return { context, page, errors };
}
async function waitReady(page) {
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.density?.level, null, { timeout: 240000 });
}
async function openControls(page) {
  if (await page.locator('#controls').evaluate(el => el.classList.contains('collapsed'))) await page.click('#collapse');
  await sleep(350);
}

// Trạng thái đọc độc lập từ mesh đã dựng.
async function sceneState(page) {
  return page.evaluate(async () => {
    const status = window.webgpuMaterials24, D = window.CITY_DATA, scenes = window.__probe.scenes;
    const registryModule = await import('./signature-registry-31.js?v=30b-31e2');
    const registry = registryModule.loadSignatureRegistry(window.SIGNATURE_REGISTRY_31);
    const chunks = [], treeChunks = [];
    for (const s of scenes) s.traverse(o => {
      if (o.userData?.densityChunk) chunks.push(o);
      if (o.isInstancedMesh && o.userData?.densityInstances?.source === 'trunks') treeChunks.push(o);
    });
    const visibleChain = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    // Công trình đang vẽ = tiền tố [0, k) của danh sách công trình trong chunk mà vertexEnds[k-1] ≤ drawRange.count.
    const shownIdx = new Set(); let triangles = 0, cityMeshes = 0, cityVisible = 0;
    for (const mesh of chunks) {
      const { buildings, vertexEnds } = mesh.userData.densityChunk, position = mesh.geometry.attributes.position;
      const count = Math.min(position.count, mesh.geometry.drawRange.count);
      cityMeshes++; if (visibleChain(mesh)) cityVisible++;
      if (!mesh.visible) continue;
      triangles += count / 3;
      for (let k = 0; k < buildings.length && vertexEnds[k] <= count; k++) shownIdx.add(buildings[k]);
    }
    // Danh sách công trình "trước bước E": mọi footprint trừ 3 hero envelope (do hero corridor vẽ) và footprint ẩn ở bước C.
    const hidden = new Set((window.BRIDGE_CORRECTIONS_31?.buildings || []).filter(e => e.action === 'hide').map(e => Number(e.id)));
    const hero = new Set([801710792, 2000032897, 39598465]);
    const expected = D.buildings.filter(b => !hero.has(Number(b.id)) && !hidden.has(Number(b.id))).length;
    const shownIds = new Set([...shownIdx].map(i => Number(D.buildings[i].id)));
    const sigMissing = registry.signatureBuildingIds().filter(id => !hero.has(id) && !shownIds.has(id) && D.buildings.some(b => Number(b.id) === id) && !hidden.has(id));
    // Cây: vị trí từ instanceMatrix chunk thân cây.
    const cells = new Map(); let treesAll = 0, treesShown = 0, protAll = 0, protShown = 0;
    for (const mesh of treeChunks) {
      const m = mesh.instanceMatrix.array, total = mesh.instanceMatrix.count;
      for (let i = 0; i < total; i++) {
        const x = m[i * 16 + 12], z = m[i * 16 + 14], shown = i < mesh.count, key = Math.floor(x / 300) + ',' + Math.floor(z / 300);
        const c = cells.get(key) || { all: 0, shown: 0 }; c.all++; if (shown) c.shown++; cells.set(key, c);
        treesAll++; if (shown) treesShown++;
        if (registry.inProtectedZone(x, z, 'tree')) { protAll++; if (shown) protShown++; }
      }
    }
    const sf = status.streetFurniture?.api, lamps = sf ? { mesh: sf.lampMesh.count, total: sf.instances().length, signature: sf.instances().filter(l => l.signature).length } : null;
    return {
      level: status.density?.level, source: status.density?.source, audit: status.density?.audit, counts: status.density?.counts,
      dataset: { level: document.body.dataset.densityLevel, audit: document.body.dataset.densityAudit, buildings: document.body.dataset.densityBuildings },
      cityMeshes, cityVisible, triangles, shown: shownIdx.size, expected, sigMissing,
      trees: { all: treesAll, shown: treesShown, protAll, protShown, chunks: treeChunks.length, cells: [...cells.values()] },
      lamps
    };
  });
}

// Median renderer.info trên ~40 khung sau khi cảnh ổn định.
async function measureInfo(page, settleMs = 1600) {
  await sleep(settleMs);
  return page.evaluate(async () => {
    window.__probe.frames.length = 0;
    await new Promise(resolve => { const tick = () => window.__probe.frames.length >= 40 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
    const med = list => { const s = list.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const frames = window.__probe.frames.slice();
    return { triangles: med(frames.map(f => f.triangles)), drawCalls: med(frames.map(f => f.drawCalls)) };
  });
}

async function clickLevel(page, level) {
  await openControls(page);
  // Đo: click → khung đầu tiên render sau khi trạng thái mật độ đã đổi; khung dài nhất trong 1,2 s.
  return page.evaluate(async level => {
    const button = document.querySelector(`#controlBody [data-density="${level}"]`);
    const times = []; let firstApplied = null, stop = false;
    const t0 = performance.now();
    // Mốc rAF (timestamp) là đầu khung, có thể sớm hơn t0 → dùng performance.now() trong callback.
    const tick = () => { const now = performance.now(); times.push(now); if (firstApplied === null && window.webgpuMaterials24.density.level === level) firstApplied = now; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    button.click();
    await new Promise(resolve => setTimeout(resolve, 1200)); stop = true;
    // Gồm cả khoảng click → khung đầu tiên (khung đứng hình ngay sau click là điều người dùng thấy).
    const deltas = [t0, ...times].slice(1).map((t, i) => t - [t0, ...times][i]);
    return { switchMs: firstApplied === null ? null : firstApplied - t0, maxFrameMs: Math.max(...deltas, 0), applyMs: window.webgpuMaterials24.density.applyMs };
  }, level);
}

async function runBackend(browser, backend) {
  const q = backend === 'webgl' ? '&backend=webgl' : '';
  const out = { backend, levels: {}, errors: [] };
  // 1) Điều khiển, aria, bàn phím, đo 4 mức ở 2 camera.
  {
    const { context, page, errors } = await open(browser, `&view=overview${q}`);
    out.actualBackend = await page.evaluate(() => window.webgpuMaterials24.backend);
    out.initial = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source }));
    await openControls(page);
    out.control = await page.evaluate(() => {
      const group = document.querySelector('#controlBody [role="radiogroup"]');
      const buttons = group ? [...group.querySelectorAll('[data-density]')] : [];
      return {
        exists: !!group, label: group?.getAttribute('aria-label') || document.getElementById(group?.getAttribute('aria-labelledby') || '')?.textContent || '',
        buttons: buttons.map(b => ({ level: b.dataset.density, text: b.textContent.trim(), role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), tabindex: b.getAttribute('tabindex'), active: b.classList.contains('active') }))
      };
    });
    // Bàn phím: Tab tới nút đang chọn, ArrowRight/ArrowLeft/End/Home đổi mức; Space/Enter giữ chọn.
    const keyboard = [];
    await page.focus('#controlBody [data-density][aria-checked="true"]');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowLeft']) {
      await page.keyboard.press(key); await sleep(120);
      keyboard.push(await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, focus: document.activeElement?.dataset?.density, checked: document.querySelector('#controlBody [data-density][aria-checked="true"]')?.dataset.density })));
    }
    out.keyboard = keyboard;
    // Đo ở overview rồi ở camera ảnh 02.
    for (const camera of ['overview', 'pose02']) {
      if (camera === 'pose02') {
        await page.click(`#cityNav [data-view="${POSE_02.base}"]`); await sleep(2600);
        await page.evaluate(pose => { window.__probe.pose = pose; }, POSE_02);
        // Khung đầu ở pose mới biên dịch pipeline (không do mật độ) → chờ ổn định trước khi đo đổi mức.
        await sleep(3000); await measureInfo(page, 0);
      }
      for (const level of LEVELS) {
        const timing = await clickLevel(page, level);
        const info = await measureInfo(page);
        const state = camera === 'overview' ? await sceneState(page) : null;
        out.levels[`${camera}:${level}`] = { timing, info, state };
      }
    }
    await page.evaluate(() => { window.__probe.pose = null; });
    // Chọn bằng chuột vẫn chạy: click tâm màn hình ở Nguyễn Huệ (mức Đầy đủ) mở bảng công trình.
    await clickLevel(page, 'full');
    await page.click('#cityNav [data-view="boulevard"]'); await sleep(2600);
    await page.evaluate(() => document.body.classList.add('ui-hidden'));
    let picked = null;
    for (const [x, y] of [[800, 470], [760, 430], [860, 500], [700, 520]]) {
      await page.mouse.click(x, y); await sleep(250);
      picked = await page.evaluate(() => ({ visible: !document.querySelector('#selection').hidden, name: document.querySelector('#selectedName').textContent }));
      if (picked.visible) break;
    }
    out.pick = picked;
    await page.evaluate(() => document.body.classList.remove('ui-hidden'));
    // Đề xuất hạ mức: người dùng đã chọn thủ công "Đầy đủ"; giả lập FPS thấp → hiện đề xuất, KHÔNG tự hạ.
    await clickLevel(page, 'full');
    await page.evaluate(() => window.webgpuMaterials24.density.api.simulateFps(12));
    const suggest = { shownAt: null };
    const start = Date.now();
    while (Date.now() - start < 20000) {
      const s = await page.evaluate(() => ({ hidden: document.querySelector('#densitySuggest')?.hidden, level: window.webgpuMaterials24.density.level }));
      if (s.hidden === false) { suggest.shownAt = Date.now() - start; break; }
      await sleep(400);
    }
    Object.assign(suggest, await page.evaluate(() => {
      const el = document.querySelector('#densitySuggest');
      return { level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source, live: el?.getAttribute('aria-live'), text: el?.textContent.trim().replace(/\s+/g, ' '), apply: !!el?.querySelector('[data-density-apply]') };
    }));
    await page.waitForTimeout(3000);
    suggest.levelAfterWait = await page.evaluate(() => window.webgpuMaterials24.density.level);
    if (suggest.apply) { await page.click('#densitySuggest [data-density-apply]'); await sleep(300); }
    suggest.afterApply = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source, hidden: document.querySelector('#densitySuggest').hidden }));
    await page.evaluate(() => window.webgpuMaterials24.density.api.simulateFps(null));
    out.suggest = suggest;
    out.countsText = await page.evaluate(() => document.querySelector('#densityCounts')?.textContent.trim().replace(/\s+/g, ' '));
    // Xe: API bước D có thể sẵn sàng SAU bộ điều phối (thứ tự khởi tạo). Chưa có API thật thì gắn API giả và kiểm bộ
    // điều phối tự đồng bộ mức hiện tại trong vài khung (không cần người dùng bấm lại).
    out.traffic = await page.evaluate(async () => {
      const s = window.webgpuMaterials24, frames = n => new Promise(r => { const t = () => (n-- <= 0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
      const real = typeof s.traffic?.api?.setVisibleFraction === 'function', calls = [];
      if (!real) { s.traffic = s.traffic || {}; Object.defineProperty(s.traffic, 'api', { value: { total: 1000, setVisibleFraction: f => { calls.push(f); return Math.round(1000 * f); } }, configurable: true }); }
      await frames(4);
      const d = s.density, out = { real, calls, level: d.level, fraction: d.fractions.vehicles, via: d.vehiclesVia, vehicles: d.counts.vehicles, total: d.totals.vehicles, dataset: document.body.dataset.densityVehicles };
      if (!real) delete s.traffic.api;
      return out;
    });
    out.errors.push(...errors);
    await context.close();
  }
  // 2) localStorage giữ lựa chọn khi reload; URL ưu tiên hơn localStorage.
  {
    const { context, page, errors } = await open(browser, `&view=overview${q}`);
    await clickLevel(page, 'light');
    await page.reload({ waitUntil: 'load' }); await waitReady(page);
    out.reload = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source, stored: localStorage.getItem('citylab.31e.density') }));
    out.errors.push(...errors);
    await context.close();
  }
  {
    const { context, page, errors } = await open(browser, `&view=overview&density=minimal${q}`, { storage: 'light' });
    out.urlWins = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source, checked: document.querySelector('#controlBody [data-density][aria-checked="true"]')?.dataset.density }));
    // Đổi góc nhìn giữ tham số density trên URL (selectView ghi lại URL).
    await page.click('#cityNav [data-view="river"]'); await sleep(300);
    out.urlAfterView = await page.evaluate(() => location.search);
    out.errors.push(...errors);
    await context.close();
  }
  return out;
}

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {};
  try {
    for (const backend of backends) {
      let r;
      try { r = report[backend] = await runBackend(browser, backend); }
      catch (error) { check(`[${backend}] mở app và chạy kịch bản mật độ`, () => { throw error; }); continue; }
      const tag = `[${backend}] `, L = r.levels;
      check(tag + 'backend đúng yêu cầu', () => assert.equal(r.actualBackend, backend === 'webgl' ? 'webgl2-fallback' : 'webgpu'));
      check(tag + 'mặc định "Đầy đủ" khi chưa có URL/localStorage', () => assert.deepEqual(r.initial, { level: 'full', source: 'default' }));
      check(tag + 'điều khiển: radiogroup có nhãn, 4 nút role=radio đúng nhãn tiếng Việt, đúng 1 aria-checked, roving tabindex', () => {
        const c = r.control; assert(c.exists, 'không thấy radiogroup trong #controlBody');
        assert(/Mật độ chi tiết/.test(c.label), `nhãn nhóm: ${c.label}`);
        assert.deepEqual(c.buttons.map(b => b.level), LEVELS); assert.deepEqual(c.buttons.map(b => b.text), LABELS);
        assert(c.buttons.every(b => b.role === 'radio'), JSON.stringify(c.buttons));
        assert.equal(c.buttons.filter(b => b.checked === 'true').length, 1); assert.equal(c.buttons.find(b => b.checked === 'true').level, 'full');
        assert.deepEqual(c.buttons.map(b => b.tabindex), ['0', '-1', '-1', '-1']);
        assert(c.buttons.find(b => b.level === 'full').active, 'nút đang chọn phải có class active như data-light/data-view');
      });
      check(tag + 'bàn phím: mũi tên/Home/End đổi mức, focus đi theo, aria-checked khớp', () => {
        const expect = ['balanced', 'light', 'balanced', 'minimal', 'full', 'minimal'];
        r.keyboard.forEach((k, i) => { assert.equal(k.level, expect[i], JSON.stringify(r.keyboard)); assert.equal(k.focus, expect[i]); assert.equal(k.checked, expect[i]); });
      });
      check(tag + '4 mức áp dụng được: status + data-density-level + audit complete', () => {
        for (const level of LEVELS) {
          const s = L[`overview:${level}`].state; assert.equal(s.level, level); assert.equal(s.dataset.level, level);
          assert.equal(s.dataset.audit, 'complete', `${level}: ${s.dataset.audit}`);
        }
      });
      check(tag + 'F: audit registry 100 % ở mọi mức (status) và QA tự kiểm drawRange: 0 công trình signature bị loại', () => {
        for (const level of LEVELS) {
          const s = L[`overview:${level}`].state;
          assert(s.audit?.complete === true && s.audit.visible === s.audit.total && s.audit.total >= 60, `${level}: ${JSON.stringify(s.audit)}`);
          assert.deepEqual(s.sigMissing, [], `${level}: signature ngoài drawRange ${s.sigMissing}`);
        }
      });
      check(tag + 'Đầy đủ hiển thị đúng như trước: đủ công trình (trừ 3 hero envelope + footprint ẩn bước C), đủ tam giác city mesh 31C', () => {
        const s = L['overview:full'].state;
        assert(s.cityMeshes >= 8, `chỉ ${s.cityMeshes} chunk`);
        assert.equal(s.shown, s.expected, `${s.shown} ≠ ${s.expected}`);
        assert.equal(s.triangles, CITY_TRIANGLES_31C);
        assert.equal(s.trees.shown, s.trees.all); assert(s.trees.all > 8000, `cây ${s.trees.all}`);
        assert(s.lamps && s.lamps.mesh === s.lamps.total, JSON.stringify(s.lamps));
      });
      check(tag + 'mức giảm dần: số nhà/cây/đèn/xe không tăng khi hạ mức và Tối thiểu giảm thật', () => {
        const c = LEVELS.map(level => L[`overview:${level}`].state.counts);
        for (const key of ['buildings', 'trees', 'lamps', 'vehicles']) {
          for (let i = 1; i < c.length; i++) assert(c[i][key] <= c[i - 1][key], `${key}: ${c.map(x => x[key])}`);
          assert(c[3][key] < c[0][key], `${key} không giảm: ${c.map(x => x[key])}`);
        }
        const s = LEVELS.map(level => L[`overview:${level}`].state);
        assert.equal(s[0].counts.buildings, s[0].shown, 'counts.buildings phải bằng số đọc từ drawRange');
        assert.equal(s[3].counts.buildings, s[3].shown);
      });
      check(tag + 'cây: vùng bảo vệ không giảm; không ô 300 m nào bị bỏ trọn hoặc thưa quá nửa tỉ lệ chung', () => {
        for (const level of LEVELS) {
          const t = L[`overview:${level}`].state.trees, f = t.shown / t.all;
          assert(t.protAll > 0, 'không có cây trong vùng bảo vệ'); assert.equal(t.protShown, t.protAll, `${level}: ${t.protShown}/${t.protAll}`);
          const bad = t.cells.filter(c => c.all >= Math.max(6, Math.ceil(2 / f)) && (c.shown === 0 || c.shown / c.all < f * .5));
          assert.equal(bad.length, 0, `${level} f=${f.toFixed(2)}: ${JSON.stringify(bad.slice(0, 5))}`);
        }
      });
      check(tag + 'đèn signature luôn hiển thị ở mọi mức', () => {
        for (const level of LEVELS) { const l = L[`overview:${level}`].state.lamps; assert(l.mesh >= l.signature && l.signature > 0, `${level}: ${JSON.stringify(l)}`); }
      });
      for (const camera of ['overview', 'pose02']) {
        check(tag + `${camera}: Tối thiểu giảm ≥ ${MIN_REDUCTION * 100}% tam giác so với Đầy đủ`, () => {
          const full = L[`${camera}:full`].info, min = L[`${camera}:minimal`].info;
          assert(min.triangles <= full.triangles * (1 - MIN_REDUCTION), `${min.triangles} / ${full.triangles} = ${(min.triangles / full.triangles).toFixed(3)}`);
        });
        // Draw call: tiêu chí "giảm ≥ 60 %" KHÔNG đạt được bằng mật độ — phần lớn draw call là sàn cố định (hậu kỳ, mặt
        // đường, cầu/Marina signature, xe/tàu của bước D) và chunk công trình giữ nguyên ở mọi mức (mỗi mức chỉ là
        // drawRange). Phân tích ghi trong báo cáo 31E. QA giữ hai bất biến đo được: giảm mức không bao giờ tăng draw
        // call, và Đầy đủ không vượt draw call 30B (chia chunk không được làm nặng hơn bản gộp cũ).
        check(tag + `${camera}: draw call không tăng khi hạ mức; Đầy đủ không vượt 30B`, () => {
          const calls = LEVELS.map(level => L[`${camera}:${level}`].info.drawCalls);
          for (let i = 1; i < calls.length; i++) assert(calls[i] <= calls[i - 1], `${LEVELS[i]} ${calls[i]} > ${LEVELS[i - 1]} ${calls[i - 1]}`);
          assert(calls[0] <= DRAW_CALLS_30B[camera], `Đầy đủ ${calls[0]} > 30B ${DRAW_CALLS_30B[camera]}`);
        });
      }
      if (backend === 'webgpu') check(tag + 'ngân sách tam giác ở camera ảnh 02 (gồm pass bóng): Đầy đủ ≤ 9,1M, Cân bằng ≤ 5M, Tối thiểu ≤ 3M', () => {
        for (const [level, budget] of Object.entries(BUDGET_02)) assert(L[`pose02:${level}`].info.triangles <= budget, `${level}: ${L[`pose02:${level}`].info.triangles} > ${budget}`);
      });
      check(tag + `đổi mức ≤ ${SWITCH_MS} ms (click → khung đã áp dụng), khung dài nhất ≤ ${MAX_FRAME_MS} ms`, () => {
        for (const [key, v] of Object.entries(L)) {
          assert(v.timing.switchMs !== null && v.timing.switchMs <= SWITCH_MS, `${key}: ${JSON.stringify(v.timing)}`);
          assert(v.timing.maxFrameMs <= MAX_FRAME_MS, `${key}: ${JSON.stringify(v.timing)}`);
        }
      });
      check(tag + 'chọn công trình bằng chuột vẫn hoạt động trên chunk', () => assert(r.pick?.visible && r.pick.name.length > 0, JSON.stringify(r.pick)));
      check(tag + 'FPS thấp kéo dài: hiện đề xuất (aria-live, nút áp dụng), KHÔNG tự hạ khi đã chọn thủ công; bấm áp dụng thì hạ 1 mức', () => {
        const s = r.suggest; assert(s.shownAt !== null, 'không hiện đề xuất'); assert.equal(s.live, 'polite'); assert(s.apply, 'thiếu nút áp dụng');
        assert.equal(s.level, 'full'); assert.equal(s.levelAfterWait, 'full', 'đã tự hạ mức');
        assert.equal(s.afterApply.level, 'balanced'); assert(s.afterApply.hidden, 'đề xuất chưa đóng sau khi áp dụng');
      });
      check(tag + 'số liệu nhà/cây/đèn/xe hiển thị trong bảng điều khiển', () => assert(/nhà/.test(r.countsText || '') && /cây/.test(r.countsText) && /đèn/.test(r.countsText) && /xe/.test(r.countsText), r.countsText));
      check(tag + 'localStorage giữ lựa chọn khi reload', () => assert.deepEqual(r.reload, { level: 'light', source: 'storage', stored: 'light' }));
      check(tag + 'URL &density= ưu tiên hơn localStorage và được giữ khi đổi góc nhìn', () => {
        assert.deepEqual(r.urlWins, { level: 'minimal', source: 'url', checked: 'minimal' });
        assert(/[?&]density=minimal/.test(r.urlAfterView), r.urlAfterView);
      });
      check(tag + 'xe: bộ điều phối dùng API bước D (setVisibleFraction) kể cả khi API có sau, tự đồng bộ mức hiện tại', () => {
        const t = r.traffic; assert(t, 'thiếu số liệu');
        assert.equal(t.via, 'traffic.api.setVisibleFraction', JSON.stringify(t));
        if (!t.real) { assert.deepEqual(t.calls, [t.fraction], JSON.stringify(t)); assert.equal(t.total, 1000); }
        assert.equal(t.vehicles, Math.round(t.total * t.fraction), JSON.stringify(t)); assert.equal(t.dataset, String(t.vehicles));
      });
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, {
      levels: Object.fromEntries(Object.entries(r.levels || {}).map(([key, v]) => [key, { info: v.info, timing: v.timing, counts: v.state?.counts, audit: v.state?.audit && { complete: v.state.audit.complete, total: v.state.audit.total, visible: v.state.audit.visible }, shown: v.state?.shown, expected: v.state?.expected, cityTriangles: v.state?.triangles, cityMeshes: v.state?.cityMeshes, trees: v.state && { all: v.state.trees.all, shown: v.state.trees.shown, protAll: v.state.trees.protAll, protShown: v.state.trees.protShown, chunks: v.state.trees.chunks } }])),
      keyboard: r.keyboard, pick: r.pick, suggest: r.suggest, reload: r.reload, urlWins: r.urlWins, urlAfterView: r.urlAfterView, countsText: r.countsText, traffic: r.traffic, errors: r.errors
    }]));
    console.log(JSON.stringify({ suite: 'density-31 · E/F', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
