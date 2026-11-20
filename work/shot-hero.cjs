// shot-hero.cjs — chụp ảnh minh họa landing từ CHÍNH bản build mới (bản trình diễn v2 P3):
// mở 3D local, đi tới góc chuẩn Bac-02, bật bản đồ nhiệt + dòng xe theo chiều để ảnh sống,
// xuất JPEG cho landing (web/public/submit-city.jpg).
const { writeFileSync, mkdirSync } = require('node:fs');
const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');

const BASE = process.argv[2] || 'http://127.0.0.1:8890';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE + '/hcmc-poc/?backend=webgl&demo=vercel', { waitUntil: 'load' });
  await page.waitForSelector('#loading.done', { timeout: 95000 });
  // tới nút Bac-02 (góc chuẩn), bật bản đồ nhiệt + dòng xe theo chiều để ảnh có lớp sống.
  await page.evaluate(async () => {
    const app = window.__smartApp;
    const select = document.querySelector('select#submit-junction');
    if (select) {
      select.value = 'Bac-02';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1500));
      document.querySelector('[data-standard]')?.click();
    }
    document.querySelector('#heatToggle32')?.click();
    document.querySelector('#flowToggle32')?.click();
    // chờ chút cho lớp nhiệt/dòng xe tô màu lần đầu
    await new Promise(r => setTimeout(r, 4000));
  });
  await page.waitForTimeout(2000);
  mkdirSync('outputs/smart-traffic/web/public', { recursive: true });
  await page.screenshot({ path: 'outputs/smart-traffic/web/public/submit-city.jpg', type: 'jpeg', quality: 82 });
  const bytes = writeFileSync ? null : null; void bytes;
  console.log('Đã chụp outputs/smart-traffic/web/public/submit-city.jpg');
  await browser.close();
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
