// T10b - chup anh nghiem thu (khong commit): kiem tra huong khung (troi tren), den, xe, helper.
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = process.env.PORT || '8838';
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}/hcmc-poc/webgpu-materials-24.html`;
const fs = require('fs');
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = p => p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });

// Do 15% hang tren / duoi cua khong gian anh (ImageData RGBA).
const bandStats = `((buf, w, h, band) => {
  const rows = Math.max(1, Math.round(h * band));
  const st = (from, to) => { let lum = 0, blue = 0, n = 0;
    for (let y = from; y < to; y++) for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4, r = buf[i], g = buf[i+1], b = buf[i+2];
      lum += 0.2126*r + 0.7152*g + 0.0722*b; blue += b - 0.5*(r+g); n++;
    }
    return { lum: +(lum/n).toFixed(2), blue: +(blue/n).toFixed(2) };
  };
  return { top: st(0, rows), bottom: st(h-rows, h), rows };
})`;

async function measure(page, dataUrl) {
  return page.evaluate(async ({ dataUrl, src }) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const stats = src(d, cv.width, cv.height, 0.15);
    // dem pixel "troi xanh" vung tren va "duong toi" vung duoi
    const h = cv.height, w = cv.width, rows = stats.rows;
    let topSky = 0, bottomRoad = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4; const r = d[i], gg = d[i+1], b = d[i+2];
      if (b > r + 12 && gg > r) topSky++;
    }
    for (let y = h - rows; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4;
      if (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2] < 90) bottomRoad++;
    }
    return { w: cv.width, h: cv.height, stats, topSkyFrac: +(topSky / (rows*w)).toFixed(3), bottomRoadFrac: +(bottomRoad / (rows*w)).toFixed(3) };
  }, { dataUrl, src: null, fn: null }).catch(() => null);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  const fails = [];
  const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails.push(label); };
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=hx', { waitUntil: 'load' });
  await ready(p);
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(3500);
  check(await p.evaluate(() => !!window.__smartCapture), 'window.__smartCapture ton tai');
  check(await p.evaluate(() => !!window.__smartApp?.modules?.signals), 'module signals ton tai');

  const ids = await p.evaluate(() => window.__smartCapture.cameraIds());
  console.log('camera ids', JSON.stringify(ids));
  check(ids.length === 2, '2 camera');

  const out = {};
  for (const id of ids) {
    // stream frame
    const shot = await p.evaluate(async (id) => {
      const c = window.__smartCapture;
      const f = await c.captureFrame(id);
      return f ? { jpeg: f.jpeg, w: f.w, h: f.h } : null;
    }, id);
    if (!shot) { check(false, `${id} captureFrame`); continue; }
    fs.writeFileSync(`work/t10b-${id === 'CAM-HX-001' ? 'cam001' : 'cam002'}.jpg`, Buffer.from(shot.jpeg.split(',')[1], 'base64'));
    const m = await p.evaluate(async (jpeg) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = jpeg; });
      const w = img.width, h = img.height;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      const rows = Math.round(h * 0.15);
      const st = (from, to) => { let lum = 0, blue = 0, n = 0;
        for (let y = from; y < to; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4; const r = d[i], gg = d[i+1], b = d[i+2]; lum += 0.2126*r+0.7152*gg+0.0722*b; blue += b - 0.5*(r+gg); n++; }
        return { lum: +(lum/n).toFixed(2), blue: +(blue/n).toFixed(2) };
      };
      const stats = { top: st(0, rows), bottom: st(h-rows, h), rows };
      let topSky = 0, bottomDark = 0, redTop = 0, greenTop = 0, cyanTop = 0, blueTop = 0;
      const px = rows * w;
      for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4; const r = d[i], g = d[i+1], b = d[i+2];
        if (b > r + 12 && g > r) topSky++;
        if (b > 120 && b > r + 40 && g > r + 20) cyanTop++;
        if (r > 120 && r > g + 60 && r > b + 60) redTop++;
        if (g > 100 && g > r + 40 && g > b + 40) greenTop++;
        if (b > 100 && b > g + 20) blueTop++;
      }
      for (let y = h - rows; y < h; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4; if (0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2] < 90) bottomDark++; }
      return { w, h, stats, topSkyFrac: +(topSky/px).toFixed(3), bottomDarkFrac: +(bottomDark/px).toFixed(3), redTop, greenTop, cyanTop, blueTop };
    }, shot.jpeg);
    console.log(`${id} frame`, JSON.stringify(m));
    check(m.stats.top.lum > m.stats.bottom.lum + 2, `${id}: bang tren sang hon bang duoi (${m.stats.top.lum} > ${m.stats.bottom.lum})`);
    check(m.stats.top.blue > m.stats.bottom.blue, `${id}: bang tren thien xanh hon (${m.stats.top.blue} > ${m.stats.bottom.blue})`);
    check(m.topSkyFrac > 0.1, `${id}: co vung troi xanh o tren (${(m.topSkyFrac*100).toFixed(1)}%)`);
    check(m.bottomDarkFrac > 0.1, `${id}: co mat duong toi o duoi (${(m.bottomDarkFrac*100).toFixed(1)}%)`);
    out[id] = m;
  }

  // Ban chay cua app: cam 001 qua nón FOV
  await p.click('#cityNav .nav-views button[data-view="hx"]').catch(() => {});
  await sleep(3000);
  await p.screenshot({ path: 'work/t10b-hx-day.png' });

  await browser.close();
  if (errors.length) console.log('errors:', errors.slice(0, 6).join(' | '));
  if (fails.length) { console.log('FAILED', fails.length); process.exit(1); }
  console.log('PASS t10b-shots');
})();
