// DEMAND-1: gộp bảng số bước 3 (5 dòng × [breaker_respawns, max_stop_s, a1_crossings_hx, stopped_hx_by_group, active_vehicles]).
import fs from 'node:fs';
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const s = rd('work/demand-1/base/a1-app-1730.json');
const r31 = s.rows.find(r => r.seed === 31031);
const rows = [
  ['nền fixed', r31.fixed],
  ['nền max-pressure', r31.smart],
  ['a turnBias 5', rd('work/demand-1/exp-a')],
  ['b turnBias 0', rd('work/demand-1/exp-b')],
  ['c poolScale 3', rd('work/demand-1/exp-c')],
  ['d spawnBias 1', rd('work/demand-1/exp-d')],
];
const out = ['| biến thể | breaker_respawns | max_stop_s | a1_crossings_hx | stopped_hx_by_group (0/1) | tỉ lệ 1/0 | active_vehicles |',
  '|---|---|---|---|---|---|---|'];
for (const [name, j] of rows) {
  const g = j.stopped_hx_by_group;
  out.push(`| ${name} | ${j.breaker_respawns} | ${j.max_stop_s} | ${j.a1_crossings_hx} | ${g[0]} / ${g[1]} | ${(100 * g[1] / Math.max(1e-9, g[0])).toFixed(1)} % | ${j.active_vehicles} |`);
}
const md = out.join('\n');
console.log(md);
fs.writeFileSync('work/demand-1/step3-table.md', md + '\n', 'utf8');

// Thống kê chẩn đoán từ 5 seed nền: làn kẹt nặng nhất và hướng vào HX theo nhóm.
console.log('\n--- top_stuck_lanes (nền max-pressure seed 31031) ---');
for (const l of r31.smart.top_stuck_lanes) console.log(`lane ${l.lane} nhóm ${l.group} stuck ${l.stuck_s}s road=${l.road} node=${l.node}`);
console.log('\n--- spawn_dest_hx nền max-pressure seed 31031 ---');
console.log('by_group', r31.smart.spawn_dest_hx.by_group);
console.log('by_node', JSON.stringify(r31.smart.spawn_dest_hx.by_node));
console.log('\n--- tổng 5 seed ---');
for (const mode of ['fixed', 'smart']) {
  const agg = s.rows.map(r => r[mode]);
  const avg = f => agg.reduce((a, j) => a + f(j), 0) / agg.length;
  console.log(mode, 'brk TB', avg(j => j.breaker_respawns).toFixed(0),
    'a1x TB', avg(j => j.a1_crossings_hx).toFixed(0),
    'stopped0 TB', avg(j => j.stopped_hx_by_group[0]).toFixed(2),
    'stopped1 TB', avg(j => j.stopped_hx_by_group[1]).toFixed(3),
    'act TB', avg(j => j.active_vehicles).toFixed(0),
    'maxstop TB', avg(j => j.max_stop_s).toFixed(1));
}