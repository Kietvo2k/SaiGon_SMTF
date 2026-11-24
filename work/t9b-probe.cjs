// T9b chẩn đoán (không commit): so classic region=bac vs app=smart, cùng preset overview.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8836/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });

async function shoot(browser, label, url, out) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto(url, { waitUntil: 'load' });
  await ready(p);
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2500);
  const diag = await p.evaluate(() => {
    const m = window.webgpuMaterials24 || {};
    const d = m.density || {};
    const c = d.counts || {};
    const t = m.traffic || {};
    const app = window.__smartApp || null;
    let simActive = null, simTotal = null, region = null, vehInRegion = null;
    if (app) { const s = app.traffic.sim.stats(); simActive = s.active; simTotal = s.total; region = app.traffic.getRegion?.(); }
    return {
      label: document.body.dataset.region,
      densityLevel: document.body.dataset.densityLevel,
      densityBuildings: document.body.dataset.densityBuildings,
      densityVehicles: document.body.dataset.densityVehicles,
      regionId: d.region?.id, regionLabel: d.region?.label,
      buildings: c.buildings, buildingsInRegion: d.region?.buildingsInRegion,
      trees: c.trees, vehicles: c.vehicles, vehiclesVia: d.vehiclesVia,
      trafficActive: t.active, trafficTotal: t.total,
      simActive, simTotal, region: region ? { id: region.id, eligible: region.eligible } : null,
      hasApp: !!app,
    };
  });
  await p.screenshot({ path: out });
  console.log(label, JSON.stringify(diag));
  if (errs.length) console.log(label, 'errors:', errs.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    await shoot(browser, 'CLASSIC', BASE + '?v=31a&region=bac&view=overview', 'work/t9b-classic-same-view.png');
    await shoot(browser, 'SMART', BASE + '?v=32a&app=smart&view=overview', 'work/t9b-overview.png');
  } finally { await browser.close(); }
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
