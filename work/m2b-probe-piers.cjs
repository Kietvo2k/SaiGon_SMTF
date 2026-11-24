// M2b: dem tru cau theo way trong trang smart (window.webgpuMaterials24.bridges.api.piers). Khong commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8853/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto(BASE + '?v=32a&app=smart&region=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await sleep(1500);
  const out = await p.evaluate(() => {
    const api = window.webgpuMaterials24.bridges && window.webgpuMaterials24.bridges.api;
    if (!api) return { error: 'no api' };
    const ways = [32581944, 192289478, 1012023452, 306073179, 306073180, 1344826626, 35470085, 165919725, 165919740, 166092209, 1106232435, 785535443, 785535444, 785535445, 785535448, 888037554, 604163756];
    const rows = ways.map(w => {
      const ps = api.piers.filter(p => Number(p.way) === w);
      return { way: w, piers: ps.length, wet: ps.filter(p => p.water).length, land: ps.filter(p => !p.water).length, topMin: ps.length ? Math.min(...ps.map(p => p.top)).toFixed(1) : null, topMax: ps.length ? Math.max(...ps.map(p => p.top)).toFixed(1) : null };
    });
    return { total: api.piers.length, rows, rails: api.rails, version: api.version };
  });
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
