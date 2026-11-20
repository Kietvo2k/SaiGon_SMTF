// signal-plan-32.test.mjs — demo-v2 (P1-8): xanh kế hoạch + xác suất kẹt trong thanh tra đèn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewSignals32 } from '../signal-preview-32.js';
import { createSignalController32, SIGNAL_PARAMS_32 } from '../traffic-controller-32.js';

function fixture({ mode = 'fixed', params = {} } = {}) {
  const net = { G: { nodes: [{ id: 366390689 }, { id: 2 }] }, signal: [1, 0], signalOffset: [0, 0], Rz: [10, 10],
    lanes: { to: [0, 0, 1], from: [1, 1, 0], st: [0, 1, 2], length: [100, 100, 100], edge: [0, 1, 2] }, arriveGroup: [0, 1, 0],
    signalPlan: { signalNodes: [0], clusters: [{ cluster_id: 'HX-C1', nodeIds: [0], offset_s: 0 }], internalSt: new Set() } };
  const sim = { N: 2, active: Uint8Array.from([1, 1]), lane: Int32Array.from([0, 1]), s: Float32Array.from([75, 75]), v: Float32Array.from([0, 0]), counters: { t: 0 } };
  const controller = createSignalController32({ net, sim, mode, params });
  return { net, sim, controller, rows: [{ id: 'HX-C1', nodeIds: ['HX-01'], indexes: [0] }] };
}

test('P1-8: plannedGreenOf — fixed trả bảng cứng, adaptive kẹp trong [min, max], cycle trả chia chu kỳ', () => {
  const fixed = fixture();
  assert.deepEqual(fixed.controller.plannedGreenOf('HX-01', 0), { source: 'fixed', green: [SIGNAL_PARAMS_32.fixed.green0S, SIGNAL_PARAMS_32.fixed.green1S] });
  const smart = fixture({ mode: 'smart' });
  const plan = smart.controller.plannedGreenOf('HX-01', 0);
  assert.equal(plan.source, 'adaptive');
  for (const g of plan.green) assert.ok(g >= SIGNAL_PARAMS_32.minGreenS && g <= SIGNAL_PARAMS_32.maxGreenS, `xanh kế hoạch ${g} ngoài [min,max]`);
  const cycle = fixture({ mode: 'smart', params: { algorithm: 'cycle-max-pressure' } });
  const planCycle = cycle.controller.plannedGreenOf('HX-01', 0);
  assert.equal(planCycle.source, 'cycle');
  const total = planCycle.green[0] + planCycle.green[1];
  assert.ok(Math.abs(total - 38) < 1e-9, `tổng xanh chu kỳ ${total} phải 38 s`);
});

test('P1-8: preview gắn xác suất kẹt đúng nút — chỉ nút có cạnh vào đang cảnh báo', () => {
  const f = fixture();
  const alerts = [
    { edge: 0, prob: 0.82, reliability: 0.71, horizonMin: 10, name: 'Điện Biên Phủ vào Hàng Xanh' },
    { edge: 2, prob: 0.95, reliability: 0.9, horizonMin: 20, name: 'cạnh không thuộc nút' }
  ];
  const out = previewSignals32({ ...f, alerts });
  const row = out.rows[0];
  assert.ok(row.jam, 'nút có cạnh 0 vào phải nhận cảnh báo');
  assert.equal(row.jam.prob, 0.82);
  assert.equal(row.jam.reliability, 0.71);
  assert.equal(row.jam.horizonMin, 10);
  assert.match(row.jam.name, /Điện Biên Phủ/);
  // không có cảnh báo chạm nút → null (không bịa số)
  const quiet = previewSignals32({ ...f, alerts: [{ edge: 2, prob: 0.95, reliability: 0.9, horizonMin: 20 }] });
  assert.equal(quiet.rows[0].jam, null);
});

test('P1-8: preview mang xanh kế hoạch xuống từng dòng cho thanh tra đèn', () => {
  const f = fixture();
  const out = previewSignals32(f);
  const row = out.rows[0];
  assert.equal(row.plannedGreen.source, 'fixed');
  assert.deepEqual(row.plannedGreen.green, [SIGNAL_PARAMS_32.fixed.green0S, SIGNAL_PARAMS_32.fixed.green1S]);
  const smart = fixture({ mode: 'smart' });
  const rowsSmart = previewSignals32(smart).rows;
  assert.equal(rowsSmart[0].plannedGreen.source, 'adaptive');
});
