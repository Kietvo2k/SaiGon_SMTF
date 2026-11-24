// M2a (không commit): kiểm 2D phủ đa giác nền xám — điểm trong khu khóa có nằm trong tam giác nền xám không.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  try {
    await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
    await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(3000);
    const out = await p.evaluate(() => {
      let overlay = null; const scene = window.__smartApp.scene;
      scene.traverse(o => { if (o.name && o.name.indexOf('nền xám 3 khu') >= 0) overlay = o; });
      if (!overlay) return { error: 'no overlay' };
      const pos = overlay.geometry.attributes.position.array, n = pos.length / 9;
      const inside = (x, z) => {
        for (let t = 0; t < n; t++) {
          const o = t * 9, ax = pos[o], az = pos[o + 2], bx = pos[o + 3], bz = pos[o + 5], cx = pos[o + 6], cz = pos[o + 8];
          const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
          const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
          const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
          const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), posv = (d1 > 0) || (d2 > 0) || (d3 > 0);
          if (!(neg && posv)) return true;
        }
        return false;
      };
      const pts = [[-300, 100], [-500, -1500], [700, -300], [900, -700], [-200, 2000], [-1000, 1000], [700, -2200], [1400, -735], [-1860, 770], [50, 2435]];
      return { triangles: n, results: pts.map(([x, z]) => ({ x, z, covered: inside(x, z) })) };
    });
    console.log(JSON.stringify(out));
  } catch (e) { console.error('FAIL', e.message); }
  finally { await browser.close().catch(() => {}); }
})();
