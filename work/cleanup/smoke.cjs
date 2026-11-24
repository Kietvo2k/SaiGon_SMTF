// Smoke: open the two entry URLs, report console errors and HTTP >=400 responses.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8879';
const { chromium } = require(PW);

const urls = [
  `http://127.0.0.1:${PORT}/hcmc-poc/`,
  `http://127.0.0.1:${PORT}/hcmc-poc/webgpu-materials-24.html?v=31a`,
  `http://127.0.0.1:${PORT}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview`,
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const out = [];
  for (const url of urls) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const bad = [];
    const consoleErrors = [];
    ctx.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(6000);
    } catch (e) { consoleErrors.push('goto: ' + e.message); }
    out.push({ url, finalUrl: page.url(), badResponses: [...new Set(bad)], consoleErrors: [...new Set(consoleErrors)].slice(0, 20) });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
  const fail = out.some(o => o.badResponses.length || o.consoleErrors.length);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
