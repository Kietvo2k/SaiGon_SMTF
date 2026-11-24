const fs = require('fs');
const path = require('path');
const base = 'work/cleanup';
function readList(f) {
  return fs.readFileSync(path.join(base, f), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
const groups = ['DEL2', 'REVIEW', 'DECA', 'TACH', 'legacy-only'];
const all = new Set();
const rows = [];
for (const g of groups) {
  let p;
  try { p = readList(g + '.txt'); } catch (e) { console.log(g, 'MISSING'); continue; }
  let exist = 0, missing = 0;
  const still = [];
  for (const f of p) {
    p && all.add(f);
    const abs = f.replace(/\//g, path.sep);
    if (fs.existsSync(abs)) { exist++; still.push(f); } else missing++;
  }
  rows.push({ group: g, total: p.length, stillExist: exist, deleted: missing });
  fs.writeFileSync(path.join(base, 'still-' + g + '.txt'), still.join('\n') + (still.length ? '\n' : ''), 'utf8');
}
console.table(rows);
// DELETE-ALL remaining
const da = readList('DELETE-ALL.txt');
const daStill = da.filter(f => fs.existsSync(f.replace(/\//g, path.sep)));
fs.writeFileSync(path.join(base, 'still-DELETE-ALL.txt'), daStill.join('\n') + '\n', 'utf8');
console.log('DELETE-ALL total:', da.length, 'still exist:', daStill.length);
