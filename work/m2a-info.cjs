// M2a (không commit): đo renderer.info (draw calls, tam giác) + số mesh + mật độ ở góc "Toàn khu Bắc" và "Ngã tư Hàng Xanh".
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || '8841';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function measure(browser, pageName, view) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  const url = `http://${HOST}:${PORT}/hcmc-poc/${pageName}?v=32a&app=smart&view=overview`;
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(4000);
  if (view !== 'overview') {
    await p.click(`#cityNav .nav-views button[data-view="${view}"]`);
    await sleep(6000);
  }
  const out = await p.evaluate(() => new Promise(resolve => {
    const scene = window.__smartApp.scene;
    let meshes = 0; scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible !== false) meshes++; });
    const calls = [], tris = [];
    let n = 0;
    const tick = () => {
      const info = window.__smartApp.renderer.info.render;
      calls.push(info.calls); tris.push(info.triangles);
      if (++n >= 60) return resolve({ calls, tris, meshes, label: document.querySelector('#viewLabel')?.textContent, density: window.webgpuMaterials24.density?.counts || null, region: window.webgpuMaterials24.region?.buildingsInRegion ?? null });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  await ctx.close();
  const mn = a => Math.min(...a);
  return { label: out.label, calls: median(out.calls), callsMin: mn(out.calls), triangles: median(out.tris), trianglesMin: mn(out.tris), mesh: out.meshes, density: out.density, buildings: out.region };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    const result = {};
    for (const [label, pageName] of [['after', 'webgpu-materials-24.html'], ['before', 'tmp-before-24.html']]) {
      result[label] = {};
      for (const view of ['bac', 'hx']) {
        result[label][view] = await measure(browser, pageName, view);
        console.log(label, view, JSON.stringify(result[label][view]));
      }
    }
    console.log('JSON ' + JSON.stringify(result));
  } catch (e) { console.error('FAIL', e.message); }
  finally { await browser.close().catch(() => {}); }
})();
