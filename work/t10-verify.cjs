// T10 — kiểm render-to-texture: khung stream + ảnh bằng chứng (không commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8837/hcmc-poc/webgpu-materials-24.html';
const fs = require('fs');
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  p.on('console', m => { if (m.type() === 'error') console.log('PAGE-ERR', m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=overview', { waitUntil: 'load' });
  await ready(p);
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2500);
  await p.click('#cityNav .nav-views button[data-view="hx"]');
  await p.waitForFunction(() => { const c = window.__smartApp?.camera?.position; return c && Math.hypot(c.x + 10, c.z + 2450) < 260; }, null, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  await p.screenshot({ path: 'work/t10-hx-day.png' });

  const r = await p.evaluate(async () => {
    const c = window.__smartCapture;
    if (!c) return { err: 'no-capture' };
    const f = await c.captureFrame('CAM-HX-001');
    const rig = c.rigOf('CAM-HX-001');
    const api = window.__smartApp.traffic;
    const snap = api.snapshot(), poses = api.poses();
    const pick = { best: null };
    for (let i = 0; i < snap.active.length; i++) {
      if (!snap.active[i]) continue;
      const x = poses[i * 5], y = poses[i * 5 + 1], z = poses[i * 5 + 2];
      const dx = x - rig.cam.x, dz = z - rig.cam.z;
      const dist = Math.hypot(dx, dz);
      let off = Math.atan2(dz, dx) - rig.cam.yaw_deg * Math.PI / 180;
      while (off > Math.PI) off -= 2 * Math.PI; while (off < -Math.PI) off += 2 * Math.PI;
      const inFov = dist <= rig.cam.range_m && Math.abs(off) <= (rig.cam.fov_deg * Math.PI / 180) / 2;
      if (!inFov) continue;
      if (!pick.best || dist < pick.best.dist) pick.best = { i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), dist: +dist.toFixed(2), kind: snap.kind[i] };
    }
    const veh = pick.best || { x: -248, z: -2436 };
    const ev = await c.captureEvidence('CAM-HX-001', veh, 12.0);
    window.__t10 = { ev };
    return {
      ids: c.cameraIds(),
      frame: f ? { pref: f.jpeg.slice(0, 30), w: f.w, h: f.h, seq: f.seq } : null,
      latest: !!c.latestFrame('CAM-HX-001'),
      inFovVehicles: pick.best,
      ev: ev ? { before: !!ev.before, after: !!ev.after, plate: !!ev.plate_crop, afterPref: ev.after && ev.after.jpeg.slice(0, 30), px: ev.px } : null
    };
  });
  console.log('RESULT', JSON.stringify(r));

  const imgs = await p.evaluate(async () => {
    const ev = window.__t10.ev;
    // Ảnh đánh dấu vị trí chiếu của xe (kiểm bằng mắt) — chỉ để nghiệm thu, không commit.
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = ev.after.jpeg; });
    const cv = document.createElement('canvas'); cv.width = ev.after.w; cv.height = ev.after.h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    g.strokeStyle = '#ff2d2d'; g.lineWidth = 4;
    g.strokeRect(ev.px - 160, Math.round(ev.after.h * 0.62) - 60, 320, 120);
    return { before: ev.before && ev.before.jpeg, after: ev.after && ev.after.jpeg, plate: ev.plate_crop && ev.plate_crop.jpeg, marked: cv.toDataURL('image/jpeg', 0.85) };
  });
  for (const [k, v] of Object.entries(imgs)) {
    if (!v) { console.log('MISSING', k); continue; }
    const buf = Buffer.from(v.split(',')[1], 'base64');
    fs.writeFileSync(`work/t10-ev-${k}.jpg`, buf);
    console.log('SAVED', k, buf.length, 'bytes');
  }
  // khung CAM-HX-002 để đối chiếu
  const r2 = await p.evaluate(async () => {
    const c = window.__smartCapture;
    const f = await c.captureFrame('CAM-HX-002');
    return f ? { w: f.w, h: f.h, jpeg: f.jpeg } : null;
  });
  if (r2) { fs.writeFileSync('work/t10-ev-cam002.jpg', Buffer.from(r2.jpeg.split(',')[1], 'base64')); console.log('SAVED cam002', r2.w, r2.h); }

  const stream = await p.evaluate(async () => {
    const c = window.__smartCapture;
    c.setStream('CAM-HX-001', true, 2);
    const a = c.latestFrame('CAM-HX-001')?.seq ?? -1;
    await new Promise(r => setTimeout(r, 2300));
    const b = c.latestFrame('CAM-HX-001')?.seq ?? -1;
    c.setStream('CAM-HX-001', false);
    return { a, b, delta: b - a };
  });
  console.log('STREAM', JSON.stringify(stream));

  const sig = await p.evaluate(() => {
    const a = window.__smartApp, s = a.modules.signals;
    return { coneVisible: !!s?.coneVisible, coneCount: s?.coneCount, captureIds: a.modules.capture?.cameraIds?.() };
  });
  console.log('SIGNALS', JSON.stringify(sig));
  await browser.close();
})().catch(e => { console.error('ERR', e.message, e.stack); process.exit(2); });
