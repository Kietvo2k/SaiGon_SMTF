import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateKpi } from './kpi.mjs';

const seeds = [31031, 31032, 31033, 31034, 31035];
const scenario = 'peak-hang-xanh';
const windowS = [300, 1800];

// Dữ liệu các đoạn chờ và thời điểm qua vạch theo từng chuyến.
// Hai lượt ngoài cửa sổ có độ trễ khác biệt để phát hiện sai mẫu số.
function crossings(count, waitS) {
  return [
    { vehicle: 'sớm', at: 299, waits: [[159, 299]] },
    ...Array.from({ length: count }, (_, index) => {
      const at = index === count - 1 ? 1800 : 300 + 70 * index;
      return {
        vehicle: `xe-${index + 1}`,
        at,
        waits: [[at - waitS - 2, at - waitS + 1], [at - waitS + 3, at]],
      };
    }),
    { vehicle: 'muộn', at: 1801, waits: [[1661, 1801]] },
  ];
}

function measure(trace, seed, mode) {
  let totalWait = 0;
  let count = 0;
  let lastCrossing = 0;
  const vehicles = new Set();
  for (const { vehicle, at, waits } of trace) {
    assert.ok(at >= lastCrossing, 'Lượt qua vạch phải theo thứ tự thời gian');
    lastCrossing = at;
    assert.ok(!vehicles.has(vehicle), `Đếm trùng chuyến ${vehicle}`);
    vehicles.add(vehicle);
    if (at < windowS[0] || at > windowS[1]) continue;
    count += 1;
    let lastWaitEnd = 0;
    for (const [start, end] of waits) {
      assert.ok(start >= lastWaitEnd && start < end && end <= at, `Khoảng chờ sai hoặc chồng lấn ở ${vehicle}`);
      totalWait += end - start;
      lastWaitEnd = end;
    }
  }
  return {
    seed,
    scenario,
    mode,
    duration_s: 1800,
    a1_window_s: windowS,
    a1_delay_s_hx: count === 0 ? 0 : totalWait / count,
    a1_crossings_hx: count,
    breaker_s: null,
    demand: { fixture: 'trace-cross-v1' },
  };
}

function summary(smartCounts = seeds.map(() => 19)) {
  // Tính tay theo từng cặp cho mức giảm [0, 20, 10, 25, 20] %.
  const fixedWaits = [20, 40, 60, 80, 100];
  const smartWaits = [20, 32, 54, 60, 80];
  return {
    scenario,
    duration_s: 1800,
    window_s: windowS,
    seeds,
    rows: seeds.map((seed, index) => ({
      seed,
      fixed: measure(crossings(20, fixedWaits[index]), seed, 'fixed'),
      smart: measure(crossings(smartCounts[index], smartWaits[index]), seed, 'smart'),
    })),
  };
}

test('GATE-CROSS-01 · đủ mép cửa sổ, trung bình theo cặp đúng 15% và từng seed giảm lưu lượng đúng 5%', () => {
  const report = summary();
  assert.deepEqual(report.rows.map(row => [row.fixed.a1_crossings_hx, row.smart.a1_crossings_hx]),
    [[20, 19], [20, 19], [20, 19], [20, 19], [20, 19]]);
  assert.deepEqual(report.rows.map(row => row.fixed.a1_delay_s_hx), [20, 40, 60, 80, 100]);
  assert.deepEqual(report.rows.map(row => row.smart.a1_delay_s_hx), [20, 32, 54, 60, 80]);

  const result = validateKpi(report);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.meanDelayImprovementPct, 15);
  assert.deepEqual(result.rows.map(row => row.delayImprovementPct), [0, 20, 10, 25, 20]);
  assert.deepEqual(result.rows.map(row => row.throughputLossPct), [5, 5, 5, 5, 5]);
});

test('GATE-CROSS-02 · một seed vượt 5% vẫn bị chặn dù độ trễ và lưu lượng trung bình đều đạt', () => {
  const report = summary([20, 18, 19, 19, 19]);
  report.pass_threshold = true;
  report.throughput_ok = true;
  const result = validateKpi(report);
  assert.equal(result.meanDelayImprovementPct, 15);
  assert.deepEqual(result.rows.map(row => row.throughputLossPct), [0, 10, 5, 5, 5]);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /31032.*10[.,]00%/);
});

test('GATE-CROSS-03 · cách đo chéo từ chối lượt trùng, thời điểm đảo thứ tự và khoảng chờ chồng lấn', () => {
  const duplicate = crossings(2, 20);
  duplicate[2].vehicle = duplicate[1].vehicle;
  assert.throws(() => measure(duplicate, 31031, 'fixed'), /Đếm trùng chuyến/);

  const reordered = crossings(2, 20);
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.throws(() => measure(reordered, 31031, 'fixed'), /thứ tự thời gian/);

  const overlapping = crossings(2, 20);
  overlapping[1].waits[1][0] = overlapping[1].waits[0][1] - 1;
  assert.throws(() => measure(overlapping, 31031, 'fixed'), /chồng lấn/);
});

const fixture = JSON.parse(readFileSync(new URL('../../docs/agent/fixtures/public-demo-v1.json', import.meta.url), 'utf8'));

test('GATE-CROSS-04 · hợp đồng mẫu phân biệt lệnh chờ với ACK và trạng thái kết thúc lỗi', () => {
  const { pending, applied, rejected, expired } = fixture.commands;
  assert.equal(pending.status, 'pending');
  assert.equal(pending.applied_t_sim, null);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.command_id, pending.command_id);
  assert.ok(Number.isFinite(applied.applied_t_sim) && applied.applied_t_sim >= fixture.snapshot.simulation.t_sim);
  for (const [command, status, reason] of [
    [rejected, 'rejected', 'COMMAND_REJECTED'],
    [expired, 'expired', 'COMMAND_EXPIRED'],
  ]) {
    assert.equal(command.status, status);
    assert.equal(command.reason_code, reason);
    assert.equal(command.applied_t_sim, null);
  }
  assert.deepEqual(fixture.events.filter(event => event.event === 'command.updated').map(event => event.data), [applied]);
});

test('GATE-CROSS-05 · hộp AI của fixture nằm trọn trong ảnh và gắn đúng khung, trạng thái trống khác trạng thái lỗi', () => {
  const { positive, empty, error } = fixture.inference;
  const frame = fixture.snapshot.cameras.find(camera => camera.camera_id === positive.camera_id);
  assert.ok(frame);
  assert.equal(positive.frame_id, frame.frame_id);
  assert.equal(positive.status, 'ready');
  assert.ok(positive.detections.length > 0);
  for (const { box, confidence } of positive.detections) {
    assert.equal(box.length, 4);
    const [x, y, width, height] = box;
    assert.ok(box.every(Number.isFinite));
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= 1 && y + height <= 1);
    assert.ok(confidence >= 0 && confidence <= 1);
  }
  assert.equal(empty.status, 'ready');
  assert.deepEqual(empty.detections, []);
  assert.equal(error.status, 'error');
  assert.deepEqual(error.detections, []);
  assert.ok(error.error?.code);
});
