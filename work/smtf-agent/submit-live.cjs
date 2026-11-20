// Kiểm cổng bản nộp trên URL production thật.
// Cách chạy: node work/smtf-agent/submit-live.cjs <BASE_URL>
// Kết quả: work/smtf-agent/submit-live.json + ảnh bằng chứng work/smtf-agent/live-*.png
const { writeFileSync } = require('node:fs');
const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');

const BASE = process.argv[2];
if (!BASE || !/^https:\/\//.test(BASE)) { console.error('Cần BASE_URL https.'); process.exit(1); }
const shots = 'work/smtf-agent';
const results = { base: BASE, startedAt: new Date().toISOString(), checks: {}, pass: true };
const fail = name => { results.checks[name] = results.checks[name] || {}; results.checks[name].status = 'FAIL'; results.pass = false; };
const ok = name => { results.checks[name] = results.checks[name] || {}; results.checks[name].status = 'PASS'; };

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const rec = { requests: [], errors: [], failures: [], workers: [] };
    page.on('response', r => rec.requests.push([r.status(), r.url()]));
    page.on('worker', w => rec.workers.push(w.url()));
    page.on('requestfailed', r => rec.failures.push([r.url(), r.failure()?.errorText]));
    page.on('pageerror', e => rec.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') rec.errors.push(m.text()); });

    // ---------- SUBMIT-NAV ----------
    const landing = await page.goto(BASE + '/', { waitUntil: 'load' });
    results.checks.nav = { landingStatus: landing.status(), title: await page.title() };
    await page.screenshot({ path: `${shots}/live-landing-1440.png` });

    const officerResp = await page.goto(BASE + '/index-officer.html', { waitUntil: 'load' });
    results.checks.nav.officerStatus = officerResp.status();
    await page.goBack();
    const backOk = new URL(page.url()).pathname === '/';
    results.checks.nav.goBackLanding = backOk;
    if (!backOk) fail('nav');

    // ---------- SUBMIT-DATA (officer) ----------
    await page.goto(BASE + '/index-officer.html', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Vào demo cán bộ' }).click();
    await page.waitForFunction(() => {
      const kpis = Array.from(document.querySelectorAll('.submit-kpi'));
      return kpis.length >= 4 && kpis.some(e => e.textContent.includes('18 giây'));
    }, { timeout: 25000 });
    await page.waitForSelector('.submit-records li', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#submit-camera-select option').length >= 15, { timeout: 15000 });
    const kpis = await page.$$eval('.submit-kpi', els => els.map(e => e.textContent.trim()));
    const records = await page.$$eval('.submit-records li', els => els.map(e => e.textContent.trim()));
    const cameraOptions = await page.locator('#submit-camera-select option').count();
    results.checks.data = { kpis, records, cameraOptions };
    const kpiOk = kpis.length >= 4 && kpis.some(t => t.includes('18')) && kpis.some(t => t.includes('24'));
    const recordOk = records.length === 1 && records[0].includes('51K-123.45');
    results.checks.data.kpiOk = kpiOk; results.checks.data.recordOk = recordOk;
    if (!kpiOk || !recordOk || cameraOptions !== 15) fail('data');
    await page.screenshot({ path: `${shots}/live-officer-1440.png` });

    // ---------- SUBMIT-CAM ----------
    await page.selectOption('#submit-camera-select', 'CAM-BAC-002');
    await page.waitForSelector('.submit-media-stage img', { timeout: 20000 });
    await page.waitForTimeout(2500); // cho ảnh và metadata chạm bước cập nhật 3 s
    const cam = await page.evaluate(() => {
      const img = document.querySelector('.submit-media-stage img');
      const stage = document.querySelector('.submit-media-stage');
      const meta = document.querySelector('.submit-media-meta');
      return {
        src: img ? new URL(img.src).pathname + new URL(img.src).search : null,
        natural: img ? [img.naturalWidth, img.naturalHeight, img.complete] : null,
        stage: stage ? [Math.round(stage.getBoundingClientRect().width), Math.round(stage.getBoundingClientRect().height)] : null,
        meta: meta ? meta.textContent.trim() : null,
        sourceBadge: document.querySelector('.submit-source')?.textContent.trim() ?? null,
        selectValue: document.querySelector('#submit-camera-select')?.value ?? null,
      };
    });
    results.checks.cam = cam;
    const camOk = cam.natural && cam.natural[2] === true && cam.natural[0] > 0
      && cam.sourceBadge && cam.sourceBadge.includes('Ảnh mẫu')
      && cam.meta && cam.meta.includes('CAM-BAC-002') && cam.meta.includes('Bac-02');
    if (!camOk) fail('cam');
    // Fullscreen: bấm nút, đo element fullscreen + ảnh vẫn vừa khung.
    results.checks.cam.buttons = await page.$$eval('button', els => els.map(e => [e.textContent.trim().slice(0, 40), e.getAttribute('aria-label')]));
    await page.locator('button[aria-label="Mở camera toàn màn hình"]').click({ timeout: 15000 });
    await page.waitForTimeout(900);
    const fs = await page.evaluate(() => {
      const el = document.fullscreenElement;
      if (!el) return { fullscreen: false };
      const img = el.querySelector('img') || document.querySelector('.submit-media-stage img');
      const r = el.getBoundingClientRect();
      return { fullscreen: true, stage: [Math.round(r.width), Math.round(r.height)], imgVisible: !!(img && img.naturalWidth > 0) };
    });
    results.checks.cam.fullscreen = fs;
    if (!fs.fullscreen) fail('cam');
    await page.screenshot({ path: `${shots}/live-camera-fullscreen.png` });
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await page.waitForTimeout(400);
    // Đổi camera nhanh không lộ frame cũ: đổi sang CAM-HX-001 (có ảnh mẫu khác).
    await page.selectOption('#submit-camera-select', 'CAM-HX-001');
    await page.waitForTimeout(2500);
    const cam2 = await page.evaluate(() => {
      const img = document.querySelector('.submit-media-stage img');
      return { src: img ? new URL(img.src).search : null, meta: document.querySelector('.submit-media-meta')?.textContent.trim() };
    });
    results.checks.cam.switchToHX001 = cam2;
    if (!cam2.meta || !cam2.meta.includes('CAM-HX-001')) fail('cam');
    await page.screenshot({ path: `${shots}/live-camera-hx001.png` });

    // ---------- SUBMIT-DATA (citizen lookup) ----------
    await page.goto(BASE + '/index-citizen.html', { waitUntil: 'load' });
    await page.fill('#submit-plate', '51K12345');
    await page.locator('.submit-lookup-form button[type=submit]').click();
    await page.waitForSelector('.submit-lookup-results article', { timeout: 20000 });
    const lookupA = await page.$$eval('.submit-lookup-results article', els => els.map(e => e.textContent.trim()));
    await page.getByRole('button', { name: '51K-123.45', exact: true }).click();
    await page.locator('.submit-lookup-form button[type=submit]').click();
    await page.waitForTimeout(1500);
    const lookupB = await page.$$eval('.submit-lookup-results article', els => els.map(e => e.textContent.trim()));
    results.checks.citizen = { plateContinuous: lookupA, plateDashed: lookupB };
    const same = lookupA.length === 1 && lookupB.length === 1 && lookupA[0] === lookupB[0] && lookupA[0].includes('51K-123.45');
    // biển hợp lệ không có trong seed → thông báo rỗng, không phải lỗi
    await page.getByRole('button', { name: '51K-987.65', exact: true }).click();
    await page.locator('.submit-lookup-form button[type=submit]').click();
    await page.waitForTimeout(1500);
    const lookupEmpty = await page.evaluate(() => ({
      message: document.querySelector('.submit-lookup-message')?.textContent.trim() ?? null,
      error: document.querySelector('.submit-error')?.textContent.trim() ?? null,
    }));
    results.checks.citizen.validEmpty = lookupEmpty;
    // biển sai định dạng
    await page.fill('#submit-plate', 'xyz');
    await page.locator('.submit-lookup-form button[type=submit]').click();
    await page.waitForTimeout(1200);
    const lookupBad = await page.evaluate(() => ({
      error: document.querySelector('.submit-error')?.textContent.trim() ?? null,
    }));
    results.checks.citizen.invalidPlate = lookupBad;
    const citizenOk = same
      && lookupEmpty.message && lookupEmpty.message.includes('chưa có hồ sơ') && !lookupEmpty.error
      && lookupBad.error && lookupBad.error.includes('đúng định dạng');
    if (!citizenOk) fail('citizen');
    await page.screenshot({ path: `${shots}/live-citizen-lookup.png` });

    // ---------- SUBMIT-3D ----------
    await page.goto(BASE + '/hcmc-poc/?backend=webgl&demo=vercel', { waitUntil: 'load' });
    await page.waitForSelector('#loading.done', { timeout: 95000 });
    const scene = await page.evaluate(() => {
      const app = window.__smartApp;
      const config = window.PUBLIC_NORTH_CONFIG_32;
      const junctionSet = new Set(config.signalRows.map(row => (row.node_id === 'Bac-01-02' ? 'Bac-01' : row.node_id)));
      return {
        backend: document.body.dataset.backend,
        region: document.body.dataset.region,
        mode: document.body.dataset.mode,
        forecast: !!(app && app.modules && app.modules.forecast && app.modules.forecast.ready),
        junctions: junctionSet.size,
        buildId: window.SMtfBuildId ?? null,
        keys: { app: Object.keys(app || {}).slice(0, 40), modules: Object.keys((app && app.modules) || {}) },
      };
    });
    results.checks.scene = scene;
    const hudInfo = await page.evaluate(() => {
      const select = document.querySelector('select#submit-junction');
      if (!select) return null;
      const hud = select.closest('[aria-label]') || select.parentElement;
      const r = hud.getBoundingClientRect();
      return {
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        options: select ? select.options.length : 0,
        optionValues: select ? Array.from(select.options).map(o => o.value) : [],
        viewport: [window.innerWidth, window.innerHeight],
      };
    });
    results.checks.hud1440 = hudInfo;
    const t0 = performance.now();
    await page.screenshot({ path: `${shots}/live-3d-1440.png` });

    // HUD ở các viewport nhỏ: đo hình học, chọn nút, góc chuẩn.
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.waitForTimeout(2600);
      const small = await page.evaluate(() => {
        const select = document.querySelector('select#submit-junction');
        if (!select) return null;
        const r = select.getBoundingClientRect();
        const sr = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const panel = select.closest('[aria-label]') || select.parentElement;
        const pr = panel.getBoundingClientRect();
        return {
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          panel: { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) },
          viewport: [window.innerWidth, window.innerHeight],
          scrollY: Math.round(window.scrollY),
          visible: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0,
          options: select.options.length,
        };
      });
      results.checks['hud' + width] = small;
      await page.screenshot({ path: `${shots}/live-3d-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);

    // Chọn 1 nút trong HUD, bấm góc chuẩn, đo tín hiệu + hàng chờ.
    const hudFlow = await page.evaluate(async () => {
      const app = window.__smartApp;
      const select = document.querySelector('select#submit-junction');
      if (!select) return { error: 'no-submit-junction-select' };
      const hud = select.closest('[aria-label]') || select.parentElement;
      const stdBtn = document.querySelector('[data-standard]');
      const camBtn = document.querySelector('[data-camera]');
      const out = {};
      out.before = { value: select.value, status: hud.querySelector('output')?.textContent ?? null };
      select.value = 'Bac-02';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1500));
      out.afterSelect = { status: hud.querySelector('output')?.textContent ?? null, cameraInfo: hud.querySelector('[data-camera]')?.textContent ?? null };
      if (stdBtn) { stdBtn.click(); await new Promise(r => setTimeout(r, 1200)); }
      out.afterStandard = { status: hud.querySelector('output')?.textContent ?? null };
      out.appKeys = { sim: !!(app.traffic && app.traffic.sim), controller: !!app.controller, trafficKeys: Object.keys(app.traffic || {}) };
      return out;
    });
    results.checks.hudFlow = hudFlow;

    // ---------- SUBMIT-SIGNAL ----------
    const signal = await page.evaluate(async () => {
      const app = window.__smartApp;
      const traffic = app.traffic;
      const controller = app.controller;
      const params = controller && typeof controller.getParams === 'function' ? controller.getParams() : null;
      const stateOf = nodeId => (traffic.signalState ? traffic.signalState(nodeId) : (controller ? controller.stateOf(nodeId, traffic.sim.counters.t) : null));
      const probe = stateOf('Bac-02');
      if (!probe || !probe.phases) return { found: false, probeShape: probe ? Object.keys(probe) : null, params };
      const samples = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 60000) {
        const st = stateOf('Bac-02');
        samples.push({ t: traffic.sim.counters.t, p0: st.phases[0].phase, p1: st.phases[1].phase });
        await new Promise(r => setTimeout(r, 150));
      }
      const runs = idx => {
        const out = [];
        let phase = null, start = null;
        for (const s of samples) {
          const ph = idx === 0 ? s.p0 : s.p1;
          if (ph !== phase) {
            if (phase !== null) out.push([phase, Math.round((s.t - start) * 10) / 10]);
            phase = ph; start = s.t;
          }
        }
        return out;
      };
      const d0 = runs(0), d1 = runs(1);
      const allRed = [];
      let inRed = false, redStart = 0;
      for (let i = 0; i < samples.length; i++) {
        const both = samples[i].p0 === 'red' && samples[i].p1 === 'red';
        if (both && !inRed) { inRed = true; redStart = samples[i].t; }
        if (!both && inRed) { inRed = false; allRed.push(Math.round((samples[i].t - redStart) * 10) / 10); }
      }
      return {
        found: true, params: params && { yellowS: params.yellowS, allRedS: params.allRedS, minGreenS: params.minGreenS, maxGreenS: params.maxGreenS },
        cycle_s: probe.cycle_s ?? null,
        phaseDurations0: d0, phaseDurations1: d1,
        yellowS: [...new Set([...d0, ...d1].filter(([ph]) => ph === 'yellow').map(([, s]) => s))],
        greenS: [...new Set([...d0, ...d1].filter(([ph]) => ph === 'green').map(([, s]) => s))],
        allRedS: [...new Set(allRed)],
      };
    });
    results.checks.signal = signal;
    const sigOk = signal.found
      && signal.params && signal.params.yellowS === 3 && signal.params.allRedS === 2
      && signal.yellowS && signal.yellowS.length > 0 && signal.yellowS.every(v => Math.abs(v - 3) <= 0.6)
      && signal.allRedS && signal.allRedS.length > 0 && signal.allRedS.every(v => Math.abs(v - 2) <= 0.6);
    if (!sigOk) fail('signal');
    await page.screenshot({ path: `${shots}/live-signal-bac02.png` });

    // Tốc độ khung hình sau khi đã tải xong (đo ngắn).
    const fps = await page.evaluate(async () => {
      const times = []; let last = performance.now();
      await new Promise(resolve => { function frame(now) { times.push(now - last); last = now; if (times.length === 60) { resolve(); return; } requestAnimationFrame(frame); } requestAnimationFrame(frame); });
      times.sort((a, b) => a - b);
      return { medianFPS: Math.round(1000 / times[30]), p95FrameMs: Math.round(times[57]) };
    });
    results.checks.fps = fps;

    // ---------- Mạng: mọi request cùng origin, không lỗi ----------
    const badRequests = rec.requests.filter(([s, u]) => s >= 400 || !(u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')));
    rec.failures = rec.failures.filter(([, err]) => err !== 'net::ERR_ABORTED');
    results.checks.net = {
      total: rec.requests.length,
      bad: badRequests.slice(0, 12),
      failures: rec.failures.slice(0, 12),
      errors: rec.errors.slice(0, 12),
      workers: rec.workers,
      forecastWorker: rec.workers.some(w => w.includes('forecast-worker-32.js')),
    };
    if (badRequests.length || rec.failures.length || rec.errors.length) fail('net');
    if (!results.checks.net.forecastWorker) fail('net');
  } catch (error) {
    results.checks.fatal = { message: error.message, stack: String(error.stack).slice(0, 800) };
    results.pass = false;
  } finally {
    results.finishedAt = new Date().toISOString();
    writeFileSync(`${shots}/submit-live.json`, JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify({ pass: results.pass, checks: Object.fromEntries(Object.entries(results.checks).map(([k, v]) => [k, v && v.status ? v.status : 'record'])), signal: results.checks.signal, scene: results.checks.scene && { backend: results.checks.scene.backend, region: results.checks.scene.region, junctions: results.checks.scene.junctions, forecast: results.checks.scene.forecast }, net: results.checks.net, fatal: results.checks.fatal ?? null }));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
