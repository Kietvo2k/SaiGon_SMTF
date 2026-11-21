const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const [name, viewport] of [['1440', { width: 1440, height: 900 }], ['768', { width: 768, height: 1024 }], ['390', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('https://saigon-smtf-submit.vercel.app/', { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `work/smtf-agent/demo2-landing-v3-${name}.png`, fullPage: name === '1440' });
    const state = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent ?? null,
      heroImg: !!document.querySelector('.hero-bg'),
      steps: document.querySelectorAll('.steps li').length,
      views: document.querySelectorAll('.view').length,
      consoleCards: document.querySelectorAll('.console-card').length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }));
    console.log(name, JSON.stringify({ ...state, errors: errors.slice(0, 3) }));
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
