// M2b: kiem tra cac mau doc theo cau trong/gan khu Bac: nam tren nuoc (water) hay tren dat. Khong commit.
const fs = require('fs');
const src = fs.readFileSync('data/scene.js', 'utf8');
const D = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const g = JSON.parse(fs.readFileSync('data/road-graph-31.js', 'utf8').replace(/^[^=]*=/, '').replace(/;\s*$/, ''));
const nodes = new Map(g.nodes.map(n => [n.id, n]));
const inRing = (x, z, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const wet = (x, z) => D.water.some(poly => { const r = Array.isArray(poly[0][0]) ? poly : [poly]; return r.some(ring => inRing(x, z, ring)); });
const ids = { 'Cầu Sài Gòn': [32581944, 192289478, 1012023452], 'Cầu Sài Gòn 2': [306073179, 306073180, 1344826626], 'Cầu Thủ Thiêm': [35470085, 165919725, 165919740, 166092209, 1106232435] };
const roadsById = new Map(g.roads.map(r => [r.id, r]));
for (const [name, list] of Object.entries(ids)) for (const id of list) {
  const r = roadsById.get(id); if (!r) continue;
  const pts = r.nodes.map(n => nodes.get(n));
  const a = pts[0], b = pts[pts.length - 1];
  const samples = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; const y = a.y + (b.y - a.y) * t; samples.push(`${Math.round(t * 100)}%:y${y.toFixed(1)}${wet(x, z) ? 'W' : 'L'}`); }
  console.log(name, id, r.type, r.elevationClass, samples.join(' '));
}
