// QA T10b — ảnh bằng chứng camera Hàng Xanh (trình duyệt thật, WebGPU/WebGL theo máy).
// Kiểm: (1) khung stream hai camera: trời ở trên (15 % hàng trên/dưới), (2) mỗi khung chỉ có MỘT đầu đèn
// của nút giám sát và đúng một đèn sáng, (3) vạch dừng và đầu đèn của hướng giám sát nằm trong khung và
// projectToPixel32 khớp ma trận camera thật, (4) bằng chứng cảnh: xe đầu hàng chờ tại vạch dừng HX-01 khi
// đèn nhóm 0 đỏ — before/after/plate_crop qua captureEvidence, đèn sáng trong khung là đỏ.
// Đây KHÔNG phải ảnh vi phạm vượt đỏ (không sinh được vi phạm trong cửa sổ QA).
// Ảnh ghi vào OUT_DIR (mặc định work/): t10b-cam001.jpg, t10b-cam002.jpg, t10b-ev-before.jpg, t10b-ev-after.jpg, t10b-plate.jpg.
// Chạy: PORT=8838 node outputs/hcmc-poc/scripts/qa-capture-32.cjs   (cần server tĩnh đang chạy)
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8838';
const OUT = process.env.OUT_DIR || 'work';
const APP_URL = process.env.APP_URL || `http://127.0.0.1:${PORT}/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&region=bac`;
const EVIDENCE_TIMEOUT_MS = Number(process.env.EVIDENCE_TIMEOUT_MS || 420000);
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Vạch dừng (giữa làn tiếp cận) và tâm nút theo road-graph-31 + signal-plan-32 (đo trong T10b).
const TARGETS = [
  { id: 'CAM-HX-001', node: 'HX-01', osm: 366390689, group: 0, stop: [-236.4, -2453.5], nodeXZ: [-251.17, -2439.95] },
  { id: 'CAM-HX-002', node: 'HX-06', osm: 1497276515, group: 1, stop: [-15.2, -2442.1], nodeXZ: [-13.65, -2453.14] }
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  const failures = [];
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 200)));

  // Hướng ảnh: 15 % hàng trên (trời) phải sáng và thiên xanh hơn 15 % hàng dưới (mặt đường).
  const orientOf = jpeg => page.evaluate(async jpegUrl => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = jpegUrl; });
    const w = img.width, h = img.height, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    const rows = Math.round(h * 0.15);
    const band = (from, to) => {
      let lum = 0, blue = 0, n = 0;
      for (let y = from; y < to; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        blue += d[i + 2] - 0.5 * (d[i] + d[i + 1]);
        n++;
      }
      return { lum: +(lum / n).toFixed(2), blue: +(blue / n).toFixed(2) };
    };
    const top = band(0, rows), bottom = band(h - rows, h);
    return { w, h, top, bottom, skyTop: top.lum > bottom.lum + 2 && top.blue > bottom.blue };
  }, jpeg);

  try {
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto(APP_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
    await page.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
    await sleep(3000);
    check(await page.evaluate(() => !!window.__smartCapture && !!window.__smartApp), 'window.__smartCapture và __smartApp tồn tại');
    const backend = await page.evaluate(() => (window.__smartApp.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL'));
    console.log(`backend render: ${backend}`);
    const ids = await page.evaluate(() => window.__smartCapture.cameraIds());
    check(JSON.stringify([...ids].sort()) === JSON.stringify(TARGETS.map(t => t.id).sort()), `registry có đúng 2 camera HX (${ids.join(', ')})`);

    for (const t of TARGETS) {
      const jpeg = await page.evaluate(id => window.__smartCapture.captureFrame(id).then(f => f && f.jpeg), t.id);
      if (!jpeg) { check(false, `${t.id}: captureFrame trả null`); continue; }
      fs.writeFileSync(path.join(OUT, `t10b-${t.id === 'CAM-HX-001' ? 'cam001' : 'cam002'}.jpg`), Buffer.from(jpeg.split(',')[1], 'base64'));
      const o = await orientOf(jpeg);
      check(o.skyTop, `${t.id}: trời ở trên (hàng trên lum ${o.top.lum}/xanh ${o.top.blue}; hàng dưới lum ${o.bottom.lum}/xanh ${o.bottom.blue})`);

      const heads = await page.evaluate(id => window.__smartCapture.visibleHeadsOf(id), t.id);
      check(heads.length === 1 && heads[0].node_id === t.node && heads[0].group === t.group,
        `${t.id}: khung chỉ có 1 đầu đèn của ${t.node} nhóm ${t.group} (${JSON.stringify(heads)})`);
      check(heads.length === 1 && heads[0].lit.length === 1, `${t.id}: đúng 1 đèn sáng trong khung (${JSON.stringify(heads[0] && heads[0].lit)})`);

      const geo = await page.evaluate(async ({ id, stop, nodeXZ, node }) => {
        const mod = await import('/hcmc-poc/camera-capture-32.js?v=32a');
        const rig = window.__smartCapture.rigOf(id);
        const cam = rig.camera;
        cam.updateMatrixWorld(true);
        const V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
        const project = (x, y, z) => {
          const X = V[0] * x + V[4] * y + V[8] * z + V[12], Y = V[1] * x + V[5] * y + V[9] * z + V[13];
          const Z = V[2] * x + V[6] * y + V[10] * z + V[14], W = V[3] * x + V[7] * y + V[11] * z + V[15];
          const cx = P[0] * X + P[4] * Y + P[8] * Z + P[12] * W, cy = P[1] * X + P[5] * Y + P[9] * Z + P[13] * W, cw = P[3] * X + P[7] * Y + P[11] * Z + P[15] * W;
          return { nx: cx / cw, ny: cy / cw, front: cw > 0 };
        };
        const inFrame = q => q.front && Math.abs(q.nx) <= 1 && Math.abs(q.ny) <= 1;
        const s = project(stop[0], mod.VEHICLE_Y_32, stop[1]);
        const h = project(nodeXZ[0], 5.0, nodeXZ[1]);
        const pix = mod.projectToPixel32(stop[0], stop[1], rig.cam, 1280, 720);
        const px = (s.nx * 0.5 + 0.5) * 1280, py = (0.5 - s.ny * 0.5) * 720;
        // tấm vạch dừng (đã vẽ trong scene) gần điểm dừng của hướng giám sát nhất
        let strip = null, bd = 1e9;
        window.__smartApp.scene.traverse(o => { if (o.userData && o.userData.stopLine === node) { const d = Math.hypot(o.position.x - stop[0], o.position.z - stop[1]); if (d < bd) { bd = d; strip = o; } } });
        const sq = strip ? project(strip.position.x, strip.position.y, strip.position.z) : null;
        return { stopIn: inFrame(s), stopNdc: [+s.nx.toFixed(2), +s.ny.toFixed(2)], headIn: inFrame(h), headNdc: [+h.nx.toFixed(2), +h.ny.toFixed(2)], err: +Math.hypot(px - pix.px, py - pix.py).toFixed(2), stripDist: strip ? +bd.toFixed(1) : null, stripIn: !!sq && inFrame(sq) };
      }, { id: t.id, stop: t.stop, nodeXZ: t.nodeXZ, node: t.node });
      check(geo.stripDist !== null && geo.stripDist < 3, `${t.id}: có vạch dừng ${t.node} vẽ trong scene gần điểm dừng (lệch ${geo.stripDist} m)`);
      check(geo.stripIn, `${t.id}: tâm vạch dừng nằm trong khung`);
      check(geo.stopIn, `${t.id}: vạch dừng trong khung (ndc ${geo.stopNdc})`);
      check(geo.headIn, `${t.id}: đầu đèn nhóm ${t.group} trong khung (ndc ${geo.headNdc})`);
      check(geo.err < 2, `${t.id}: projectToPixel32 khớp ma trận camera thật (lệch ${geo.err} px)`);
    }

    // Bằng chứng cảnh: xe đầu hàng chờ tại vạch dừng nhánh HX-01 (cạnh 8493, nhóm 0) khi đèn nhóm 0 đỏ.
    // Đây KHÔNG phải vi phạm vượt đỏ: vi phạm sinh tự nhiên không xảy ra trong cửa sổ QA (xem báo cáo).
    await page.click('[data-speed="10"]').catch(() => {});
    let pick = null;
    const t0 = Date.now();
    while (Date.now() - t0 < EVIDENCE_TIMEOUT_MS && !pick) {
      pick = await page.evaluate(async () => {
        const app = window.__smartApp, sim = app.traffic.sim, net = app.traffic.net, lanes = net.lanes;
        const hx1 = net.G.nodes.findIndex(n => n.id === 366390689);
        const t = sim.counters.t;
        const g0 = app.controller.stateOf(hx1, t).phases.find(p => p.group === 0);
        if (!g0 || g0.phase !== 'red') return null;
        let best = -1, bestS = -1;
        for (let i = 0; i < sim.N; i++) {
          if (!sim.active[i]) continue;
          const l = sim.lane[i];
          if (lanes.edge[l] !== 8493 || lanes.to[l] !== hx1) continue;
          const stop = lanes.length[l] - net.Rz[hx1];
          if (sim.s[i] <= stop + 1 && sim.s[i] > bestS && sim.s[i] > stop - 12) { best = i; bestS = sim.s[i]; }
        }
        if (best < 0) return null;
        const l = sim.lane[best], c = net.E[lanes.edge[l]].c, n = c.length / 2, k = sim.s[best] / Math.max(0.01, lanes.length[l]);
        const pose = { x: c[0] + (c[n * 2 - 2] - c[0]) * k, z: c[1] + (c[n * 2 - 1] - c[1]) * k };
        const mod = await import('/hcmc-poc/camera-capture-32.js?v=32a');
        const rig = window.__smartCapture.rigOf('CAM-HX-001');
        const pix = mod.projectToPixel32(pose.x, pose.z, rig.cam, 1280, 720);
        return { i: best, s: +sim.s[best].toFixed(1), stopS: +(lanes.length[l] - net.Rz[hx1]).toFixed(1), t: +t.toFixed(1), pose, inFrame: pix.px >= 0 && pix.px <= 1280 && pix.py >= 0 && pix.py <= 720 && pix.distance_m <= 60, phase: g0.phase };
      });
      if (!pick) await sleep(500);
    }
    check(!!pick, `có xe chờ tại vạch dừng HX-01 khi đèn nhóm 0 đỏ (${Math.round((Date.now() - t0) / 1000)} s)`);
    if (pick) {
      check(pick.inFrame, `xe chờ nằm trong khung CAM-HX-001 (s=${pick.s}, vạch=${pick.stopS}, t_sim=${pick.t})`);
      const ev = await page.evaluate(async pk => {
        const cap = window.__smartCapture;
        const before = cap.latestFrame('CAM-HX-001');
        const r = await cap.captureEvidence('CAM-HX-001', pk.pose, pk.t, before);
        return { before: r.before && r.before.jpeg, after: r.after && r.after.jpeg, plate: r.plate_crop && r.plate_crop.jpeg, heads: cap.visibleHeadsOf('CAM-HX-001') };
      }, pick);
      check(!!(ev.before && ev.after && ev.plate), 'bằng chứng đủ before/after/plate_crop');
      if (ev.before && ev.after && ev.plate) {
        fs.writeFileSync(path.join(OUT, 't10b-ev-before.jpg'), Buffer.from(ev.before.split(',')[1], 'base64'));
        fs.writeFileSync(path.join(OUT, 't10b-ev-after.jpg'), Buffer.from(ev.after.split(',')[1], 'base64'));
        fs.writeFileSync(path.join(OUT, 't10b-plate.jpg'), Buffer.from(ev.plate.split(',')[1], 'base64'));
        const oa = await orientOf(ev.after);
        check(oa.skyTop, `ảnh after: trời ở trên (hàng trên lum ${oa.top.lum}; hàng dưới lum ${oa.bottom.lum})`);
      }
      check(ev.heads.length === 1 && ev.heads[0].node_id === 'HX-01' && ev.heads[0].group === 0, `bằng chứng: khung chỉ có đầu đèn HX-01 nhóm 0 (${JSON.stringify(ev.heads)})`);
      check(ev.heads.length === 1 && ev.heads[0].lit.length === 1 && ev.heads[0].lit[0] === 'red', `bằng chứng: đèn sáng là đỏ đúng pha nhóm 0 (${JSON.stringify(ev.heads[0] && ev.heads[0].lit)})`);
    }
    if (errors.length) console.log('pageerror:', errors.slice(0, 5).join(' | '));
  } catch (e) {
    check(false, `QA lỗi: ${String(e && e.message || e).slice(0, 300)}`);
  } finally {
    await browser.close();
  }
  if (failures.length) { console.log(`FAILED ${failures.length}`); process.exit(1); }
  console.log('PASS qa-capture-32');
})();
