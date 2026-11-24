'use strict';
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { sessionStorage.setItem('probe_marker', 'v1'); window.__probeMarker = 'ran'; } catch (e) { window.__probeErr = String(e); } });
  // Cách 2: gán thẳng qua context trước khi điều hướng
  await page.goto('http://127.0.0.1:5173/index-officer.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => sessionStorage.setItem('probe_marker', 'v2'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    marker: sessionStorage.getItem('probe_marker'),
    keys: Object.keys(sessionStorage),
    markerRan: window.__probeMarker || null, err: window.__probeErr || null,
    login: !!document.querySelector('.login'), app: !!document.querySelector('.app')
  }))));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });