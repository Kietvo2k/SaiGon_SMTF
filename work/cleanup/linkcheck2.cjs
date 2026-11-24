const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.cwd();
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const files = tracked.filter(f => /\.(md|html)$/i.test(f));
const skip = /^(https?:|mailto:|data:|#|\/\/)/i;
let dead = 0;
for (const F of files) {
  let txt; try { txt = fs.readFileSync(F, 'utf8'); } catch { continue; }
  const dir = path.posix.dirname(F);
  const targets = new Set();
  for (const m of txt.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) targets.add(m[1]);
  for (const m of txt.matchAll(/(?:href|src)="([^"]+)"/g)) targets.add(m[1]);
  for (const t of targets) {
    if (skip.test(t)) continue;
    const clean = t.split('#')[0].split('?')[0];
    if (!clean) continue;
    const abs = path.posix.normalize(path.posix.join(dir, clean));
    const absFromRoot = path.posix.normalize(clean.replace(/^\//, ''));
    if (!fs.existsSync(abs.replace(/\//g, path.sep)) && !fs.existsSync(absFromRoot.replace(/\//g, path.sep))) {
      dead++;
      console.log(`${F}  ->  ${t}`);
    }
  }
}
console.log('dead links:', dead, 'scanned files:', files.length);
