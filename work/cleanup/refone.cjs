const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.cwd();
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);

const target = process.argv[2];
const base = path.posix.basename(target);
const textExt = /\.(js|mjs|cjs|html|css|py|json|md|ps1|sh|csv|tsv|txt|geojson|state|yml|yaml|ipynb|xml|svg)$/i;
console.log('### ' + target);
for (const F of tracked) {
  if (F === target) continue;
  if (!textExt.test(F)) continue;
  let txt;
  try { txt = fs.readFileSync(F, 'utf8'); } catch (e) { continue; }
  const lines = txt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.includes(base) || L.includes(target)) {
      const trimmed = L.trim().slice(0, 160);
      console.log(`  ${F}:${i + 1}: ${trimmed}`);
    }
  }
}
