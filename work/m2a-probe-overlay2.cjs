// M2a (không commit): thí nghiệm — nâng nền xám lên cao + đổi màu đỏ để biết lớp nào đang che/xuyên qua.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  try {
    await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
    await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(3000);
    // 1) ẩn nền xám
    await p.evaluate(() => { const s = window.__smartApp.scene; s.traverse(o => { if (o.name && o.name.indexOf('nền xám 3 khu') >= 0) o.visible = false; }); });
    await sleep(1500);
    await p.screenshot({ path: 'work/tmp-overlay-off.png' });
    // 2) hiện lại + nâng lên y=4, đổi đỏ
    await p.evaluate(() => { const s = window.__smartApp.scene; s.traverse(o => { if (o.name && o.name.indexOf('nền xám 3 khu') >= 0) { o.visible = true; o.position.y = 4; } }); });
    await sleep(1500);
    await p.screenshot({ path: 'work/tmp-overlay-up.png' });
    console.log('done');
  } catch (e) { console.error('FAIL', e.message); }
  finally { await browser.close().catch(() => {}); }
})();
