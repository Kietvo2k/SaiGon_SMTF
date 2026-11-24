import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const txt = fs.readFileSync(path.join(root, 'data/scene.js'), 'utf8');
const D = JSON.parse(txt.replace(/^window\.CITY_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
console.log('top keys:', Object.keys(D));
for (const k of Object.keys(D)) {
  const v = D[k];
  console.log(k, Array.isArray(v) ? `array(${v.length}) sample=${JSON.stringify(v[0])?.slice(0, 200)}` : typeof v);
}
