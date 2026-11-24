// T9b: bay camera tới Hàng Xanh gần, đọc density + chụp. Không commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8836/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });

const FOCUS = `async (TX, TZ, zooms) => {
  const cam = window.__smartApp.camera;
  const V = cam.up.constructor;
  const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const press = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const off = () => { const v = new V(TX, 0, TZ); v.project(cam); return { ox: (v.x * .5 + .5) * innerWidth - innerWidth / 2, oy: (-v.y * .5 + .5) * innerHeight - innerHeight / 2 }; };
  let kx = 'd', ky = 'w';
  const center = async (tol, iters) => {
    for (let i = 0; i < iters; i++) {
      const o = off(); if (Math.abs(o.ox) < tol && Math.abs(o.oy) < tol) return true;
      if (Math.abs(o.ox) >= tol) { const b = Math.abs(o.ox); press(kx); await wait(); await wait(); const a = Math.abs(off().ox); if (a > b + 0.5) { kx = kx === 'd' ? 'a' : 'd'; press(kx); await wait(); await wait(); } }
      const o2 = off(); if (Math.abs(o2.oy) >= tol) { const b = Math.abs(o2.oy); press(ky); await wait(); await wait(); const a = Math.abs(off().oy); if (a > b + 0.5) { ky = ky === 'w' ? 's' : 'w'; press(ky); await wait(); await wait(); } }
    }
    return false;
  };
  await center(60, 40);
  for (let i = 0; i < zooms; i++) { press('='); await wait(); }
  await center(20, 50);
  return off();
}`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
  const url = BASE + '?v=32a&app=smart&view=overview&region=bac';
  await p.goto(url, { waitUntil: 'load' });
  await ready(p);
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(1500);
  const before = await p.evaluate(() => { const m = window.webgpuMaterials24; const d = m.density || {}; const r = d.region || {}; return { keys: Object.keys(m).slice(0, 40), label: document.body.dataset.region, region: r.id, buildings: r.buildingsInRegion, vehicles: r.vehicles, hasApp: !!window.__smartApp }; });
  await p.evaluate('(' + FOCUS + ')(-251.17,-2439.95,22)');
  await sleep(1200);
  const after = await p.evaluate(() => { const m = window.webgpuMaterials24, d = m.density || {}, r = d.region || {}, a = window.__smartApp; const s = a.traffic.sim.stats(); return { region: r.id, buildings: r.buildingsInRegion, vehicles: r.vehicles, simActive: s.active, camPos: [Math.round(a.camera.position.x), Math.round(a.camera.position.y), Math.round(a.camera.position.z)] }; });
  console.log('errors', JSON.stringify(errs.slice(0, 8)));
  await p.screenshot({ path: 'work/t9b-hx-region-bac.png' });
  console.log('before', JSON.stringify(before));
  console.log('after ', JSON.stringify(after));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
