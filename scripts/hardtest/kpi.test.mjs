import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateKpi } from './kpi.mjs';

function summary() {
  const seeds = [31031, 31032, 31033, 31034, 31035];
  const scenario = 'peak-hang-xanh';
  const rows = seeds.map(seed => {
    const common = {
      seed,
      scenario,
      duration_s: 1800,
      a1_window_s: [300, 1800],
      demand: { poolScale: 2 },
      breaker_s: 180,
    };
    return {
      seed,
      fixed: { ...common, mode: 'fixed', a1_delay_s_hx: 100, a1_crossings_hx: 200 },
      smart: { ...common, mode: 'smart', a1_delay_s_hx: 85, a1_crossings_hx: 190 },
      delta_pct: 999,
      throughput_delta_pct: -999,
    };
  });
  return { scenario, seeds, rows, duration_s: 1800, window_s: [300, 1800], pass_threshold: false };
}

test('SIM-A1 accepts exact boundaries computed from the paired measurements', () => {
  const result = validateKpi(summary());
  assert.equal(result.ok, true);
  assert.equal(result.meanDelayImprovementPct, 15);
  assert.equal(result.rows[0].throughputLossPct, 5);
});

test('SIM-A1 rejects a throughput regression in a single seed', () => {
  const data = summary();
  data.rows[1].smart.a1_crossings_hx = 189;
  const result = validateKpi(data);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /31032/);
});

test('SIM-A1 rejects a copied pass flag and a zero baseline', () => {
  const data = summary();
  data.pass_threshold = true;
  data.rows[0].fixed.a1_delay_s_hx = 0;
  assert.equal(validateKpi(data).ok, false);
});

test('SIM-A1 rejects unequal demand, missing seeds and duplicate seeds', () => {
  const mismatched = summary();
  mismatched.rows[0].smart.demand = { poolScale: 3 };
  assert.equal(validateKpi(mismatched).ok, false);
  const missing = summary();
  missing.rows.pop();
  assert.equal(validateKpi(missing).ok, false);
  const duplicate = summary();
  duplicate.rows[1] = duplicate.rows[0];
  assert.equal(validateKpi(duplicate).ok, false);
});
