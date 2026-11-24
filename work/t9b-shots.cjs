// T9b — chụp ảnh nghiệm thu (không commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8836/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });

async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(url, { waitUntil: 'load' });
  await ready(p);
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2500);
  return { ctx, p };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });

  // 1) smart, góc Hàng Xanh, ban ngày
  {
    const { ctx, p } = await open(browser, BASE + '?v=32a&app=smart&view=overview');
    await p.click('#cityNav .nav-views button[data-view="hx"]');
    await p.waitForFunction(() => { const c = window.__smartApp.camera.position; return Math.hypot(c.x + 10, c.z + 2450) < 260; }, null, { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    await p.screenshot({ path: 'work/t9b-hx-day.png' });
    // 2) đêm
    await p.click('#cityNav [data-light="night"]');
    await sleep(3500);
    await p.screenshot({ path: 'work/t9b-hx-night.png' });
    await ctx.close();
    console.log('done hx day/night');
  }

  // 3) smart toàn khu Bắc
  {
    const { ctx, p } = await open(browser, BASE + '?v=32a&app=smart&view=overview');
    await p.click('#cityNav .nav-views button[data-view="bac"]');
    await sleep(4000);
    await p.screenshot({ path: 'work/t9b-overview.png' });
    await ctx.close();
    console.log('done smart bac overview');
  }

  // 4) cổ điển cùng góc: khu bắc toàn cảnh
  {
    const { ctx, p } = await open(browser, BASE + '?v=31a&region=bac&view=overview');
    await p.screenshot({ path: 'work/t9b-classic-same-view.png' });
    await ctx.close();
    console.log('done classic bac overview');
  }

  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
