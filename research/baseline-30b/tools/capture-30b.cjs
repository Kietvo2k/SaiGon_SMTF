/*
 * Harness baseline 30B (chỉ đo, không sửa app).
 *
 * - Dùng Playwright có sẵn trong máy (gói @playwright/mcp toàn cục) và Chromium 1243 đã tải.
 * - Lộ scene/camera qua hook chính thức của three.js: window.__THREE_DEVTOOLS__ (Scene và
 *   WebGPURenderer phát sự kiện 'observe' trong constructor). Không chặn/sửa file JS của app.
 * - Đặt pose camera tuỳ ý bằng scene.onBeforeRender (chỉ áp cho PerspectiveCamera near=3 của app).
 *
 * Cách chạy (server serve.py phải đang chạy ở cổng 8768):
 *   node research/baseline-30b/tools/capture-30b.cjs baseline
 *   node research/baseline-30b/tools/capture-30b.cjs issues
 *   node research/baseline-30b/tools/capture-30b.cjs probe '{"base":"bason","pose":{"position":[x,y,z],"target":[x,y,z]},"out":"probe.png"}'
 * Biến môi trường: PW_MODULE (đường dẫn playwright), PW_CHROME (chrome.exe), CITY_URL (gốc URL).
 */
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.CITY_URL || 'http://127.0.0.1:8768/hcmc-poc/webgpu-materials-24.html';
const OUT = path.resolve(__dirname, '..');
const VIEWPORT = { width: 1600, height: 900 };
const { chromium } = require(PW);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Chạy trong trang trước mọi module: gom Scene/Renderer, camera chính, thống kê theo pass.
function initProbe() {
  const probe = window.__probe = { scenes: [], renderers: [], camera: null, pose: null, frames: [], current: null, mainScene: null };
  const hook = new EventTarget();
  hook.addEventListener('observe', event => {
    const object = event.detail;
    if (object?.isScene) {
      probe.scenes.push(object);
      object.onBeforeRender = (renderer, scene, camera) => {
        const info = renderer.info.render;
        if (!probe.current) probe.current = { passes: [] };
        const isMain = camera.isPerspectiveCamera && camera.near === 3;
        if (isMain) {
          probe.camera = camera; probe.mainScene = object;
          if (probe.pose) {
            camera.position.fromArray(probe.pose.position);
            if (probe.pose.fov && camera.fov !== probe.pose.fov) { camera.fov = probe.pose.fov; camera.updateProjectionMatrix(); }
            camera.lookAt(probe.pose.target[0], probe.pose.target[1], probe.pose.target[2]);
            camera.updateMatrixWorld(true);
          }
        }
        // Bóng đổ được render lồng bên trong pass chính (shadow node updateBefore), nên dùng ngăn xếp
        // before/after để tách phần "tự thân" của từng pass khỏi các pass con lồng bên trong.
        const pass = { kind: isMain ? 'main' : camera.isOrthographicCamera ? 'shadow-ortho' : 'other', tris0: info.triangles, draws0: info.drawCalls, childTris: 0, childDraws: 0, sceneMain: object === probe.mainScene };
        probe.current.passes.push(pass); (probe.current.stack = probe.current.stack || []).push(pass);
      };
      object.onAfterRender = (renderer) => {
        const info = renderer.info.render, frame = probe.current, pass = frame?.stack?.pop();
        if (!pass) return;
        const tris = info.triangles - pass.tris0, draws = info.drawCalls - pass.draws0;
        pass.tris = tris - pass.childTris; pass.draws = draws - pass.childDraws;
        const parent = frame.stack[frame.stack.length - 1];
        if (parent) { parent.childTris += tris; parent.childDraws += draws; }
      };
    }
    if (object?.isWebGPURenderer || object?.isRenderer) {
      probe.renderers.push(object);
      const info = object.info;
      const reset = info.reset.bind(info);
      info.reset = () => {
        const frame = probe.current;
        if (frame && frame.passes.length) {
          const total = info.render.triangles, draws = info.render.drawCalls;
          frame.triangles = total; frame.drawCalls = draws; frame.frameCalls = info.render.frameCalls;
          frame.t = performance.now();
          probe.frames.push(frame); if (probe.frames.length > 240) probe.frames.shift();
          probe.current = null;
        }
        reset();
      };
    }
  });
  window.__THREE_DEVTOOLS__ = hook;
}

async function newSession(browser, url, log) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text().slice(0, 400) }); });
  page.on('pageerror', error => consoleMessages.push({ type: 'pageerror', text: String(error).slice(0, 400) }));
  page.on('requestfailed', request => consoleMessages.push({ type: 'requestfailed', text: request.url() }));
  await page.addInitScript(initProbe);
  // Không giữ trạng thái panel của phiên trước.
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready' && document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 180000 });
  const loadMs = Date.now() - started;
  log(`  ready sau ${loadMs} ms`);
  return { context, page, consoleMessages, loadMs };
}

async function waitCameraStable(page, timeout = 15000) {
  const start = Date.now(); let last = null, stableSince = Date.now();
  while (Date.now() - start < timeout) {
    const position = await page.evaluate(() => window.__probe.camera ? window.__probe.camera.position.toArray() : null);
    if (position && last && Math.hypot(position[0] - last[0], position[1] - last[1], position[2] - last[2]) > 0.05) stableSince = Date.now();
    last = position;
    if (Date.now() - stableSince > 1200) return true;
    await sleep(200);
  }
  return false;
}

// Đo FPS bằng rAF trong 5 s + gom thống kê renderer.info theo khung hình.
async function measure(page, seconds = 5) {
  return page.evaluate(async seconds => {
    const times = [];
    window.__probe.frames.length = 0;
    await new Promise(resolve => {
      const start = performance.now();
      const tick = now => { times.push(now); if (now - start < seconds * 1000) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const deltas = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    const pct = p => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))];
    const frames = window.__probe.frames.slice();
    const median = list => { const s = list.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const last = frames[frames.length - 1];
    const passSummary = {};
    if (last) for (const pass of last.passes) {
      const key = pass.sceneMain ? pass.kind : 'post/other-scene';
      passSummary[key] = passSummary[key] || { passes: 0, tris: 0, draws: 0 };
      passSummary[key].passes++; passSummary[key].tris += pass.tris; passSummary[key].draws += pass.draws;
    }
    const status = window.webgpuMaterials24;
    const renderer = window.__probe.renderers[window.__probe.renderers.length - 1];
    return {
      seconds, frames: deltas.length, fpsAvg: +(deltas.length / ((times[times.length - 1] - times[0]) / 1000)).toFixed(1),
      frameMsP50: +pct(.5).toFixed(2), frameMsP95: +pct(.95).toFixed(2), frameMsMax: +deltas[deltas.length - 1].toFixed(2),
      hudFps: Number(document.querySelector('#fps')?.textContent) || null, hudTriangles: document.querySelector('#triangles')?.textContent,
      hudMeshes: Number(document.querySelector('#draws')?.textContent) || null,
      info: { trianglesMedian: median(frames.map(f => f.triangles)), drawCallsMedian: median(frames.map(f => f.drawCalls)), frameCallsMedian: median(frames.map(f => f.frameCalls)), renderCallsTotal: renderer?.info?.render?.calls },
      passes: passSummary, pixelRatio: renderer?.getPixelRatio?.(), status: { fps: status.fps, triangles: status.triangles, meshes: status.meshes, light: status.light, backend: status.backend, profile: status.visualRuntime?.profile, pipeline: status.visualRuntime?.pipeline, effects: status.visualRuntime?.effects, shadows: status.visualRuntime?.shadows, lod: status.heroDetail?.lod, corridor: status.heroCorridor?.lod, identity: status.identityFacades?.visible }
    };
  }, seconds);
}

// Phân bổ tam giác theo nhóm (duyệt scene, chỉ mesh hiển thị theo chuỗi visible).
async function breakdown(page) {
  return page.evaluate(() => {
    const scene = window.__probe.mainScene; if (!scene) return null;
    const hex = material => material?.color?.getHexString?.();
    const groups = {};
    const ancestorName = object => { const names = []; for (let o = object; o; o = o.parent) if (o.name) names.push(o.name); return names.join(' / '); };
    const classify = object => {
      const names = ancestorName(object), color = hex(object.material);
      if (object.geometry?.attributes?.baseColor24) return 'cong-trinh (city mesh)';
      if (names.includes('Dense Vietnamese road traffic')) return 'xe';
      if (names.includes('Saigon River traffic')) return 'tau';
      if (names.includes('Cầu Ba Son')) return 'cau Ba Son (ket cau)';
      if (names.includes('City Detail Runtime 28')) return names.includes('public realm') ? 'chi tiet 28 · den duong' : 'chi tiet 28 · kien truc';
      if (names.includes('Hero Corridor 30B')) return 'hero corridor 30B';
      if (names.includes('Identity Facades 30B')) return 'identity facades 30B';
      if (names.includes('Marina Central') || names.includes('Grand Marina')) return 'Marina/Grand Marina';
      if (names.includes('Flood proxy') || names.includes('IOC flood')) return 'flood proxy';
      if (object.isInstancedMesh && ['55402f', '226a35', '285f35'].includes(color)) return 'cay';
      if (object.isInstancedMesh && color === '6d7772') return 'roof fixtures';
      if (!object.isInstancedMesh && { '8c9188': 1, '293534': 1, 'c8ad84': 1, 'f4db80': 1 }[color]) return `duong · ${{ '8c9188': 'edge', '293534': 'asphalt', 'c8ad84': 'pedestrian', 'f4db80': 'marking' }[color]}`;
      if (object.material?.envMapIntensity === 1.18) return 'nuoc';
      if (['b9b29e', '536b58', '315b38'].includes(color)) return 'nen/cong vien';
      return 'khac';
    };
    const visibleChain = object => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };
    scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry, base = (geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3;
      const instances = object.isInstancedMesh ? object.count : 1, tris = base * instances, key = classify(object), visible = visibleChain(object);
      const g = groups[key] = groups[key] || { meshes: 0, visibleMeshes: 0, trianglesAll: 0, trianglesVisible: 0, castShadowVisible: 0 };
      g.meshes++; g.trianglesAll += tris;
      if (visible) { g.visibleMeshes++; g.trianglesVisible += tris; if (object.castShadow) g.castShadowVisible += tris; }
    });
    return groups;
  });
}

async function shot(page, file, hideUi) {
  if (hideUi) await page.evaluate(() => document.body.classList.add('ui-hidden'));
  await sleep(400);
  await page.screenshot({ path: file });
  if (hideUi) await page.evaluate(() => document.body.classList.remove('ui-hidden'));
}

async function clickView(page, view) {
  // Ưu tiên nút ở dock điều hướng; "materials" chỉ có trong #controlBody nên mở panel trước.
  const dock = page.locator(`#cityNav [data-view="${view}"]`);
  if (await dock.count()) { await dock.click(); return 'cityNav'; }
  if (await page.locator('#controls').evaluate(el => el.classList.contains('collapsed'))) await page.click('#collapse');
  await page.click(`#controlBody [data-view="${view}"]`);
  await page.click('#collapse');
  return 'controlBody';
}

async function runBaseline(browser, log) {
  const results = { generated: new Date().toISOString(), viewport: VIEWPORT, runs: [] };
  const views = ['overview', 'materials', 'river', 'boulevard', 'bason', 'corridor'];
  const dir = path.join(OUT, 'screens'); fs.mkdirSync(dir, { recursive: true });
  // 1) WebGPU · presentation · 6 view × ngày/đêm (một trang, thao tác như người dùng).
  {
    log('WebGPU presentation');
    const session = await newSession(browser, `${BASE}?v=30b&view=overview`, log);
    const { page } = session;
    for (const view of views) {
      const via = await clickView(page, view);
      await waitCameraStable(page);
      for (const light of ['day', 'night']) {
        await page.click(`#cityNav [data-light="${light}"]`);
        await sleep(light === 'night' ? 2500 : 1500);
        const metrics = await measure(page, 5);
        const file = `30b-webgpu-presentation-${view}-${light}.png`;
        await shot(page, path.join(dir, file), false);
        const groups = light === 'day' ? await breakdown(page) : null;
        const pose = await page.evaluate(() => { const c = window.__probe.camera; return c ? { position: c.position.toArray().map(v => +v.toFixed(1)), fov: c.fov } : null; });
        results.runs.push({ backend: 'webgpu', quality: 'presentation', view, light, via, file, pose, metrics, breakdown: groups, console: session.consoleMessages.splice(0) });
        log(`  ${view}/${light}: ${metrics.fpsAvg} fps, ${metrics.info.trianglesMedian} tris, ${metrics.info.drawCallsMedian} draws`);
      }
    }
    await page.click('#cityNav [data-light="day"]');
    await session.context.close();
  }
  // 2) WebGPU · balanced/performance · overview; 3) WebGL 2 · overview (ngày + đêm).
  const extra = [
    { backend: 'webgpu', quality: 'balanced', query: '&quality=balanced' },
    { backend: 'webgpu', quality: 'performance', query: '&quality=performance' },
    { backend: 'webgl', quality: 'presentation(requested)', query: '&backend=webgl' }
  ];
  for (const run of extra) {
    log(`${run.backend} ${run.quality}`);
    const session = await newSession(browser, `${BASE}?v=30b&view=overview${run.query}`, log);
    const { page } = session;
    await waitCameraStable(page);
    for (const light of run.backend === 'webgl' ? ['day', 'night'] : ['day']) {
      await page.click(`#cityNav [data-light="${light}"]`);
      await sleep(2000);
      const metrics = await measure(page, 5);
      const file = `30b-${run.backend}-${run.quality.replace(/[^a-z]/g, '')}-overview-${light}.png`;
      await shot(page, path.join(dir, file), false);
      const groups = await breakdown(page);
      results.runs.push({ backend: run.backend, quality: run.quality, view: 'overview', light, file, metrics, breakdown: groups, loadMs: session.loadMs, console: session.consoleMessages.splice(0) });
      log(`  overview/${light}: ${metrics.fpsAvg} fps, ${metrics.info.trianglesMedian} tris`);
    }
    await session.context.close();
  }
  fs.writeFileSync(path.join(OUT, 'baseline-30b-metrics.json'), JSON.stringify(results, null, 1));
}

async function runPoses(browser, log, jobs, outFile) {
  const results = [];
  const byBase = {};
  for (const job of jobs) (byBase[job.base || 'bason'] = byBase[job.base || 'bason'] || []).push(job);
  for (const [base, list] of Object.entries(byBase)) {
    const session = await newSession(browser, `${BASE}?v=30b&view=${base}`, log);
    const { page } = session;
    await waitCameraStable(page);
    for (const job of list) {
      await page.evaluate(pose => { window.__probe.pose = pose; }, job.pose);
      if (job.light) await page.click(`#cityNav [data-light="${job.light}"]`);
      await sleep(job.settleMs || 3500);
      const metrics = job.measure === false ? null : await measure(page, 5);
      const file = path.resolve(OUT, job.out);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await shot(page, file, job.hideUi !== false);
      results.push({ id: job.id, base, pose: job.pose, light: job.light || 'day', file: path.relative(OUT, file).replace(/\\/g, '/'), metrics, console: session.consoleMessages.splice(0) });
      log(`  ${job.id || job.out}: ${metrics ? metrics.fpsAvg + ' fps' : ''}`);
      if (job.light) await page.click('#cityNav [data-light="day"]');
      await page.evaluate(() => { window.__probe.pose = null; });
    }
    await session.context.close();
  }
  if (outFile) fs.writeFileSync(path.join(OUT, outFile), JSON.stringify(results, null, 1));
  return results;
}

(async () => {
  const mode = process.argv[2] || 'baseline';
  const log = message => console.log(message);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    if (mode === 'baseline') await runBaseline(browser, log);
    else if (mode === 'issues') {
      const cameras = JSON.parse(fs.readFileSync(path.join(OUT, 'issue-cameras-30b.json'), 'utf8'));
      await runPoses(browser, log, cameras.issues.map(issue => ({ id: issue.id, base: issue.baseView, pose: issue.pose, out: `issues/30b-${issue.id}.png` })), 'issue-captures-30b.json');
    } else if (mode === 'probe') {
      const job = JSON.parse(process.argv[3]);
      await runPoses(browser, log, Array.isArray(job) ? job : [job], null);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
