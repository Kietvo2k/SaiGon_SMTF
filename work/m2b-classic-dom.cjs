// M2b: liet ke nut data-view trong trang co dien (index.html). Khong commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto('http://127.0.0.1:8853/hcmc-poc/index.html', { waitUntil: 'load' });
  await sleep(45000);
  const list = await p.evaluate(() => [...document.querySelectorAll('[data-view]')].map(b => b.dataset.view + ' | ' + b.textContent.trim().slice(0, 40)));
  console.log(list.join('\n'));
  const lm = await p.evaluate(() => !!document.querySelector('#landmarkDetail'));
  console.log('landmarkDetail toggle present =', lm);
  await ctx.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
