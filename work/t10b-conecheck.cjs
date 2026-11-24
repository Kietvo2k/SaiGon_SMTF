// So sanh khung chup khi bat/tat helper (non FOV, cot camera, bang dem nguoc, quang) - tien chi dung xac nhan.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const p = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto('http://127.0.0.1:8838/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=hx', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(3000);
  const res = await p.evaluate(async () => {
    const c = window.__smartCapture, s = window.__smartApp.modules.signals;
    s.setConeVisible(false);
    const f1 = await c.captureFrame('CAM-HX-001');
    s.setConeVisible(true);
    const f2 = await c.captureFrame('CAM-HX-001');
    s.setConeVisible(false);
    const stats = (jpeg) => {
      return new Promise(r => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
          const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          let cone = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i+2] > 200 && d[i+2] - d[i] > 70 && d[i+1] > 150) cone++;
          r({ conePx: cone });
        };
        img.src = jpeg;
      });
    };
    const a = await stats(f1.jpeg), b = await stats(f2.jpeg);
    return { off: a.conePx, on: b.conePx };
  });
  console.log(JSON.stringify(res));
  await browser.close();
})();
