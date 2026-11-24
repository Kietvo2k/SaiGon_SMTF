// M2a (không commit): chụp 3 ảnh bằng chứng — toàn cảnh (3 khu xám + nhãn khóa + viền), Hàng Xanh, Landmark 81.
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
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  try {
    await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
    await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(4000);
    await p.screenshot({ path: 'work/m2a-overview.png' });
    const labels = await p.evaluate(() => [...document.querySelectorAll('#labels .lock-label')].map(e => ({ t: e.textContent, d: e.style.display, l: e.style.left, tp: e.style.top })));
    console.log('overview labels', JSON.stringify(labels));

    await p.click('#cityNav .nav-views button[data-view="hx"]');
    await p.waitForFunction(() => { const a = window.__smartApp; if (!a) return false; const c = a.camera.position; return Math.hypot(c.x + 10, c.z + 2450) < 260; }, null, { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    await p.screenshot({ path: 'work/m2a-hx.png' });

    await p.click('#cityNav .nav-views button[data-view="l81"]');
    await sleep(3000);
    await p.screenshot({ path: 'work/m2a-landmark81.png' });
    console.log('shots done');
  } catch (e) {
    console.error('FAIL', e.message);
  } finally {
    if (errs.length) console.log('errors:', errs.slice(0, 6).join(' | '));
    await browser.close().catch(() => {});
  }
})();
