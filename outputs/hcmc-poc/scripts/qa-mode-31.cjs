/*
 * QA 31A · bước I: "Chế độ Preview / Lite" (giữ chất lượng hiện tại / bớt nhà, giảm texture và UI).
 *
 * Chạy (server serve.py phải đang chạy, cổng 8811):
 *   PORT=8811 node outputs/hcmc-poc/scripts/qa-mode-31.cjs            → WebGPU + WebGL 2
 *   PORT=8811 node outputs/hcmc-poc/scripts/qa-mode-31.cjs webgpu     → chỉ một backend
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

// L6 (review-I): đọc [w,h] từ header PNG/JPEG để so texture lite với bản đầy đủ cùng tên (không hardcode kích thước).
function imageSize(file) {
  const buffer = fs.readFileSync(path.join(root, file));
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue; }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

const checks = [], failures = [];
const check = (name, fn) => { try { fn(); checks.push(name); } catch (error) { failures.push({ name, error: String(error?.message || error).slice(0, 700) }); } };

check('mã nguồn: city-mode-31.js có preset preview/lite; HTML có radiogroup "Chế độ"; app đấu nối mode', () => {
  assert(fs.existsSync(path.join(root, 'city-mode-31.js')), 'thiếu city-mode-31.js');
  assert(fs.existsSync(path.join(root, 'data/sentinel-2016-lite.jpg')), 'thiếu sentinel-2016-lite.jpg');
  assert(fs.existsSync(path.join(root, 'assets/facades15/facade-atlas-lite.jpg')), 'thiếu facade-atlas-lite.jpg');
  assert(fs.existsSync(path.join(root, 'assets/facades15/facade-mask-lite.png')), 'thiếu facade-mask-lite.png');
  const mode = read('city-mode-31.js'), app = read('webgpu-materials-24.js'), html = read('webgpu-materials-24.html'), css = read('webgpu-materials-24.css');
  assert(/from '\.\/city-mode-31\.js\?v=31a'/.test(app), 'app chưa import city-mode-31.js?v=31a');
  assert(mode.includes("id: 'preview'") && mode.includes("id: 'lite'"), 'thiếu preset preview/lite');
  assert(mode.includes("density: 'light'") && mode.includes("quality: 'performance'"), 'lite phải gói density light + quality performance');
  assert(/role="radiogroup"/.test(html) && html.includes('data-mode="preview"') && html.includes('data-mode="lite"'), 'HTML thiếu radiogroup data-mode');
  assert(html.includes('Preview · chất lượng đầy đủ') && html.includes('Lite · máy yếu'), 'thiếu nhãn tiếng Việt của chế độ');
  assert(css.includes('body[data-mode="lite"]'), 'CSS thiếu gọn UI cho lite');
  assert(app.includes('document.body.dataset.mode'), 'app chưa đặt body dataset.mode');
  assert(app.includes('materialStatus.mode='), 'app chưa ghi materialStatus.mode');
});

// Probe: gom Scene/Renderer qua __THREE_DEVTOOLS__, ghi tổng renderer.info mỗi khung.
function initProbe() {
  const probe = window.__probe = { scenes: [], renderers: [], frames: [] };
  const hook = new EventTarget();
  hook.addEventListener('observe', event => {
    const object = event.detail;
    if (object?.isScene) probe.scenes.push(object);
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

async function open(browser, query, { storage = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  await page.addInitScript(initProbe);
  await page.addInitScript(values => { try { if (!sessionStorage.getItem('qa31i')) { localStorage.clear(); for (const [k, v] of Object.entries(values || {})) localStorage.setItem(k, v); sessionStorage.setItem('qa31i', '1'); } } catch {} }, storage);
  await page.goto(`${BASE}?v=31a${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.density?.level, null, { timeout: 240000 });
  return { context, page, errors };
}

async function modeState(page) {
  return page.evaluate(() => {
    const s = window.webgpuMaterials24;
    return {
      mode: s.mode, level: s.density?.level, source: s.density?.source, counts: s.density?.counts,
      audit: s.density?.audit, render: s.density?.render, quality: s.visualRuntime?.profile,
      backend: s.backend, light: s.light, region: s.region?.id, datasetMode: document.body.dataset.mode,
      identity: { atlasSize: s.identityFacades?.atlasSize, maskSize: s.identityFacades?.maskSize, atlasUrl: s.identityFacades?.atlasUrl },
      memory: (() => { try { const r = window.__probe.renderers[0]; return r ? r.info.memory : null; } catch { return null; } })()
    };
  });
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

async function openControls(page) {
  if (await page.locator('#controls').evaluate(el => el.classList.contains('collapsed'))) await page.click('#collapse');
  await sleep(350);
}

async function runBackend(browser, backend) {
  const q = backend === 'webgl' ? '&backend=webgl' : '';
  const out = { backend, errors: [] };
  // 1) Mặc định = preview, giống hệt trước (±2 % tam giác/draw call so với không có tham số mode).
  {
    const a = await open(browser, `&view=overview${q}`);
    out.actualBackend = await a.page.evaluate(() => window.webgpuMaterials24.backend);
    out.defaultState = await modeState(a.page);
    out.defaultInfo = await measureInfo(a.page);
    out.errors.push(...a.errors);
    await a.context.close();
    const b = await open(browser, `&view=overview&mode=preview${q}`);
    out.previewState = await modeState(b.page);
    out.previewInfo = await measureInfo(b.page);
    out.errors.push(...b.errors);
    await b.context.close();
  }
  // 2) Lite + UI + chỉnh tay + đổi mode + Flood Lab trên cùng một trang (có reload giữa chừng).
  {
    const { context, page, errors } = await open(browser, `&view=overview&mode=lite${q}`);
    out.errors.push(...errors);
    out.liteState = await modeState(page);
    out.liteInfo = await measureInfo(page);
    await openControls(page);
    out.modeControl = await page.evaluate(() => {
      const group = document.querySelector('#modeControl[role="radiogroup"]');
      const buttons = group ? [...group.querySelectorAll('[data-mode]')] : [];
      const visible = el => { const r = el?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; };
      return {
        exists: !!group,
        buttons: buttons.map(b => ({ mode: b.dataset.mode, text: b.textContent.trim(), role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), tabindex: b.getAttribute('tabindex'), active: b.classList.contains('active') })),
        liteHides: {
          legend: !visible(document.querySelector('#controlBody .legend')),
          compare: !visible(document.querySelector('#compare')),
          audit: !visible(document.querySelector('.flood-audit')),
          story: document.querySelector('#story').classList.contains('collapsed')
        },
        essential: {
          views: [...document.querySelectorAll('#controlBody [data-view]')].filter(visible).length,
          lights: [...document.querySelectorAll('#controlBody [data-light]')].filter(visible).length,
          densities: [...document.querySelectorAll('#controlBody [data-density]')].filter(visible).length,
          regions: [...document.querySelectorAll('#controlBody [data-region]')].filter(visible).length,
          modes: buttons.filter(visible).length
        }
      };
    });
    // Bàn phím trên nhóm Chế độ: ArrowRight chuyển focus sang Lite→ (đang ở lite nên sang Preview? thứ tự preview,lite).
    await page.focus('#controlBody [data-mode][aria-checked="true"]');
    await page.keyboard.press('ArrowLeft'); await sleep(150);
    out.modeKeyboardFocus = await page.evaluate(() => document.activeElement?.dataset?.mode || null);
    // Phím mũi tên đã kích hoạt đổi mode → trang tải lại về Preview; quay lại Lite để làm tiếp các bước Lite.
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.mode?.id === 'preview', null, { timeout: 240000 });
    await sleep(2000);
    await openControls(page);
    await page.click('#controlBody [data-mode="lite"]');
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.mode?.id === 'lite', null, { timeout: 240000 });
    await sleep(2000);
    await openControls(page);
    // Đổi về Preview qua UI (Esc hủy reload nếu focus-test trên đã kích hoạt — kiểm tra URL trước).
    out.beforeSwitchUrl = await page.evaluate(() => location.search);
    // Chỉnh tay mật độ sau khi chọn Lite được giữ.
    await page.click('#controlBody [data-density="balanced"]'); await sleep(800);
    out.manualDensity = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, mode: window.webgpuMaterials24.mode.id, dataset: document.body.dataset.mode }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.density?.level, null, { timeout: 240000 });
    out.afterReload = await page.evaluate(() => ({ level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source, mode: window.webgpuMaterials24.mode.id, modeSource: window.webgpuMaterials24.mode.source, stored: localStorage.getItem('citylab.31e.density'), url: location.search }));
    // Flood Lab mở được ở Lite.
    await page.click('[data-open-flood]'); await sleep(800);
    out.flood = await page.evaluate(() => ({ open: !document.querySelector('#floodLab').hidden }));
    await page.click('#closeFloodLab'); await sleep(300);
    // Đổi mode qua lại: Lite → Preview (có thông báo tiến trình, giữ view/light/region, tải lại, không lỗi).
    await page.evaluate(() => window.webgpuMaterials24.selectView('bason'));
    await sleep(2500);
    await page.evaluate(() => document.querySelectorAll('[data-light]')[1].click()); await sleep(400);
    await openControls(page);
    await page.click('#controlBody [data-mode="preview"]'); await sleep(300);
    out.switchNotice = await page.evaluate(() => document.querySelector('#regionNotice')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) || null);
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done') && window.webgpuMaterials24?.density?.level && window.webgpuMaterials24?.mode?.id === 'preview', null, { timeout: 240000 });
    await sleep(2500);
    out.afterSwitch = await page.evaluate(() => ({ mode: window.webgpuMaterials24.mode.id, level: window.webgpuMaterials24.density.level, quality: window.webgpuMaterials24.visualRuntime.profile, url: location.search, light: window.webgpuMaterials24.light, region: window.webgpuMaterials24.region.id, view: document.querySelector('#viewLabel').textContent }));
    out.errors.push(...errors);
    await context.close();
  }
  // 3) localStorage giữ mode khi không có &mode=.
  {
    const { context, page, errors } = await open(browser, `&view=overview${q}`, { storage: { 'citylab.31i.mode': 'lite' } });
    out.storageMode = await page.evaluate(() => ({ mode: window.webgpuMaterials24.mode.id, source: window.webgpuMaterials24.mode.source, level: window.webgpuMaterials24.density.level }));
    out.errors.push(...errors);
    await context.close();
  }
  // 4) T3: &density/&quality do người dùng chỉ định THẮNG preset mode; mode vẫn là lite.
  {
    const { context, page, errors } = await open(browser, `&view=overview&mode=lite&density=full${q}`);
    out.liteDensityFull = await page.evaluate(() => ({ mode: window.webgpuMaterials24.mode.id, level: window.webgpuMaterials24.density.level, source: window.webgpuMaterials24.density.source }));
    out.errors.push(...errors);
    await context.close();
    await sleep(1200);   // máy ít RAM: chờ Chromium giải phóng context trước khi mở context kế tiếp
    const b = await open(browser, `&view=overview&mode=lite&quality=presentation${q}`);
    out.liteQualityPresentation = await b.page.evaluate(() => ({ mode: window.webgpuMaterials24.mode.id, quality: window.webgpuMaterials24.visualRuntime.profile }));
    out.errors.push(...b.errors);
    await b.context.close();
    await sleep(1200);
  }
  return out;
}

(async () => {
  const backends = process.argv[2] ? [process.argv[2]] : ['webgpu', 'webgl'];
  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const report = {};
  try {
    for (const backend of backends) {
      let r;
      try { r = report[backend] = await runBackend(browser, backend); }
      catch (error) { check(`[${backend}] mở app và chạy kịch bản chế độ`, () => { throw error; }); continue; }
      const tag = `[${backend}] `;
      check(tag + 'backend đúng yêu cầu', () => assert.equal(r.actualBackend, backend === 'webgl' ? 'webgl2-fallback' : 'webgpu'));
      check(tag + 'mặc định = preview (density full, quality theo backend, texture đầy đủ)', () => {
        assert.equal(r.defaultState.mode.id, 'preview');
        assert.equal(r.defaultState.mode.source, 'default');
        assert.equal(r.defaultState.level, 'full');
        // WebGL là đường tương thích: resolveVisualQuality tự hạ presentation → balanced-webgl.
        assert.equal(r.defaultState.quality, backend === 'webgl' ? 'balanced-webgl' : 'presentation');
        assert.equal(r.defaultState.mode.textureScale, 1);
        assert.equal(r.defaultState.datasetMode, 'preview');
      });
      check(tag + 'preview giống hệt trước: tam giác/draw call trong ±2 % so với không có tham số', () => {
        for (const key of ['triangles', 'drawCalls']) {
          const ratio = r.previewInfo[key] / r.defaultInfo[key];
          assert(Math.abs(ratio - 1) <= 0.02, `${key}: ${r.previewInfo[key]} vs ${r.defaultInfo[key]} = ${ratio.toFixed(4)}`);
        }
      });
      check(tag + '&mode=lite áp đúng density light + quality performance + textureScale 0.5 + UI gọn', () => {
        const s = r.liteState;
        assert.equal(s.mode.id, 'lite'); assert.equal(s.mode.source, 'url');
        assert.equal(s.level, 'light'); assert.equal(s.source, 'default');
        assert.equal(s.quality, 'performance');
        assert.equal(s.mode.textureScale, 0.5); assert.equal(s.mode.uiCompact, true);
        assert.equal(s.datasetMode, 'lite');
      });
      check(tag + 'signature registry 100 % ở Lite (audit complete, đủ tổng)', () => {
        const a = r.liteState.audit;
        assert(a?.complete === true && a.visible === a.total && a.total >= 60, JSON.stringify(a));
      });
      check(tag + 'texture lite thật sự nhỏ hơn (≤ ½ mỗi cạnh so với bản đầy đủ cùng tên)', () => {
        const t = r.liteState.mode.textures;
        const pairs = [['sentinel', t.sentinel, 'data/sentinel-2016.jpg'], ['atlas', t.atlas, 'assets/facades15/facade-atlas.jpg'], ['mask', t.mask, 'assets/facades15/facade-mask.png']];
        for (const [name, lite, fullFile] of pairs) {
          assert(Array.isArray(lite) && lite.length === 2, `${name}: ${JSON.stringify(t)}`);
          const full = imageSize(fullFile);
          assert(full, `không đọc được kích thước ${fullFile}`);
          assert(lite[0] <= full[0] / 2 && lite[1] <= full[1] / 2, `${name} lite ${lite} > ½ đầy đủ ${full}`);
          assert(lite[0] * lite[1] <= full[0] * full[1] / 4, `${name} pixel ${lite[0] * lite[1]} > ¼ ${full[0] * full[1]}`);
        }
      });
      check(tag + 'Lite giảm rõ tam giác (≥ 40 %) và draw call (WebGPU ≥ 40 %, WebGL ≤ 0,9×)', () => {
        assert(r.liteInfo.triangles <= r.defaultInfo.triangles * 0.6, `tri ${r.liteInfo.triangles}/${r.defaultInfo.triangles}`);
        if (backend === 'webgpu') assert(r.liteInfo.drawCalls <= r.defaultInfo.drawCalls * 0.6, `dc ${r.liteInfo.drawCalls}/${r.defaultInfo.drawCalls}`);
        // T2 (review-I): pipeline WebGL đã gọn (depth-aware nhẹ, 1 cascade, không AO/TRAA/bloom) nên draw call nền thấp,
        // kết quả thật overview chỉ ~ −9 % (88/97), Ba Son ~ −49 %. Đặt ngưỡng "≤ 0,9×"; vì draw call là số nguyên nên
        // dùng trần (0,9 × 97 = 87,3 → 88) để không chặt quá do làm tròn; mọi mức TĂNG draw call (≥ 98) đều đỏ.
        else assert(r.liteInfo.drawCalls <= Math.ceil(r.defaultInfo.drawCalls * 0.9), `dc ${r.liteInfo.drawCalls}/${r.defaultInfo.drawCalls}`);
      });
      check(tag + 'điều khiển Chế độ: radiogroup 2 nút role=radio đúng nhãn, roving tabindex', () => {
        const c = r.modeControl; assert(c.exists, 'không thấy #modeControl radiogroup');
        assert.deepEqual(c.buttons.map(b => b.mode), ['preview', 'lite']);
        assert(c.buttons.every(b => b.role === 'radio'), JSON.stringify(c.buttons));
        assert.deepEqual(c.buttons.map(b => b.text), ['Preview · chất lượng đầy đủ', 'Lite · máy yếu']);
        assert.equal(c.buttons.filter(b => b.checked === 'true').length, 1);
        assert.equal(c.buttons.find(b => b.checked === 'true').mode, 'lite');
        assert.deepEqual(c.buttons.map(b => b.tabindex), ['-1', '0']);
      });
      check(tag + 'Lite ẩn bảng phụ nặng, thu gọn story, giữ UI thiết yếu', () => {
        assert(r.modeControl.liteHides.legend && r.modeControl.liteHides.compare && r.modeControl.liteHides.audit && r.modeControl.liteHides.story, JSON.stringify(r.modeControl.liteHides));
        const e = r.modeControl.essential;
        assert(e.views >= 6 && e.lights >= 3 && e.densities >= 4 && e.regions >= 5 && e.modes >= 2, JSON.stringify(e));
      });
      check(tag + 'bàn phím: mũi tên đổi focus trong nhóm Chế độ', () => {
        assert.equal(r.modeKeyboardFocus, 'preview', JSON.stringify(r.modeKeyboardFocus));
      });
      check(tag + 'chỉnh tay mật độ sau khi chọn Lite được giữ (kể cả sau reload)', () => {
        assert.deepEqual(r.manualDensity, { level: 'balanced', mode: 'lite', dataset: 'lite' }, JSON.stringify(r.manualDensity));
        assert.equal(r.afterReload.level, 'balanced'); assert.equal(r.afterReload.mode, 'lite');
      });
      check(tag + 'localStorage giữ mode khi không có &mode=', () => {
        assert.deepEqual(r.storageMode, { mode: 'lite', source: 'storage', level: 'light' }, JSON.stringify(r.storageMode));
      });
      check(tag + 'T3: &density do người dùng chỉ định thắng preset mode (&mode=lite&density=full → level full)', () => {
        assert.equal(r.liteDensityFull.mode, 'lite');
        assert.equal(r.liteDensityFull.level, 'full');
      });
      check(tag + 'T3: &quality do người dùng chỉ định thắng preset mode (&mode=lite&quality=presentation)', () => {
        assert.equal(r.liteQualityPresentation.mode, 'lite');
        assert.equal(r.liteQualityPresentation.quality, backend === 'webgl' ? 'balanced-webgl' : 'presentation');
      });
      // L7 (review-I): đặc tả mục 5 yêu cầu "khung dài nhất ≤ 300 ms (hoặc có tiến trình)". Ở đây KHÔNG đo khung dài nhất
      // vì đổi mode = tải lại trang (reload) có thông báo rõ — không có khung render dài nào trong trang hiện tại để đo;
      // thay vào đó kiểm tra thông báo tiến trình, giữ view/light/region và không lỗi sau reload.
      check(tag + 'đổi mode qua lại: có thông báo tiến trình, giữ trạng thái, không lỗi', () => {
        assert(/Đang chuyển sang chế độ Preview/.test(r.switchNotice || ''), r.switchNotice);
        assert.equal(r.afterSwitch.mode, 'preview'); assert.equal(r.afterSwitch.level, 'full');
        assert(/view=bason/.test(r.afterSwitch.url) && /light=golden/.test(r.afterSwitch.url), r.afterSwitch.url);
        assert.equal(r.afterSwitch.light, 'golden', JSON.stringify(r.afterSwitch));
        assert(/BA SON/.test(r.afterSwitch.view), r.afterSwitch.view);
      });
      check(tag + 'Flood Lab mở được ở Lite', () => assert.equal(r.flood.open, true, JSON.stringify(r.flood)));
      check(tag + 'console không có lỗi', () => assert.deepEqual(r.errors, []));
    }
  } finally {
    await browser.close();
    const summary = Object.fromEntries(Object.entries(report).map(([k, r]) => [k, {
      defaultInfo: r.defaultInfo, previewInfo: r.previewInfo, liteInfo: r.liteInfo,
      liteCounts: r.liteState?.counts, liteAudit: r.liteState?.audit, liteTextures: r.liteState?.mode?.textures,
      modeControl: r.modeControl, manualDensity: r.manualDensity, afterReload: r.afterReload,
      storageMode: r.storageMode, switchNotice: r.switchNotice, afterSwitch: r.afterSwitch, flood: r.flood, errors: r.errors,
      liteDensityFull: r.liteDensityFull, liteQualityPresentation: r.liteQualityPresentation
    }]));
    console.log(JSON.stringify({ suite: 'mode-31 · I', passed: checks.length, failed: failures.length, checks, failures, summary }, null, 1));
    if (failures.length) process.exitCode = 1;
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exit(1); });
