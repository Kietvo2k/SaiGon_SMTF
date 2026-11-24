const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8837/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(240000);
  p.on('console', m => { if (m.type() === 'error') console.log('PAGE-ERR', m.text()); });
  await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await sleep(2000);
  const out = await p.evaluate(async () => {
    const THREE = await import('./vendor/three186/three.webgpu.js');
    const app = window.__smartApp;
    const renderer = app.renderer;
    const rt = new THREE.WebGLRenderTarget(64, 64);
    const info = { texLen: rt.textures && rt.textures.length, tex0: !!(rt.textures && rt.textures[0]), isRT: !!rt.isRenderTargetTexture, isTex: !!(rt.textures && rt.textures[0] && rt.textures[0].isTexture), rendererType: renderer.constructor.name, hasAsync: typeof renderer.readRenderTargetPixelsAsync, hasSync: typeof renderer.readRenderTargetPixels };
    renderer.setRenderTarget(rt); renderer.render(app.scene, app.camera); renderer.setRenderTarget(null);
    const buf = new Uint8Array(64 * 64 * 4);
    try {
      const read = renderer.readRenderTargetPixelsAsync
        ? await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 64, 64, 0, 0)
        : (renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, buf), buf);
      info.readOk = true; info.bufType = read.constructor.name; info.bufLen = read.length; info.nonZero = read.some(v => v > 0);
    } catch (e) { info.readErr = String(e && e.message || e); }
    return info;
  });
  console.log('DIAG', JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
