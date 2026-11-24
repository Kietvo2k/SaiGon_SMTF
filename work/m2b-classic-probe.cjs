// M2b: kiem tra landmark-detail.js co chay trong index.html khong (loi, bien D, lmMesh). Khong commit.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  const msgs = [];
  p.on('console', m => { if (/error|warn/i.test(m.type())) msgs.push(m.type() + ': ' + m.text().slice(0, 220)); });
  p.on('pageerror', e => msgs.push('pageerror: ' + String(e.message).slice(0, 220)));
  p.on('requestfailed', r => msgs.push('reqfail: ' + r.url().slice(-60)));
  await p.goto('http://127.0.0.1:8853/hcmc-poc/index.html', { waitUntil: 'load' });
  await sleep(45000);
  const probe = await p.evaluate(() => ({ D: typeof D, lmParts: typeof lmParts, presets: typeof presets, xyz: typeof xyz, T: typeof T, tmp: typeof tmp, addVisualControl: typeof addVisualControl, $: typeof $, scene: typeof scene }));
  console.log(JSON.stringify(probe));
  console.log(msgs.slice(0, 12).join('\n'));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
