// Định danh đối tượng 3D theo pixel: ray-OBB dựng tay (không cần THREE global).
const PW = 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const poseJson = process.argv[2] || '{"x":1124,"z":-1768,"dist":520,"az":2.4,"polar":0.55}';
const grid = JSON.parse(process.argv[3] || '[{"x":630,"y":330,"label":"obj"}]');

const INPAGE = `
window.__m2bIdent = (cam, W, H, pts) => {
  const A = (m, v) => ({ x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * v.w, y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * v.w, z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * v.w, w: m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * v.w });
  const mul = (a, b) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
  // ma trận nghịch đảo 4x4 (Gauss-Jordan)
  const inv4 = m => {
    const a = m.slice(), r = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    for (let c = 0; c < 4; c++) {
      let p = c; for (let i = c + 1; i < 4; i++) if (Math.abs(a[i * 4 + c]) > Math.abs(a[p * 4 + c])) p = i;
      if (Math.abs(a[p * 4 + c]) < 1e-12) return null;
      if (p !== c) for (let k = 0; k < 4; k++) { const t = a[c * 4 + k]; a[c * 4 + k] = a[p * 4 + k]; a[p * 4 + k] = t; const u = r[c * 4 + k]; r[c * 4 + k] = r[p * 4 + k]; r[p * 4 + k] = u; }
      const d = a[c * 4 + c]; for (let k = 0; k < 4; k++) { a[c * 4 + k] /= d; r[c * 4 + k] /= d; }
      for (let i = 0; i < 4; i++) if (i !== c) { const f = a[i * 4 + c]; if (!f) continue; for (let k = 0; k < 4; k++) { a[i * 4 + k] -= f * a[c * 4 + k]; r[i * 4 + k] -= f * r[c * 4 + k]; } }
    }
    return r;
  };
  const scene = window.__smartApp.scene, camera = window.__smartApp.camera;
  const objects = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox; if (!bb) return;
    if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { const im = o.instanceMatrix.array.slice(i * 16, i * 16 + 16); objects.push({ name: o.name, inst: i, m: mul(o.matrixWorld.elements, im), bb: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z] }); } }
    else objects.push({ name: o.name, inst: -1, m: o.matrixWorld.elements.slice(), bb: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z] });
  });
  const out = [];
  for (const p of pts) {
    const ndc = { x: p.x / W * 2 - 1, y: -(p.y / H * 2 - 1), z: 0.5, w: 1 };
    const pv = inv4(camera.projectionMatrixInverse.elements.slice()); if (!pv) { out.push({ ...p, hit: 'noinv' }); continue; }
    const cam = A(pv, ndc); const cw = { x: cam.x / cam.w, y: cam.y / cam.w, z: cam.z / cam.w, w: 1 };
    const far = A(camera.matrixWorld.elements.slice(), cw);
    const o0 = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const d0 = { x: far.x - o0.x, y: far.y - o0.y, z: far.z - o0.z };
    const dl = Math.hypot(d0.x, d0.y, d0.z); d0.x /= dl; d0.y /= dl; d0.z /= dl;
    let best = null;
    for (const ob of objects) {
      const iv = inv4(ob.m); if (!iv) continue;
      const a = A(iv, { x: o0.x, y: o0.y, z: o0.z, w: 1 });
      const o1 = { x: a.x, y: a.y, z: a.z };
      const b = A(iv, { x: o0.x + d0.x, y: o0.y + d0.y, z: o0.z + d0.z, w: 0 });
      const dv = { x: b.x, y: b.y, z: b.z };
      let t0 = -Infinity, t1 = Infinity, ok = true;
      const oo = [o1.x, o1.y, o1.z], dd = [dv.x, dv.y, dv.z];
      for (let k = 0; k < 3; k++) {
        const lo = ob.bb[k], hi = ob.bb[k + 3];
        if (Math.abs(dd[k]) < 1e-12) { if (oo[k] < lo || oo[k] > hi) { ok = false; break; } }
        else { let ta = (lo - oo[k]) / dd[k], tb = (hi - oo[k]) / dd[k]; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { ok = false; break; } }
      }
      if (!ok || t1 < 0) continue;
      const t = t0 > 0 ? t0 : t1;
      if (!best || t < best.t) best = { t, name: ob.name, inst: ob.inst };
    }
    out.push({ ...p, name: best ? best.name : null, inst: best?.inst ?? -1, t: best ? +best.t.toFixed(1) : null, world: best ? [+(o0.x + d0.x * best.t).toFixed(1), +(o0.y + d0.y * best.t).toFixed(1), +(o0.z + d0.z * best.t).toFixed(1)] : null });
  }
  return out;
};
`;

const readState = p => p.evaluate(() => {
  const c = window.__smartApp.camera;
  const dir = c.getWorldDirection(c.position.clone());
  const t = -c.position.y / dir.y;
  const tx = c.position.x + dir.x * t, tz = c.position.z + dir.z * t;
  const dist = Math.hypot(c.position.x - tx, c.position.y, c.position.z - tz);
  return { target: [tx, tz], dist, az: Math.atan2(c.position.x - tx, c.position.z - tz), polar: Math.acos(c.position.y / dist) };
});
async function panTo(p, x, z) {
  for (let it = 0; it < 12; it++) {
    const s = await readState(p);
    const cam = await p.evaluate(() => [window.__smartApp.camera.position.x, window.__smartApp.camera.position.z]);
    let fx = s.target[0] - cam[0], fz = s.target[1] - cam[1];
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const dx = x - s.target[0], dz = z - s.target[1];
    const nf = dx * fx + dz * fz, nr = dx * rx + dz * rz;
    if (Math.hypot(dx, dz) < 12) return;
    const stride = Math.max(18, Math.min(240, s.dist * 0.055));
    const keys = [];
    const a = Math.round(Math.abs(nf) / stride), b = Math.round(Math.abs(nr) / stride);
    for (let i = 0; i < Math.min(a, 60); i++) keys.push(nf > 0 ? 'w' : 's');
    for (let i = 0; i < Math.min(b, 60); i++) keys.push(nr > 0 ? 'd' : 'a');
    if (!keys.length) return;
    await p.evaluate(keys => { for (const k of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); }, keys);
    await sleep(600);
  }
}
(async () => {
  const s0 = JSON.parse(poseJson);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto('http://127.0.0.1:8842/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelectorAll('#loading').forEach(e => e.remove()); });
  await sleep(2500);
  await p.evaluate(() => window.webgpuMaterials24.selectView('bac'));
  await sleep(3200);
  await panTo(p, s0.x, s0.z);
  const s = await readState(p);
  const n = s0.dist / s.dist;
  if (n < 1) await p.evaluate(k => { for (let i = 0; i < k; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' })); }, Math.min(40, Math.ceil(Math.log(n) / Math.log(0.88))));
  else await p.evaluate(k => { for (let i = 0; i < k; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' })); }, Math.min(40, Math.ceil(Math.log(n) / Math.log(1.14))));
  await sleep(700);
  await p.addScriptTag({ content: INPAGE });
  const st = await readState(p);
  const dx = -(s0.az - st.az) / 0.004, dy = (s0.polar - st.polar) / 0.003;
  await p.mouse.move(800, 450); await p.mouse.down();
  for (let i = 1; i <= 24; i++) await p.mouse.move(800 + dx * i / 24, 450 + dy * i / 24);
  await p.mouse.up();
  await sleep(1200);
  const final = await readState(p);
  console.log('pose target=', final.target.map(v => Math.round(v)), 'dist=', Math.round(final.dist), 'az=', final.az.toFixed(2), 'polar=', final.polar.toFixed(2));
  const res = await p.evaluate((pts) => window.__m2bIdent(null, innerWidth, innerHeight, pts), grid);
  for (const r of res) console.log(JSON.stringify(r));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message, e.stack); process.exit(2); });
