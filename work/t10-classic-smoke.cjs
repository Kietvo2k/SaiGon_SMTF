// Smoke 31A cổ điển: không có app=smart thì phải y nguyên (không nạp module smart, không lỗi).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:8837/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(240000);
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  await p.goto(BASE + '?v=31a&view=overview', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await sleep(2500);
  const info = await p.evaluate(() => ({
    smartApp: typeof window.__smartApp,
    smartCapture: typeof window.__smartCapture,
    state: window.webgpuMaterials24?.state,
    appVer: document.querySelector('html')?.getAttribute('data-app-version') || null
  }));
  console.log('CLASSIC', JSON.stringify(info), 'errors=', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (errors.length || info.smartApp !== 'undefined') process.exit(1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
