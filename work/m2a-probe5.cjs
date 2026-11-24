// M2a probe 5 (không commit): đo xe ngoài khu Bắc + xe quanh HX với margin 250 vs 0.
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
    await sleep(2500);
    const diag = await p.evaluate(async () => {
      const t = window.__smartApp.traffic;
      const { regionPolygon } = await import('/hcmc-poc/city-region-31.js?v=31a');
      const r0 = t.getRegion();
      const pts = regionPolygon('bac');
      const inPoly = (x, z) => { let c = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const xa = pts[a][0], za = pts[a][1], xb = pts[b][0], zb = pts[b][1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c; } return c; };
      const stat = () => {
        const poses = t.poses(); let active = 0, outside = 0, nearHX = 0;
        for (let i = 0; i < t.sim.N; i++) { if (!t.sim.active[i]) continue; active++; const x = poses[i * 5], z = poses[i * 5 + 2]; if (!inPoly(x, z)) outside++; if (Math.hypot(x - 0, z + 2485) <= 300) nearHX++; }
        const s = t.stats();
        return { active, outside, nearHX, onBridge: s.onBridge, teleports: s.teleports, respawns: s.respawns, waiting: s.waitingNow, t: +s.t.toFixed(1) };
      };
      const net = t.net.stats;
      t.advance(60); const a = stat();
      t.setRegion({ id: 'bac', polygon: pts, margin: 0 }); t.advance(60); const b = stat();
      t.setRegion({ id: 'bac', polygon: pts, margin: 250 }); t.advance(60); const c = stat();
      return { margin: r0.margin, pts: pts.length, net, pool: t.sim.N, a, b, c };
    });
    console.log('PROBE', JSON.stringify(diag, null, 1));
  } catch (e) {
    console.error('FAIL', e.message);
  } finally {
    if (errs.length) console.log('errors:', errs.slice(0, 8).join(' | '));
    await browser.close().catch(() => {});
  }
})();
