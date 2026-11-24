// M2b: chay thu landmark-detail.js voi THREE gia lap de kiem hinh hoc: cot goc, nap, dai, cum angten. Khong commit.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('outputs/hcmc-poc/data/scene.js', 'utf8');
const D = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const lmSrc = fs.readFileSync('outputs/hcmc-poc/landmark-detail.js', 'utf8');
const V = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } });
const T = {
  Vector3: function (x, y, z) { return V(x, y, z); },
  Color: function () { return {}; },
  BoxGeometry: function () { return {}; }, CylinderGeometry: function () { return {}; },
  MeshStandardMaterial: function () { return {}; }, Mesh: function () { return { position: V(), rotation: {} }; },
  Group: function () { return { position: V(), add() {}, visible: true }; }, PointLight: function () { return { position: V() }; },
  InstancedMesh: function () { return { setMatrixAt(i, m) { mats.push(m); }, setColorAt() {}, castShadow: false, receiveShadow: false }; },
};
const mats = [];
const tmp = { position: V(), scale: V(1, 1, 1), rotation: { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }, updateMatrix() { return { s: { ...tmp.scale }, p: { ...tmp.position }, ry: tmp.rotation.y }; } };
const sandbox = { D, T, tmp, scene: { add() {} }, document: { body: { classList: { add() {} } }, createElement: () => ({ setAttribute() {}, innerHTML: '', dataset: {}, classList: { add() {} } }) }, addVisualControl() {}, $: () => ({ append() {} }), presets: {}, xyz: () => V(), stopCinema() {}, view() {}, follow: false };
sandbox.presets = sandbox.presets; vm.createContext(sandbox);
// tmp.updateMatrix tra ve cac tham so; ghi lai vao mats qua setMatrixAt (mo phong ma tran).
const hook = `${lmSrc}\n;globalThis.__out={lmDetails};`;
sandbox.tmp.updateMatrix = function () { return { s: { x: this.scale.x, y: this.scale.y, z: this.scale.z }, p: { x: this.position.x, y: this.position.y, z: this.position.z }, ry: this.rotation.y }; };
sandbox.tmp.scale = V(1, 1, 1);
try { vm.runInContext(hook, sandbox); } catch (e) { console.log('RUN ERR', e.message); process.exit(1); }
const details = sandbox.__out.lmDetails;
// Kiem tra: moi hop unit o (p, ry, s) -> cac dinh; so sanh voi footprint cua khoi.
const toWorld = (d, lx, ly, lz) => { const X = lx * d.sx, Z = lz * d.sz, c = Math.cos(d.yaw || 0), s = Math.sin(d.yaw || 0); return [d.x + c * X + s * Z, d.y + ly * d.sy, d.z - s * X + c * Z]; };
const parts = D.buildings.filter(b => b.type === 'illustrative-landmark-part');
let worst = { cap: 0, post: 0, post2: 0, band: 0 };
for (const b of parts) {
  const ring = b.r[0];
  const caps = details.filter(d => d.kind === 2 && Math.abs(d.x - ring.reduce((s, p) => s + p[0], 0) / 4) < 1e-6);
  const cap = caps[0]; if (!cap) { console.log('no cap for part h=', b.h); continue; }
  const bottomOfCap = cap.y - cap.sy / 2;
  worst.cap = Math.max(worst.cap, Math.abs(bottomOfCap - b.h));
  // canh cap phai bao khoi (margin 0.7 m moi phia)
  const corners = ring.map(([x, z]) => { const dx = x - cap.x, dz = z - cap.z; const c = Math.cos(cap.yaw), s = Math.sin(cap.yaw); const lx = (c * dx - s * dz) / 1, lz = (s * dx + c * dz); return [lx, lz]; });
  const maxX = Math.max(...corners.map(c => Math.abs(c[0]))), maxZ = Math.max(...corners.map(c => Math.abs(c[1])));
  worst.band = Math.max(worst.band, Math.abs(maxX - cap.sx / 2 + 0.7), Math.abs(maxZ - cap.sz / 2 + 0.7));
  const posts = details.filter(d => d.kind === 1 && Math.hypot(d.x - ring[0][0], d.z - ring[0][1]) < 80 && Math.abs(d.sy - b.h) < 1e-6);
  for (const [x, z] of ring) { const p = posts.find(q => Math.hypot(q.x - x, q.z - z) < 1e-6); if (!p) { worst.post2++; continue; } worst.post = Math.max(worst.post, Math.abs(p.y - b.h / 2)); }
}
const crown = { x: 1124, z: -1768 };
const spireCenter = [1124, -1768];
console.log('parts', parts.length, 'details', details.length, 'worst', JSON.stringify(worst));
console.log('cap bottom = roof (max err m):', worst.cap.toFixed(4));
console.log('cot goc tai dinh footprint (thieu):', worst.post2, '; cot y tam = h/2 (sai so m):', worst.post.toFixed(4));
console.log('yaw(khoi dau) =', (details.find(d => d.kind === 2) || {}).yaw?.toFixed(3));
