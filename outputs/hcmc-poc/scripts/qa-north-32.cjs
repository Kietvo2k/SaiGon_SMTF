// QA T9b — app smart quanh Hàng Xanh: khu bắc cố định, panel Tham quan 5 góc khu Bắc, đèn + vùng camera, 0 chuỗi cấm.
// Chạy: PORT=8836 node outputs/hcmc-poc/scripts/qa-north-32.cjs   (cần server tĩnh đang chạy)
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8836';
const HOST = process.env.HOST || '127.0.0.1';
const URL_APP = process.env.APP_URL || `http://${HOST}:${PORT}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=overview`;
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPECT_TOUR = [
  ['hx', 'Ngã tư Hàng Xanh'],
  ['l81', 'Landmark 81'],
  ['csg', 'Cầu Sài Gòn'],
  ['ctn', 'Cầu Thị Nghè'],
  ['bac', 'Toàn khu Bắc']
];
const BANNED = ['giả lập', 'mô phỏng', 'minh họa', 'illustrative', 'simulated', 'demo', 'fake'];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  const failures = [];
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
  try {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    // Không truyền &region ⇒ app smart phải tự ép khu bắc.
    await page.goto(URL_APP, { waitUntil: 'load' });
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await page.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(2500);

    const base = await page.evaluate(() => {
      const m = window.webgpuMaterials24;
      return {
        hasApp: !!window.__smartApp,
        region: document.body.dataset.region,
        title: document.querySelector('#cityNav .nav-head h2')?.textContent || null,
        views: [...document.querySelectorAll('#cityNav .nav-views button')].map(b => [b.dataset.view, b.textContent]),
        hasToggle: !!document.querySelector('#coneToggle'),
        coneVisible: !!window.__smartApp?.modules?.signals?.coneVisible,
        coneCount: window.__smartApp?.modules?.signals?.coneCount ?? -1,
        buildings: m.region?.buildingsInRegion ?? 0,
        vehicles: m.region?.vehicles ?? 0
      };
    });
    check(base.hasApp, 'window.__smartApp tồn tại');
    check(base.region === 'bac', `app smart ép khu bắc (dataset.region=${base.region})`);
    check(base.title === 'Khu Bắc', `tiêu đề panel = "Khu Bắc" (${base.title})`);
    check(base.views.length === 5 && EXPECT_TOUR.every(([k, l], i) => base.views[i] && base.views[i][0] === k && base.views[i][1] === l),
      `đúng 5 nút Tham quan khu Bắc (${base.views.map(v => v[0] + ':' + v[1]).join(', ')})`);
    check(base.hasToggle && !base.coneVisible, 'công tắc vùng quan sát camera tồn tại, mặc định tắt ở toàn cảnh');

    // Góc Hàng Xanh: có nhà + có xe, bật vùng quan sát camera.
    await page.click('#cityNav .nav-views button[data-view="hx"]');
    await page.waitForFunction(() => {
      const a = window.__smartApp; if (!a) return false;
      const c = a.camera.position;
      return Math.hypot(c.x + 10, c.z + 2450) < 260;
    }, null, { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const hx = await page.evaluate(() => {
      const m = window.webgpuMaterials24, a = window.__smartApp;
      const cam = a.camera.position;
      return {
        buildings: m.region?.buildingsInRegion ?? 0,
        vehicles: m.region?.vehicles ?? 0,
        active: m.traffic?.active ?? 0,
        coneVisible: !!a.modules?.signals?.coneVisible,
        toggleOn: !!document.querySelector('#coneToggle')?.checked,
        dist: Math.round(Math.hypot(cam.x + 10, cam.z + 2450))
      };
    });
    check(hx.buildings > 0, `góc Hàng Xanh có công trình hiển thị (${hx.buildings})`);
    check(hx.vehicles > 0 && hx.active > 0, `góc Hàng Xanh có xe hiển thị (${hx.vehicles}/${hx.active})`);
    check(hx.coneVisible && hx.toggleOn, 'vùng quan sát camera bật ở góc cận cảnh');
    check(hx.dist < 400, `camera cận cảnh Hàng Xanh (~${hx.dist} m)`);
    const banned = await page.evaluate(banned => {
      const hits = [];
      const nodes = document.querySelectorAll('*');
      for (const el of nodes) {
        for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
          const v = el.getAttribute && el.getAttribute(attr);
          if (v) for (const b of banned) if (v.toLowerCase().includes(b)) hits.push(attr + ':' + b + ':' + v.slice(0, 40));
        }
      }
      const text = document.documentElement.textContent || '';
      for (const b of banned) if (text.toLowerCase().includes(b)) hits.push('text:' + b);
      return hits;
    }, BANNED);
    check(banned.length === 0, `0 chuỗi cấm trên UI (${banned.slice(0, 5).join(' | ')})`);

    await browser.close();
    if (errors.length) console.log('errors:', errors.slice(0, 6).join(' | '));
    if (failures.length) { console.log('FAILED:', failures.length); process.exit(1); }
    console.log('PASS qa-north-32');
  } catch (e) {
    console.error('FAIL', e.message);
    if (errors.length) console.log('errors:', errors.slice(0, 6).join(' | '));
    await browser.close().catch(() => {});
    process.exit(1);
  }
})();
