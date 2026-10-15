// QA T9b + M2a — app smart: khu Bắc cố định, panel Tham quan 5 góc, đèn + vùng camera, 0 chuỗi cấm;
// M2a: khóa 3 khu (nền xám, viền khu Bắc, 3 nhãn khóa, bấm nút khu khóa → thông báo, KHÔNG đổi khu),
// 0 nhà/cây/xe hiển thị có tâm ngoài khu Bắc, camera trong giới hạn, ≥ 60 xe quanh Hàng Xanh sau 60 s.
// Chạy: PORT=8841 node outputs/hcmc-poc/scripts/qa-north-32.cjs   (cần server tĩnh đang chạy)
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8841';
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
const LOCK_LABEL = '🔒 Khu vực đang khóa';

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
    await sleep(3000);

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
        vehicles: m.region?.vehicles ?? 0,
        lockLabels: [...document.querySelectorAll('#labels .lock-label')].map(e => e.textContent),
        overlay: !!m.lock32?.overlay,
        border: !!m.lock32?.border,
        cameraLimits: m.lock32?.cameraLimits || null,
        camera: m.lock32?.camera || null,
        smartRegion: m.lock32?.smartRegion || null,
        lockedButtons: [...document.querySelectorAll('#regionControl [data-region]')].filter(b => b.classList.contains('region-locked')).map(b => b.dataset.region)
      };
    });
    check(base.hasApp, 'window.__smartApp tồn tại');
    check(base.region === 'bac', `app smart ép khu bắc (dataset.region=${base.region})`);
    check(base.title === 'Khu Bắc', `tiêu đề panel = "Khu Bắc" (${base.title})`);
    check(base.views.length === 5 && EXPECT_TOUR.every(([k, l], i) => base.views[i] && base.views[i][0] === k && base.views[i][1] === l),
      `đúng 5 nút Tham quan khu Bắc (${base.views.map(v => v[0] + ':' + v[1]).join(', ')})`);
    check(base.hasToggle && !base.coneVisible, 'công tắc vùng quan sát camera tồn tại, mặc định tắt ở toàn cảnh');

    // M2a · A1/A2 — 3 khu khóa: nền xám + viền khu Bắc + 3 nhãn khóa.
    check(base.overlay, 'M2a: mesh nền xám 3 khu khóa tồn tại');
    check(base.border, 'M2a: viền sáng khu Bắc tồn tại');
    check(base.lockLabels.length === 3 && base.lockLabels.every(t => t.startsWith(LOCK_LABEL)),
      `M2a: đúng 3 nhãn "${LOCK_LABEL}" (${base.lockLabels.join(' | ')})`);
    const lockedSet = ['trung-tam', 'ven-song', 'nam'];
    check(lockedSet.every(id => base.lockedButtons.includes(id)) && !base.lockedButtons.includes('bac'),
      `M2a: 3 nút khu khóa được đánh dấu (+ Toàn bộ) (${base.lockedButtons.join(', ')})`);
    check(!!base.smartRegion && base.smartRegion.margin === 0, `M2a: sim khu Bắc margin=0 (${JSON.stringify(base.smartRegion)})`);

    // M2a · A3 — camera trong giới hạn khu Bắc + 400 m.
    const withinLimits = (camera, limits) => !!camera && !!limits &&
      camera.x >= limits.minX && camera.x <= limits.maxX && camera.z >= limits.minZ && camera.z <= limits.maxZ &&
      camera.distance >= limits.minDistance && camera.distance <= limits.maxDistance;
    check(withinLimits(base.camera, base.cameraLimits), `M2a: camera overview trong giới hạn (${JSON.stringify(base.camera)})`);

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
        dist: Math.round(Math.hypot(cam.x + 10, cam.z + 2450)),
        camera: m.lock32?.camera || null,
        cameraLimits: m.lock32?.cameraLimits || null
      };
    });
    check(hx.buildings > 0, `góc Hàng Xanh có công trình hiển thị (${hx.buildings})`);
    check(hx.vehicles > 0 && hx.active > 0, `góc Hàng Xanh có xe hiển thị (${hx.vehicles}/${hx.active})`);
    check(hx.coneVisible && hx.toggleOn, 'vùng quan sát camera bật ở góc cận cảnh');
    check(hx.dist < 400, `camera cận cảnh Hàng Xanh (~${hx.dist} m)`);
    check(withinLimits(hx.camera, hx.cameraLimits), `M2a: camera cận cảnh Hàng Xanh trong giới hạn (${JSON.stringify(hx.camera)})`);

    // M2a · A2 — bấm nút khu bị khóa: hiện thông báo "Khu vực đang khóa" và KHÔNG đổi khu.
    await page.evaluate(() => document.querySelector('#regionControl [data-region="trung-tam"]').click());
    await sleep(400);
    const locked = await page.evaluate(() => ({
      region: document.body.dataset.region,
      noticeHidden: document.querySelector('#regionNotice')?.hidden ?? true,
      notice: document.querySelector('#regionNotice')?.textContent || ''
    }));
    check(locked.region === 'bac', `M2a: bấm nút khu khóa không đổi khu (region=${locked.region})`);
    check(!locked.noticeHidden && locked.notice.includes(LOCK_LABEL), `M2a: thông báo khu khóa hiện ("${locked.notice.slice(0, 60)}")`);

    // M2a · D — số nhà/cây/xe ĐANG VẼ có tâm ngoài khu Bắc = 0 (bỏ qua signature).
    const audit = await page.evaluate(() => window.webgpuMaterials24.lock32.audit());
    check(audit.buildingsOutside === 0, `M2a: nhà hiển thị ngoài khu Bắc = 0 (shown ${audit.buildingsShown})`);
    check(audit.treesOutside === 0, `M2a: cây hiển thị ngoài khu Bắc = 0 (shown ${audit.treesShown})`);
    check(audit.vehiclesOutside === 0, `M2a: xe hiển thị ngoài khu Bắc = 0 (active ${audit.vehiclesActive})`);

    // M2a · C6/D — ban ngày, mật độ mặc định: ≥ 60 xe trong 300 m quanh Hàng Xanh sau 60 s.
    const hxTraffic = await page.evaluate(() => {
      const t = window.__smartApp.traffic;
      t.advance(60);
      const snap = t.snapshot(), poses = t.poses();
      let near = 0, active = 0;
      for (let i = 0; i < snap.active.length; i++) {
        if (!snap.active[i]) continue;
        active++;
        const x = poses[i * 5], z = poses[i * 5 + 2];
        if (Math.hypot(x - 0, z + 2485) <= 300) near++;
      }
      return { near, active };
    });
    check(hxTraffic.near >= 60, `M2a: ≥ 60 xe trong 300 m quanh Hàng Xanh sau 60 s (${hxTraffic.near}/${hxTraffic.active})`);

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
