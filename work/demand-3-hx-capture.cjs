// DEMAND-3: ảnh khu Hàng Xanh lúc 17:30 (dùng cách chụp Chromium trong qa-north-32.cjs).
// Script tạm trong work/ (không commit). Chạy: PORT=8831 node work/demand-3-hx-capture.cjs
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8831';
const HOST = process.env.HOST || '127.0.0.1';
const URL_APP = `http://${HOST}:${PORT}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=hx`;
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  try {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto(URL_APP, { waitUntil: 'load' });
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await page.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(2500);

    // Đặt đồng hồ 17:30 (golden, tỉ lệ xe 100 %) rồi tua sim thật 300 s để dòng xe dựng lên.
    const placed = await page.evaluate(() => {
      const clock = window.__smartApp?.modules?.clock;
      if (!clock) return { ok: false, why: 'no clock module' };
      const ok = clock.goTo(17, 30);
      return { ok, label: clock.clock().label };
    });
    if (!placed.ok) throw new Error('clock.goTo(17,30) không chạy: ' + placed.why);
    await page.evaluate(() => window.__smartApp.traffic.fastForward(300));
    for (let k = 0; k < 30; k++) {
      const rem = await page.evaluate(() => window.__smartApp.traffic.ffRemaining());
      if (rem <= 0) break;
      await sleep(1000);
    }
    await sleep(1500);

    // Góc Hàng Xanh: chọn nút tour hx rồi chờ camera tới nơi.
    await page.click('#cityNav .nav-views button[data-view="hx"]');
    await page.waitForFunction(() => {
      const a = window.__smartApp; if (!a) return false;
      const c = a.camera.position;
      return Math.hypot(c.x + 10, c.z + 2450) < 260;
    }, null, { timeout: 30000 }).catch(() => {});
    await sleep(2000);

    const info = await page.evaluate(() => {
      const m = window.webgpuMaterials24, a = window.__smartApp;
      const t = a.traffic;
      const snap = t.snapshot(), poses = t.poses();
      let near = 0, active = 0;
      for (let i = 0; i < snap.active.length; i++) {
        if (!snap.active[i]) continue;
        active++;
        const x = poses[i * 5], z = poses[i * 5 + 2];
        if (Math.hypot(x - 0, z + 2485) <= 300) near++;
      }
      return { label: a.modules.clock.clock().label, near, active };
    });
    console.log(`HX 17:30 — đồng hồ ${info.label}, ${info.near} xe trong 300 m quanh Hàng Xanh (${info.active} xe đang chạy)`);

    await page.screenshot({ path: 'work/demand-3-hx.png' });
    console.log('PASS ảnh: work/demand-3-hx.png');
    await browser.close();
  } catch (e) {
    console.error('FAIL', e.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
