// M2b: chup che do co dien (index.html) cho cum Landmark 81 (landmark-detail.js). Khong commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL = process.env.URL_CLASSIC || 'http://127.0.0.1:8853/hcmc-poc/index.html?view=landmarkclose';
const OUT = process.env.OUT || 'work/m2b-sig-l81-classic.png';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  const errors = [];
  p.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
  await p.goto(URL, { waitUntil: 'load' });
  await sleep(Number(process.env.WAIT_MS || 60000));
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2000);
  const clicked = await p.evaluate(() => { const b = document.querySelector('[data-view="landmarkclose"]'); if (b) { b.click(); return true; } return false; });
  console.log('clicked landmarkclose =', clicked);
  await sleep(Number(process.env.SETTLE_MS || 15000));
  await p.screenshot({ path: OUT });
  console.log('saved', OUT, 'pageerrors=', errors.length, errors.slice(0, 3).join(' | '));
  await ctx.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
