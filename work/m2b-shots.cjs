// M2b: chup anh ra signature khu Bac trong app=smart (khong commit).
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8842/hcmc-poc/webgpu-materials-24.html';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p.goto(BASE + '?v=32a&app=smart&view=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(3000);
  return { ctx, p };
}

const readState = p => p.evaluate(() => {
  const c = window.__smartApp.camera;
  const dir = c.getWorldDirection(c.position.clone());
  const t = -c.position.y / dir.y;
  const tx = c.position.x + dir.x * t, tz = c.position.z + dir.z * t;
  const dist = Math.hypot(c.position.x - tx, c.position.y, c.position.z - tz);
  const az = Math.atan2(c.position.x - tx, c.position.z - tz);
  const polar = Math.acos((c.position.y) / dist);
  return { cam: [c.position.x, c.position.y, c.position.z], target: [tx, tz], dist, az, polar };
});

async function panTo(p, x, z) {
  for (let it = 0; it < 12; it++) {
    const s = await readState(p);
    let fx = s.target[0] - s.cam[0], fz = s.target[1] - s.cam[2];
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const dx = x - s.target[0], dz = z - s.target[1];
    const nf = dx * fx + dz * fz, nr = dx * rx + dz * rz;
    if (Math.hypot(dx, dz) < 12) return;
    const stride = Math.max(18, Math.min(240, s.dist * 0.055));
    const keys = [];
    let a = Math.round(Math.abs(nf) / stride), b = Math.round(Math.abs(nr) / stride);
    for (let i = 0; i < Math.min(a, 60); i++) keys.push(nf > 0 ? 'w' : 's');
    for (let i = 0; i < Math.min(b, 60); i++) keys.push(nr > 0 ? 'd' : 'a');
    if (!keys.length) return;
    await p.evaluate(keys => { for (const k of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); }, keys);
    await sleep(600);
  }
}

async function zoomTo(p, dist) {
  const s = await readState(p);
  if (s.dist / dist > 1) {
    const n = Math.min(40, Math.ceil(Math.log(dist / s.dist) / Math.log(0.88)));
    await p.evaluate(n => { for (let i = 0; i < n; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' })); }, n);
  } else {
    const n = Math.min(40, Math.ceil(Math.log(dist / s.dist) / Math.log(1.14)));
    await p.evaluate(n => { for (let i = 0; i < n; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' })); }, n);
  }
  await sleep(700);
}

async function orbitTo(p, az, polar) {
  const s = await readState(p);
  const dx = -(az - s.az) / 0.004, dy = (polar - s.polar) / 0.003;
  await p.mouse.move(800, 450);
  await p.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) await p.mouse.move(800 + dx * i / steps, 450 + dy * i / steps);
  await p.mouse.up();
  await sleep(900);
}

async function pose(p, { x, z, dist, az, polar }) {
  await p.evaluate(() => window.webgpuMaterials24.selectView('bac')).catch(() => {});
  await sleep(3200);
  await panTo(p, x, z);
  await zoomTo(p, dist);
  await panTo(p, x, z);
  if (az !== undefined) await orbitTo(p, az, polar);
  await sleep(1200);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const { ctx, p } = await open(browser);
  const fs = require('fs');
  const shots = JSON.parse(fs.readFileSync(process.argv[2] || 'work/m2b-shots.json', 'utf8'));
  for (const s of shots) {
    await pose(p, s);
    const st = await readState(p);
    console.log(s.name, 'target=', st.target.map(v => Math.round(v)), 'dist=', Math.round(st.dist), 'camY=', Math.round(st.cam[1]), 'az=', st.az.toFixed(2), 'polar=', st.polar.toFixed(2));
    await p.screenshot({ path: s.file });
  }
  await ctx.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
