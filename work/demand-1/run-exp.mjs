// DEMAND-1: chạy biến thể (bước 3) — mỗi lần đổi MỘT khóa demand trên seed 31031, cả 2 mode.
// Dùng: node work/demand-1/run-exp.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DUR = 1800;
const VARIANTS = [
  ['exp-a', { turnBias: 5 }],
  ['exp-b', { turnBias: 0 }],
  ['exp-c', { poolScale: 3 }],
  ['exp-d', { spawnBias: 1 }],
];

for (const [name, demand] of VARIANTS) {
  for (const mode of ['fixed', 'smart']) {
    const out = `work/demand-1/${name}-${mode}`;
    if (fs.existsSync(out)) { console.log('skip', name, mode); continue; }
    const t0 = Date.now();
    execFileSync(process.execPath, ['scripts/kpi-ab-32.mjs',
      '--seed', '31031', '--scenario', 'app-1730', '--duration', String(DUR),
      '--mode', mode, '--demand', JSON.stringify(demand), '--out', out], { stdio: 'inherit' });
    console.log(`# ${name} ${mode} ${(Date.now() - t0) / 1000}s`);
  }
}
console.log('DONE');
