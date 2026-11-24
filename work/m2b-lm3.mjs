import fs from 'node:fs';
import path from 'node:path';
const root = 'outputs/hcmc-poc';
const D = JSON.parse(fs.readFileSync(path.join(root, 'data/scene.js'), 'utf8').replace(/^window\.CITY_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const parts = D.buildings.filter(b => b.id === 622296615);
for (const b of parts) {
  console.log(`${b.type || b.q} part=${b.partIndex ?? '-'} h=${b.h} min=${b.min} name=${b.name || '(podium)'}`);
  console.log('   ring', JSON.stringify(b.r[0]));
}
console.log('\nprepare_scene.py generator:');
const py = fs.readFileSync(path.join(root, 'scripts/prepare_scene.py'), 'utf8').split(/\r?\n/);
for (let i = 55; i < 85; i++) console.log(String(i + 1).padStart(4), py[i]);
