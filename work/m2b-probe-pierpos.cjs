// M2b: lay toa do tru tren dat (water=false) cua mot so way cau de chup kiem. Khong commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto('http://127.0.0.1:8853/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&region=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await sleep(1500);
  const out = await p.evaluate(() => {
    const api = window.webgpuMaterials24.bridges.api;
    const land = api.piers.filter(q => !q.water).map(q => ({ way: q.way, x: q.x, z: q.z, top: q.top, bottom: q.bottom, r: q.radius }));
    return { land };
  });
  console.log(JSON.stringify(out.land.filter(q => [1106232435, 165919725, 166092209, 306073179, 32581944, 306073180, 192289478, 1344826626, 1012023452].includes(Number(q.way)))));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
