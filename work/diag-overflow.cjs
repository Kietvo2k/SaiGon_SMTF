const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('https://saigon-smtf-submit.vercel.app/', { waitUntil: 'load' });
  const wide = await page.evaluate(() => {
    const out = [];
    const docW = document.documentElement.scrollWidth;
    for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push({ tag: el.tagName, cls: el.className && String(el.className).slice(0, 40), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
    return { docW, inner: window.innerWidth, wide: out.slice(0, 14) };
  });
  console.log(JSON.stringify(wide, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
