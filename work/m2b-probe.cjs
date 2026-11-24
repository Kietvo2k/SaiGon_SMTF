// M2b probe: doc du lieu cau tu app dang chay (khong commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8842/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await sleep(2500);
  const info = await p.evaluate(() => {
    const M = window.webgpuMaterials24;
    const api = M.bridges?.api;
    const out = { stats: M.bridges?.stats, piersByWay: {}, rails: api?.rails, lamps: api?.lamps };
    const want = { 32581944: 'Cầu Sài Gòn', 192289478: 'Cầu Sài Gòn', 1012023452: 'Cầu Sài Gòn', 306073179: 'Cầu Sài Gòn 2', 306073180: 'Cầu Sài Gòn 2', 1344826626: 'Cầu Sài Gòn 2', 35470085: 'Cầu Thủ Thiêm', 165919725: 'Cầu Thủ Thiêm', 165919740: 'Cầu Thủ Thiêm', 166092209: 'Cầu Thủ Thiêm', 1106232435: 'Cầu Thủ Thiêm', 321564421: 'Cầu Ba Son', 321564423: 'Cầu Ba Son' };
    for (const pier of (api?.piers || [])) {
      const k = String(pier.way);
      if (!want[k]) continue;
      (out.piersByWay[k] ||= []).push({ x: pier.x, z: pier.z, top: pier.top, bottom: pier.bottom, radius: pier.radius, water: pier.water });
    }
    out.roads = {};
    const g = window.ROAD_GRAPH_31;
    for (const r of g.roads) if (want[r.id]) out.roads[r.id] = { name: r.name, cls: r.elevationClass, sig: r.signature, elev: r.elevation || null };
    return out;
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 12000));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
