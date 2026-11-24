// HK-FINALIZE: kiểm 404 nhẹ sau mỗi nhóm. Mở 3 URL, chờ 20 s mỗi URL, ghi response >= 400 và lỗi console.
// Chạy: PORT=8879 node work/cleanup/hk-404.cjs  (cần server tĩnh đang chạy ở PORT)
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8879';
const BASE = `http://127.0.0.1:${PORT}`;
const URLS = [
  `${BASE}/hcmc-poc/`,
  `${BASE}/hcmc-poc/webgpu-materials-24.html?v=31a`,
  `${BASE}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&region=bac`,
];
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const bad = [];
  const errs = [];
  for (const url of URLS) {
    const page = await context.newPage();
    page.on('response', r => { if (r.status() >= 400) bad.push({ page: url, status: r.status(), url: r.url() }); });
    page.on('requestfailed', r => bad.push({ page: url, status: 'failed', url: r.url(), err: r.failure() && r.failure().errorText }));
    page.on('console', m => { if (m.type() === 'error') errs.push({ page: url, text: m.text().slice(0, 300) }); });
    page.on('pageerror', e => errs.push({ page: url, pageerror: String(e.message || e).slice(0, 300) }));
    try { await page.goto(url, { waitUntil: 'load', timeout: 120000 }); } catch (e) { errs.push({ page: url, goto: String(e.message).slice(0, 200) }); }
    await sleep(20000);
    await page.close();
  }
  await browser.close();
  const notFound = bad.filter(b => b.status === 404);
  console.log(JSON.stringify({ http4xx5xx: bad.length, notFound404: notFound.length, consoleOrPageErrors: errs.length, bad: bad.slice(0, 40), errs: errs.slice(0, 20) }, null, 1));
  process.exit(bad.length === 0 ? 0 : 1);
})().catch(e => { console.error('HK404 FAIL', e); process.exit(2); });
