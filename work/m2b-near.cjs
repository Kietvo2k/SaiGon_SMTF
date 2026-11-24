// Liệt kê đối tượng 3D quanh một điểm [x,z] (bbox thế giới) để định danh vật thể lạ.
const PW = 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const X = Number(process.argv[2] ?? 1200), Z = Number(process.argv[3] ?? -1700), R = Number(process.argv[4] ?? 260);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto('http://127.0.0.1:8842/hcmc-poc/webgpu-materials-24.html?v=32a&app=smart&view=bac', { waitUntil: 'load' });
  await p.waitForFunction(() => window.webgpuMaterials24?.state === 'ready', null, { timeout: 240000 });
  const out = await p.evaluate(({ X, Z, R }) => {
    const scene = window.__smartApp.scene; scene.updateMatrixWorld(true);
    const res = [];
    const pt = (m, x, y, z) => ({ x: m.elements[0] * x + m.elements[4] * y + m.elements[8] * z + m.elements[12], y: m.elements[1] * x + m.elements[5] * y + m.elements[9] * z + m.elements[13], z: m.elements[2] * x + m.elements[6] * y + m.elements[10] * z + m.elements[14] });
    scene.traverse(o => {
      if (!o.geometry || !o.visible) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      const bb = g.boundingBox;
      const box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
      const corner = (x, y, z) => { const q = pt(o.matrixWorld, x, y, z); box.x0 = Math.min(box.x0, q.x); box.y0 = Math.min(box.y0, q.y); box.z0 = Math.min(box.z0, q.z); box.x1 = Math.max(box.x1, q.x); box.y1 = Math.max(box.y1, q.y); box.z1 = Math.max(box.z1, q.z); };
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corner(x, y, z);
      const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
      const near = Math.hypot(cx - X, cz - Z) - Math.hypot((box.x1 - box.x0) / 2, (box.z1 - box.z0) / 2);
      if (near > R) return;
      res.push({ name: o.name || o.type, inst: o.isInstancedMesh ? o.count : -1, near: +near.toFixed(0), bb: [box.x0, box.y0, box.z0, box.x1, box.y1, box.z1].map(v => +v.toFixed(1)) });
    });
    return res.sort((a, b) => a.near - b.near);
  }, { X, Z, R });
  for (const r of out) console.log(JSON.stringify(r));
  console.log('total', out.length);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
