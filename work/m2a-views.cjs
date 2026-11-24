// M2a (không commit): xác nhận view=bac và view=hx thực sự khác camera + đo renderer.info mỗi khung.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8841/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    for (const view of ['bac', 'hx']) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      p.setDefaultTimeout(240000);
      await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
      await p.goto(BASE + `?v=32a&app=smart&view=${view}`, { waitUntil: 'load' });
      await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
      await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
      await sleep(5000);
      const out = await p.evaluate(() => {
        const a = window.__smartApp, c = a.camera.position, info = a.renderer.info.render;
        return { view: document.querySelector('#viewLabel')?.textContent, cam: [Math.round(c.x), Math.round(c.y), Math.round(c.z)], calls: info.calls, triangles: info.triangles, autoReset: a.renderer.info.autoReset };
      });
      console.log(view, JSON.stringify(out));
      await ctx.close();
    }
  } catch (e) { console.error('FAIL', e.message); }
  finally { await browser.close().catch(() => {}); }
})();
