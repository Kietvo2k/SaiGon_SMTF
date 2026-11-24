// DEMAND-1: gộp bảng bước 3 (5 biến thể × 2 mode) + chẩn đoán.
import fs from 'node:fs';
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const base = rd('work/demand-1/base/a1-app-1730.json');
const r31 = base.rows.find(r => r.seed === 31031);

const variants = [
  ['nền fixed', r31.fixed],
  ['nền max-pressure', r31.smart],
  ['a turnBias 5', rd('work/demand-1/exp-a-smart')],
  ['b turnBias 0', rd('work/demand-1/exp-b-smart')],
  ['c poolScale 3', rd('work/demand-1/exp-c-smart')],
  ['d spawnBias 1', rd('work/demand-1/exp-d-smart')],
];

const header = '| biến thể | breaker_respawns | max_stop_s | a1_crossings_hx | stopped_hx_by_group (0/1) | tỉ lệ 1/0 | active_vehicles |';
const sep = '|---|---|---|---|---|---|---|';
const out = [header, sep];
for (const [name, j] of variants) {
  const g = j.stopped_hx_by_group;
  out.push(`| ${name} | ${j.breaker_respawns} | ${j.max_stop_s} | ${j.a1_crossings_hx} | ${g[0]} / ${g[1]} | ${(100 * g[1] / Math.max(1e-9, g[0])).toFixed(1)} % | ${j.active_vehicles} |`);
}
// Per-vehicle deadlock rate (br/active)
out.push('');
out.push('| biến thể | br/active (số cạn-kẹt mỗi xe) |');
out.push('|---|---|');
for (const [name, j] of variants) out.push(`| ${name} | ${(j.breaker_respawns / j.active_vehicles).toFixed(4)} |`);

const md = out.join('\n');
fs.writeFileSync('work/demand-1/step3-table.md', md + '\n', 'utf8');
console.log(md);

// Thống kê chẩn đoán
console.log('\n=== Cụm HX-C1 (HX-01+HX-05) — hướng vào theo nhóm, smart seed 31031 ===');
const ng = r31.smart.spawn_dest_hx.by_node_group;
let g0 = 0, g1 = 0;
for (const k in ng) {
  const [n, gg] = k.split('|');
  if (n === 'HX-01' || n === 'HX-05') {
    if (gg === '0') g0 += ng[k]; else g1 += ng[k];
  }
}
console.log(`HX-C1 dest: group0=${g0} group1=${g1} ratio=${(g1 / Math.max(1, g0) * 100).toFixed(1)}%`);

console.log('\n=== 5-seed nền: trung bình ===');
const avg = f => base.rows.reduce((a, r) => a + f(r), 0) / base.rows.length;
for (const m of ['fixed', 'smart']) {
  console.log(`${m}: brk=${avg(r => r[m].breaker_respawns).toFixed(0)} a1x_hx=${avg(r => r[m].a1_crossings_hx).toFixed(0)} stop0=${avg(r => r[m].stopped_hx_by_group[0]).toFixed(2)} stop1=${avg(r => r[m].stopped_hx_by_group[1]).toFixed(3)} act=${avg(r => r[m].active_vehicles).toFixed(0)} maxstop=${avg(r => r[m].max_stop_s).toFixed(1)}`);
}
