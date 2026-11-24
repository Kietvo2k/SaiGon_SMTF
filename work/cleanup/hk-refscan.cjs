// HK-FINALIZE: quét tham chiếu cho danh sách xóa. Chỉ đọc, không sửa file.
// Quyết định: file trong danh sách xóa bị GIỮ nếu có tham chiếu đầy đủ (hoặc tương đối)
// từ file không nằm trong danh sách xóa và không thuộc nhóm đang sửa (E).
// Tham chiếu chỉ theo tên (basename) được ghi riêng để xem xét thủ công.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CL = path.join(ROOT, 'work', 'cleanup');
const readList = (f) => fs.readFileSync(path.join(CL, f), 'utf8')
  .replace(/^﻿/, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const groupA = new Set([...readList('DEL2.txt'), ...readList('DECA.txt'), ...readList('REVIEW.txt')]);
const groupC = new Set(readList('TACH.txt'));
const legacyAll = readList('legacy-only.txt');
const protectedPrefix = ['outputs/hcmc-poc/assets/', 'outputs/hcmc-poc/vendor/', 'outputs/hcmc-poc/tiles/'];
const keepByPolicy = new Map();
const groupB = new Set();
for (const f of legacyAll) {
  if (protectedPrefix.some((p) => f.startsWith(p))) keepByPolicy.set(f, 'GIỮ theo GIT-DATA-PACKAGING.md / mục 4: assets/vendor/tiles');
  else groupB.add(f);
}
// Dữ liệu nạp lúc chạy: không bao giờ xóa (kiểm bằng tên, không chỉ bằng tham chiếu)
const runtimeData = /(^outputs\/hcmc-poc\/data\/scene\.)|(road-graph-31)|(signature-registry-31)|(bridge-corrections-31)|(street-furniture-31)|(flood-source-registry-25)|(^outputs\/hcmc-poc\/data\/surface-18\/(cog|tiles-18)\/)|(^outputs\/hcmc-poc\/tiles\/)/;

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const trackedSet = new Set(tracked);

const candidates = new Set([...groupA, ...groupB, ...groupC]);
// index.html và các file được sửa không bao giờ nằm trong danh sách xóa
for (const e of ['README.md','outputs/hcmc-poc/README.md','outputs/hcmc-poc/index.html','outputs/hcmc-poc/scripts/qa-project-hygiene.cjs','GIT-DATA-PACKAGING.md']) candidates.delete(e);
const editSet = new Set([
  'README.md',
  'outputs/hcmc-poc/README.md',
  'outputs/hcmc-poc/index.html',
  'outputs/hcmc-poc/scripts/qa-project-hygiene.cjs',
  'GIT-DATA-PACKAGING.md',
]);
const textExt = /\.(js|mjs|cjs|html|css|py|json|md|ps1|sh|csv|tsv|txt|geojson|state|yml|yaml|ipynb|xml|svg)$/i;

// Chỉ mục basename -> đường dẫn đã track (để xét tham chiếu theo tên)
const byBase = new Map();
for (const f of tracked) {
  const b = path.posix.basename(f);
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(f);
}

const strong = new Map(); // candidate -> Set of referencing files
const weak = new Map();
for (const c of candidates) { strong.set(c, new Set()); weak.set(c, new Set()); }

const tokenRe = /[A-Za-z0-9_@.\-\/]+\.[A-Za-z0-9]{1,8}/g;
for (const F of tracked) {
  if (candidates.has(F) || editSet.has(F)) continue;
  if (!textExt.test(F)) continue;
  const abs = path.join(ROOT, F);
  let txt;
  try { txt = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
  if (txt.length > 8e6) { txt = txt.slice(0, 8e6); }
  const toks = new Set(txt.match(tokenRe) || []);
  const dir = path.posix.dirname(F);
  for (const t0 of toks) {
    let t = t0.replace(/^\.?\//, '');
    const resolved = new Set();
    resolved.add(path.posix.normalize(t));
    resolved.add(path.posix.normalize(path.posix.join(dir, t)));
    if (F.startsWith('outputs/hcmc-poc/')) resolved.add(path.posix.normalize(path.posix.join('outputs/hcmc-poc', t)));
    resolved.add(path.posix.normalize(path.posix.join('outputs', t)));
    for (const r of resolved) {
      if (candidates.has(r)) strong.get(r).add(F);
    }
    const b = path.posix.basename(t);
    if (b.length >= 8 && byBase.has(b)) {
      for (const cand of byBase.get(b)) if (candidates.has(cand)) weak.get(cand).add(F);
    }
  }
}

// Quyết định
const keep = new Map();
const del = [];
for (const c of candidates) {
  if (keepByPolicy.has(c)) { keep.set(c, keepByPolicy.get(c)); continue; }
  if (runtimeData.test(c)) { keep.set(c, 'GIỮ: dữ liệu nạp lúc chạy (danh sách bảo vệ)'); continue; }
  const s = [...strong.get(c)];
  if (s.length) {
    keep.set(c, 'GIỮ: tham chiếu từ ' + s.slice(0, 4).join(', ') + (s.length > 4 ? ` (+${s.length - 4})` : ''));
    continue;
  }
  del.push(c);
}

const out = { candidates: candidates.size, delete: del.length, keep: keep.size, keepDetail: {}, weakOnly: {} };
for (const [k, v] of keep) out.keepDetail[k] = v;
for (const c of del) {
  const w = [...weak.get(c)];
  if (w.length) out.weakOnly[c] = w.slice(0, 6);
}
fs.writeFileSync(path.join(CL, 'hk-refscan.json'), JSON.stringify(out, null, 1), 'utf8');
fs.writeFileSync(path.join(CL, 'hk-keep.txt'), [...keep].map(([k, v]) => k + '\t' + v).join('\n') + '\n', 'utf8');
const gA = del.filter((f) => groupA.has(f));
const gB = del.filter((f) => groupB.has(f));
const gC = del.filter((f) => groupC.has(f));
fs.writeFileSync(path.join(CL, 'hk-del-A.txt'), gA.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(CL, 'hk-del-B.txt'), gB.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(CL, 'hk-del-C.txt'), gC.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ candidates: candidates.size, keep: keep.size, delete: del.length, A: gA.length, B: gB.length, C: gC.length, weakOnlyCount: Object.keys(out.weakOnly).length }));
