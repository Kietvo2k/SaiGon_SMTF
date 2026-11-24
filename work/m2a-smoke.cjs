// M2a smoke (không commit): tải app=smart, in số liệu khóa khu + nhãn + camera + audit + giao thông, bắt lỗi console.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 240)));
  try {
    await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
    await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(3000);
    const diag = await p.evaluate(() => {
      const m = window.webgpuMaterials24 || {};
      const t = m.traffic || {};
      const info = m.renderer?.info;
      return {
        lock32: m.lock32 || null,
        labels: [...document.querySelectorAll('#labels .lock-label')].map(e => e.textContent),
        lockLabelsDisplay: [...document.querySelectorAll('#labels .lock-label')].map(e => e.style.display),
        labelProbe: (m.lock32?.labels || []).map(l => {
          const cam = window.__smartApp?.camera; if (!cam) return null;
          const v = cam.position.clone(); v.set(l.x, 120, l.z);
          const p = v.project(cam);
          return { id: l.id, x: Math.round((p.x * .5 + .5) * innerWidth), y: Math.round((-p.y * .5 + .5) * innerHeight), z: +p.z.toFixed(3) };
        }),
        viewport: [innerWidth, innerHeight],
        cameraLimits: m.lock32?.cameraLimits || null,
        camera: m.lock32?.camera || null,
        smartRegion: m.lock32?.smartRegion || null,
        audit: m.lock32?.audit ? m.lock32.audit() : null,
        density: m.density?.counts || null,
        region: m.density?.region ? { id: m.density.region.id, buildings: m.density.region.buildingsInRegion } : null,
        vehiclesVia: m.density?.vehiclesVia || null,
        trafficRegion: m.density?.trafficRegion ? m.density.trafficRegion() : null,
        traffic: { active: t.active, total: t.total, region: t.region ? { id: t.region.id, vehicles: t.region.vehicles } : null },
        renderer: info ? { calls: info.render?.calls, triangles: info.render?.triangles } : null,
        hasApp: !!window.__smartApp
      };
    });
    console.log('SMART', JSON.stringify(diag));
  } catch (e) {
    console.error('FAIL', e.message);
  } finally {
    if (errs.length) console.log('errors:', errs.slice(0, 8).join(' | '));
    await browser.close().catch(() => {});
  }
})();
