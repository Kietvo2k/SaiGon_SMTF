import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

test('kpi-ab-32 chạy headless, fixed và smart cùng seed cho JSON hợp lệ', () => {
  const outFixed = 'work/kpi-test-fixed.json', outSmart = 'work/kpi-test-smart.json';
  execFileSync(process.execPath, ['scripts/kpi-ab-32.mjs', '--seed', '31031', '--scenario', 'peak-hang-xanh', '--duration', '60', '--mode', 'fixed', '--out', outFixed], { stdio: 'pipe' });
  execFileSync(process.execPath, ['scripts/kpi-ab-32.mjs', '--seed', '31031', '--scenario', 'peak-hang-xanh', '--duration', '60', '--mode', 'smart', '--out', outSmart], { stdio: 'pipe' });
  const f = JSON.parse(fs.readFileSync(outFixed, 'utf8')), s = JSON.parse(fs.readFileSync(outSmart, 'utf8'));
  assert.equal(f.mode, 'fixed');
  assert.equal(s.mode, 'smart');
  assert.equal(f.seed, 31031);
  assert.equal(f.duration_s, 60);
  assert.ok(Array.isArray(f.by_node_hx) && f.by_node_hx.length === 6, 'by_node_hx phải đủ 6 nút HX');
  for (const row of f.by_node_hx) for (const k of ['node_id', 'cluster_id', 'wait_avg_s', 'queue_max', 'flow_per_min']) assert.ok(k in row, `thiếu ${k}`);
  assert.equal(typeof f.wait_avg_s_hx, 'number');
  assert.match(f.state_hash, /^[0-9a-f]{8}$/);
});

test('tất định: chạy hai lần cùng seed cùng mode → cùng wait_avg_s_hx', () => {
  const a = 'work/kpi-test-a.json', b = 'work/kpi-test-b.json';
  for (const out of [a, b]) execFileSync(process.execPath, ['scripts/kpi-ab-32.mjs', '--seed', '31032', '--scenario', 'peak-hang-xanh', '--duration', '60', '--mode', 'smart', '--out', out], { stdio: 'pipe' });
  assert.equal(JSON.parse(fs.readFileSync(a, 'utf8')).wait_avg_s_hx, JSON.parse(fs.readFileSync(b, 'utf8')).wait_avg_s_hx);
});
