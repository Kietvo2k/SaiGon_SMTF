import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const T = JSON.parse(fs.readFileSync(path.join(root, 'data/bridge-corrections-31.js'), 'utf8').replace(/^window\.BRIDGE_CORRECTIONS_31\s*=\s*/, '').replace(/;\s*$/, ''));
console.log('keys', Object.keys(T));
const fb = T.footbridges;
console.log('footbridges keys', Object.keys(fb || {}));
const L = [1124, -1768];
for (const w of fb?.ways || []) {
  // cần centerline: lấy từ road-graph
  console.log(JSON.stringify({ way: w.way, road: w.road, mode: w.mode, reason: w.reason, deckTopY: w.deckTopY, stairs: (w.stairs || []).length, pts: (w.stairs || []).map(s => s.points?.[0]) }));
}
