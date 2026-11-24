// T9b â€” cáº¯t cáº­n vÃ¹ng nÃºt HÃ ng Xanh á»Ÿ gÃ³c preset (khÃ´ng commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8836/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2000);
  await p.click('#cityNav .nav-views button[data-view="hx"]');
  await p.waitForFunction(() => { const c = window.__smartApp.camera.position; return Math.hypot(c.x + 10, c.z + 2450) < 170; }, null, { timeout: 40000 }).catch(() => {});
  await sleep(3000);
  const cam = await p.evaluate(() => { const c = window.__smartApp.camera.position; return [Math.round(c.x), Math.round(c.y), Math.round(c.z)]; });
  console.log('cam', JSON.stringify(cam));
  await p.screenshot({ path: 'work/t9b-hx-crop.png', clip: { x: 640, y: 480, width: 720, height: 380 } });
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });

