// DEMAND-1: kiểm phần ĐO chẩn đoán nhu cầu trong scripts/kpi-ab-32.mjs.
// Không kiểm sim (không sửa sim): chỉ kiểm các trường JSON mới dùng cho bảng nền và chẩn đoán.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const run = (args, out) => {
  execFileSync(process.execPath, ['scripts/kpi-ab-32.mjs', ...args, '--out', out], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};

test('app-1730: JSON seed có trường chẩn đoán nhu cầu (breaker, xe dừng theo nhóm, làn kẹt, hướng vào HX)', () => {
  // Cửa sổ đo A1 = [300, 1800]; duration 320 để có vài mẫu xe dừng trong cửa sổ.
  const out = 'work/demand-1/test-probe.json';
  const j = run(['--seed', '31031', '--scenario', 'app-1730', '--duration', '320', '--mode', 'fixed'], out);

  // Nguồn gốc: counters của sim (breakerS app = 180 = SMART_BREAKER_S).
  assert.equal(j.breaker_s, 180, 'app-1730 phải dùng breaker 180 s');
  for (const k of ['breaker_respawns', 'respawns']) assert.equal(typeof j[k], 'number', `thiếu số ${k}`);
  assert.ok(j.breaker_respawns >= 0 && j.respawns >= j.breaker_respawns, 'breaker_respawns ≤ respawns');
  assert.equal(typeof j.max_stop_s, 'number');

  // Xe dừng (v < 1 m/s) trên làn VÀO nút HX, tách nhóm pha 0/1.
  assert.ok(Array.isArray(j.stopped_hx_by_group) && j.stopped_hx_by_group.length === 2, 'stopped_hx_by_group = [nhóm 0, nhóm 1]');
  for (const v of j.stopped_hx_by_group) assert.ok(typeof v === 'number' && v >= 0, 'số xe dừng phải ≥ 0');
  assert.ok(Array.isArray(j.active_hx_by_group) && j.active_hx_by_group.length === 2, 'active_hx_by_group = [nhóm 0, nhóm 1]');
  for (let k = 0; k < 2; k++) {
    assert.ok(j.active_hx_by_group[k] >= 0, 'xe trên làn vào HX phải ≥ 0');
    assert.ok(j.active_hx_by_group[k] + 1e-9 >= j.stopped_hx_by_group[k], 'xe đang chạy ≥ xe dừng (cùng nhóm)');
  }
  assert.ok(Number.isInteger(j.stopped_hx_samples) && j.stopped_hx_samples >= 1, 'phải có ≥ 1 mẫu trong cửa sổ');

  // 10 làn kẹt nặng nhất, giảm dần, kèm tên đường (nếu có) và nút HX (nếu làn vào HX).
  assert.ok(Array.isArray(j.top_stuck_lanes) && j.top_stuck_lanes.length > 0 && j.top_stuck_lanes.length <= 10, 'top_stuck_lanes 1..10');
  for (const r of j.top_stuck_lanes) {
    for (const k of ['lane', 'road', 'node', 'group', 'stuck_s']) assert.ok(k in r, `làn kẹt thiếu ${k}`);
    assert.ok(r.stuck_s > 0);
  }
  for (let i = 1; i < j.top_stuck_lanes.length; i++) assert.ok(j.top_stuck_lanes[i - 1].stuck_s >= j.top_stuck_lanes[i].stuck_s, 'phải sắp giảm dần theo stuck_s');

  // Phân bố hướng vào HX của xe qua vạch: tổng theo nút = tổng theo nhóm.
  const d = j.spawn_dest_hx;
  assert.ok(d && Array.isArray(d.by_group) && d.by_group.length === 2 && d.by_node && d.by_node_group, 'spawn_dest_hx đủ trường');
  const sumNode = Object.values(d.by_node).reduce((a, b) => a + b, 0);
  assert.equal(sumNode, d.by_group[0] + d.by_group[1], 'tổng theo nút = tổng theo nhóm');
  const sumNG = Object.values(d.by_node_group).reduce((a, b) => a + b, 0);
  assert.equal(sumNG, sumNode, 'by_node_group phải khớp by_node');
});

test('--demand ghi đè từng khóa của demand kịch bản, giữ khóa không ghi đè', () => {
  const out = 'work/demand-1/test-demand-override.json';
  const j = run(['--seed', '31031', '--scenario', 'app-1730', '--duration', '5', '--mode', 'fixed',
    '--demand', '{"turnBias":0,"poolScale":3}'], out);
  assert.equal(j.demand.turnBias, 0, 'turnBias phải bị ghi đè');
  assert.equal(j.demand.poolScale, 3, 'poolScale phải bị ghi đè');
  assert.equal(j.demand.spawnBias, 200, 'spawnBias giữ nguyên từ NORTH_DEMAND_32');
  assert.equal(j.demand.radius_m, 1500, 'radius_m giữ nguyên');
  assert.equal(j.breaker_s, 180);

  // Không truyền --demand → demand y nguyên NORTH_DEMAND_32.
  const j2 = run(['--seed', '31031', '--scenario', 'app-1730', '--duration', '5', '--mode', 'fixed'], 'work/demand-1/test-demand-base.json');
  assert.equal(j2.demand.turnBias, 15);
  assert.equal(j2.demand.poolScale, 5);
});
