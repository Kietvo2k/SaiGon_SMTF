// Kiểm hình học thật quanh (1208,-1700): đỉnh mesh bản mặt + thể hiện lan can/trụ.
const PW = 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const X = Number(process.argv[2] ?? 1208), Z = Number(process.argv[3] ?? -1700), R = Number(process.argv[4] ?? 60);
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
    const K = o => o.name + (o.isInstancedMesh ? ` [inst ${o.count}]` : '');
    scene.traverse(o => {
      if (!o.geometry || !o.visible) return;
      const pos = o.geometry.attributes.position; if (!pos) return;
      const m = o.matrixWorld.elements;
      const tp = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity, n: 0 };
      const add = q => { b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]); b.z0 = Math.min(b.z0, q[2]); b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]); b.z1 = Math.max(b.z1, q[2]); b.n++; };
      if (o.isInstancedMesh) {
        const im = o.instanceMatrix.array; let hits = 0;
        for (let i = 0; i < o.count; i++) {
          const ox = im[i * 16 + 12], oy = im[i * 16 + 13], oz = im[i * 16 + 14];
          if (Math.hypot(ox - X, oz - Z) > R) continue;
          hits++;
          for (let k = 0; k < pos.count; k++) { const a = pos.getX(k), c = pos.getY(k), d = pos.getZ(k);
            const lx = im[i*16]*a + im[i*16+4]*c + im[i*16+8]*d + ox, ly = im[i*16+1]*a + im[i*16+5]*c + im[i*16+9]*d + oy, lz = im[i*16+2]*a + im[i*16+6]*c + im[i*16+10]*d + oz;
            add(tp(lx, ly, lz)); }
          res.push({ tag: 'instOrigin ' + K(o), inst: i, o: [+ox.toFixed(1), +oy.toFixed(1), +oz.toFixed(1)] });
        }
        if (hits) res.push({ tag: K(o), b: [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1].map(v => +v.toFixed(2)), verts: b.n, instHits: hits });
        return;
      }
      for (let k = 0; k < pos.count; k++) { const q = tp(pos.getX(k), pos.getY(k), pos.getZ(k)); if (Math.hypot(q[0] - X, q[2] - Z) <= R) add(q); }
      if (b.n) res.push({ tag: K(o), b: [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1].map(v => +v.toFixed(2)), verts: b.n });
    });
    return res;
  }, { X, Z, R });
  for (const r of out) console.log(JSON.stringify(r));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
