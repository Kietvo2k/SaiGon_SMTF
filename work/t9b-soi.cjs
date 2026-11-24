// T9b — cận cảnh cụm đèn Hàng Xanh để soi màu đèn (không commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8836/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2000);
  await p.click('#cityNav .nav-views button[data-view="hx"]');
  await p.waitForFunction(() => { const c = window.__smartApp.camera.position; return Math.hypot(c.x + 10, c.z + 2450) < 260; }, null, { timeout: 30000 }).catch(() => {});
  // zoom vào sát
  await p.evaluate(() => { for (let i = 0; i < 6; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' })); });
  await sleep(3000);
  const info = await p.evaluate(() => {
    const a = window.__smartApp, sig = a.modules.signals;
    let lamps = 0, halosOn = 0, colors = {};
    sig.group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'SphereGeometry') {
        lamps++;
        if (o.material.blending === 2) { if (o.visible) halosOn++; }
        else colors[o.material.color.getHexString()] = (colors[o.material.color.getHexString()] || 0) + 1;
      }
    });
    return { lamps, halosOn, colors, coneVisible: sig.coneVisible, camPos: [Math.round(a.camera.position.x), Math.round(a.camera.position.y), Math.round(a.camera.position.z)] };
  });
  console.log('info', JSON.stringify(info));
  await p.screenshot({ path: 'work/t9b-hx-soi.png' });
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
