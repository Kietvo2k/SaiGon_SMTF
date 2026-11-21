import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlyCutModel32, EXPLAIN_PARAMS_32 } from '../signal-explainer-32.js';
import { SIGNAL_PARAMS_32 } from '../traffic-controller-32.js';

// Dòng tối giản giống previewSignals32: now[g], queue[0..1], segments.
function rowOf({ qA = 1, qB = 5, startS = -10, phaseA = 'green', phaseB = 'red' } = {}) {
  const end = 60 + startS;
  return {
    now: [
      { phase: phaseA, remain_s: end, greenAt_s: null, greenUntil_s: end },
      { phase: phaseB, remain_s: 0, greenAt_s: null, greenUntil_s: null }
    ],
    queue: [qA, qB],
    segments: [
      { group: 0, phase: 'green', start: startS, end },
      { group: 1, phase: 'red', start: startS, end }
    ]
  };
}

test('hằng số giải thích khớp bộ điều khiển thật', () => {
  assert.equal(EXPLAIN_PARAMS_32.minGreenS, SIGNAL_PARAMS_32.minGreenS);
  assert.equal(EXPLAIN_PARAMS_32.maxGreenS, SIGNAL_PARAMS_32.maxGreenS);
  assert.equal(EXPLAIN_PARAMS_32.yellowS, SIGNAL_PARAMS_32.yellowS);
  assert.equal(EXPLAIN_PARAMS_32.switchMargin, SIGNAL_PARAMS_32.switchMargin);
  assert.equal(EXPLAIN_PARAMS_32.decisionIntervalS, SIGNAL_PARAMS_32.decisionIntervalS);
  assert.deepEqual([...EXPLAIN_PARAMS_32.fixedGreenS], [SIGNAL_PARAMS_32.fixed.green0S, SIGNAL_PARAMS_32.fixed.green1S]);
  assert.equal(SIGNAL_PARAMS_32.algorithm, 'max-pressure');
});

test('xanh A 10 giây, A có 1 xe, B có 5 xe: báo khả năng rút xanh', () => {
  const m = earlyCutModel32(rowOf({ qA: 1, qB: 5, startS: -10 }));
  assert.equal(m.active, true);
  assert.equal(m.greenGroup, 0);
  assert.equal(m.otherGroup, 1);
  assert.equal(m.qGreen, 1);
  assert.equal(m.qOther, 5);
  assert.equal(m.elapsedS, 10);
  assert.ok(m.margin > 0.15, `margin ${m.margin} phải trên ngưỡng 0,15`);
  assert.ok(m.pCut5s > 0.5, `pCut5s ${m.pCut5s} phải trên 0,5`);
  assert.ok(Math.abs(m.outcomes.keep + m.outcomes.short + m.outcomes.strong - 1) < 1e-9);
  assert.ok(Math.abs(m.outcomes.short - m.pCut5s * 0.7) < 1e-9);
  assert.ok(Math.abs(m.outcomes.strong - m.pCut5s * 0.3) < 1e-9);
  assert.match(m.reason, /đông hơn/);
  assert.match(m.reason, /5 xe so với 1 xe/);
  assert.match(m.headline, /nhường chiều B/);
  assert.equal(m.strongVisible, true);
});

test('chiều đang xanh đông hơn: không rút, pCut5s = 0', () => {
  const m = earlyCutModel32(rowOf({ qA: 5, qB: 1, startS: -20 }));
  assert.equal(m.active, true);
  assert.equal(m.margin, 0);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.outcomes.keep, 1);
  assert.equal(m.outcomes.short, 0);
  assert.equal(m.outcomes.strong, 0);
  assert.match(m.headline, /giữ xanh/);
});

test('đang trong 8 giây xanh tối thiểu: chưa thể cắt', () => {
  const m = earlyCutModel32(rowOf({ qA: 1, qB: 5, startS: -2 }));
  assert.equal(m.elapsedS, 2);
  assert.equal(m.pCut5s, 0);
  assert.match(m.headline, /8 giây xanh tối thiểu/);
  assert.equal(m.outcomes.keep, 1);
});

test('không có chiều xanh: active=false, pCut5s = 0', () => {
  const row = rowOf({ phaseA: 'yellow', phaseB: 'red' });
  row.segments = [{ group: 1, phase: 'red', start: -3, end: 60 }];
  const m = earlyCutModel32(row);
  assert.equal(m.active, false);
  assert.equal(m.greenGroup, null);
  assert.equal(m.otherGroup, null);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.elapsedS, 0);
  assert.equal(m.outcomes.keep, 1);
  assert.match(m.headline, /Đang chuyển pha/);
});

test('hàng chờ rỗng hoặc không hợp lệ không sinh NaN', () => {
  const cases = [
    { now: [{ phase: 'green' }, null], queue: [], segments: [{ group: 0, phase: 'green', start: -20, end: 5 }] },
    { now: [{ phase: 'green' }, null], queue: [undefined, 'x'] },
    { now: [{ phase: 'green' }, null], queue: [NaN, -3] },
    { now: [{ phase: 'green' }, null], queue: null, segments: null }
  ];
  for (const row of cases) {
    const m = earlyCutModel32(row);
    for (const key of ['qGreen', 'qOther', 'elapsedS', 'margin', 'pCut5s']) {
      assert.ok(Number.isFinite(m[key]), `${key} phải hữu hạn, nhận ${m[key]}`);
    }
    assert.ok(Number.isFinite(m.outcomes.keep) && Number.isFinite(m.outcomes.short) && Number.isFinite(m.outcomes.strong));
    assert.ok(m.pCut5s >= 0 && m.pCut5s <= 1);
    assert.ok(m.outcomes.keep + m.outcomes.short + m.outcomes.strong > 0.999999);
  }
  const empty = earlyCutModel32(null);
  assert.equal(empty.active, false);
  assert.equal(empty.pCut5s, 0);
  assert.ok(Number.isFinite(empty.margin));
});

test('dự báo live không có start âm: lấy greenLen thích ứng làm số giây đã xanh', () => {
  const m = earlyCutModel32({
    now: [{ phase: 'green' }, null],
    queue: [0, 6],
    segments: [{ group: 0, phase: 'green', start: 0, end: 25 }],
    plannedGreen: { source: 'adaptive', green: [14, 14.7] }
  });
  assert.equal(m.elapsedS, 14);
  assert.ok(m.pCut5s > 0.5);
  // greenLen = 8 chưa chắc đã qua 8 s tối thiểu: vẫn coi là trong mốc tối thiểu.
  const early = earlyCutModel32({
    now: [{ phase: 'green' }, null],
    queue: [0, 6],
    segments: [{ group: 0, phase: 'green', start: 0, end: 40 }],
    plannedGreen: { source: 'adaptive', green: [8, 8] }
  });
  assert.equal(early.elapsedS, 0);
  assert.equal(early.pCut5s, 0);
  // Nguồn fixed/cycle không phải số giây đã xanh: bỏ qua.
  const fixed = earlyCutModel32({
    now: [{ phase: 'green' }, null],
    queue: [0, 6],
    segments: [{ group: 0, phase: 'green', start: 0, end: 20 }],
    plannedGreen: { source: 'fixed', green: [22, 16] }
  });
  assert.equal(fixed.elapsedS, 0);
});

test('P1: đang xanh 15 xe, chiều kia 0 xe — giữ xanh, không nói gần nhau', () => {
  const m = earlyCutModel32(rowOf({ qA: 15, qB: 0, startS: -10 }));
  assert.equal(m.qGreen, 15);
  assert.equal(m.qOther, 0);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.headline, 'Chiều đang xanh đông hơn — giữ xanh.');
  assert.doesNotMatch(m.headline, /gần nhau/);
  assert.equal(m.outcomes.keep, 1);
  assert.equal(m.outcomes.strong, 0);
  assert.equal(m.strongAllowed, true); // 15 xe ở chiều đông hơn → đủ điều kiện Rút mạnh, nhưng pCut = 0
  assert.equal(m.strongVisible, false); // pCut = 0 nên không hiện hàng Rút mạnh
});

test('P1: đang xanh 5 xe, chiều kia 0 xe — giữ xanh', () => {
  const m = earlyCutModel32(rowOf({ qA: 5, qB: 0, startS: -10 }));
  assert.equal(m.headline, 'Chiều đang xanh đông hơn — giữ xanh.');
  assert.doesNotMatch(m.headline, /gần nhau/);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.strongVisible, false);
});

test('P1: 0 so với 0 xe — hai chiều bằng nhau', () => {
  const m = earlyCutModel32(rowOf({ qA: 0, qB: 0, startS: -10 }));
  assert.equal(m.headline, 'Hai chiều bằng nhau — giữ xanh.');
  assert.equal(m.pCut5s, 0);
  assert.equal(m.strongVisible, false);
});

test('P1: 3 so với 3 xe — hai chiều bằng nhau', () => {
  const m = earlyCutModel32(rowOf({ qA: 3, qB: 3, startS: -10 }));
  assert.equal(m.headline, 'Hai chiều bằng nhau — giữ xanh.');
  assert.equal(m.pCut5s, 0);
  assert.equal(m.strongVisible, false);
});

test('P1: 7 so với 8 xe — chênh dưới 15% mới gọi gần nhau', () => {
  const m = earlyCutModel32(rowOf({ qA: 7, qB: 8, startS: -10 }));
  assert.ok(m.margin <= EXPLAIN_PARAMS_32.switchMargin);
  assert.equal(m.headline, 'Hai chiều gần nhau — giữ xanh.');
  assert.equal(m.pCut5s, 0);
});

test('P1: đang xanh 8 xe, chiều kia 7 xe — vẫn giữ xanh', () => {
  const m = earlyCutModel32(rowOf({ qA: 8, qB: 7, startS: -10 }));
  assert.equal(m.headline, 'Chiều đang xanh đông hơn — giữ xanh.');
  assert.equal(m.pCut5s, 0);
});

test('P2: chiều chờ 1 xe — cap pCut 0,6 và không có Rút mạnh', () => {
  const m = earlyCutModel32(rowOf({ qA: 0, qB: 1, startS: -10 }));
  assert.equal(m.strongAllowed, false);
  assert.equal(m.strongVisible, false);
  assert.ok(Math.abs(m.pCut5s - 0.6) < 1e-9, `pCut ${m.pCut5s} phải bị cap 0,6`);
  assert.equal(m.outcomes.strong, 0);
  assert.ok(Math.abs(m.outcomes.short - m.pCut5s) < 1e-9);
  assert.ok(Math.abs(m.outcomes.keep + m.outcomes.short + m.outcomes.strong - 1) < 1e-9);
});

test('P2: chiều chờ 2 xe — cho phép Rút mạnh', () => {
  const m = earlyCutModel32(rowOf({ qA: 0, qB: 2, startS: -10 }));
  assert.equal(m.strongAllowed, true);
  assert.equal(m.strongVisible, true);
  assert.ok(m.outcomes.strong > 0);
  assert.ok(Math.abs(m.outcomes.strong - m.pCut5s * 0.3) < 1e-9);
  assert.ok(Math.abs(m.outcomes.keep + m.outcomes.short + m.outcomes.strong - 1) < 1e-9);
});

test('P2: fixed mode — không rút xanh, báo đúng chu kỳ A 22 / B 16', () => {
  const row = rowOf({ qA: 0, qB: 8, startS: -20 });
  row.plannedGreen = { source: 'fixed', green: [22, 16] };
  const m = earlyCutModel32(row);
  assert.equal(m.fixed, true);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.strongAllowed, false);
  assert.equal(m.strongVisible, false);
  assert.equal(m.outcomes.keep, 1);
  assert.equal(m.outcomes.short, 0);
  assert.equal(m.outcomes.strong, 0);
  assert.match(m.headline, /Đèn cố định/);
  assert.match(m.headline, /A 22s/);
  assert.match(m.headline, /B 16s/);
  assert.doesNotMatch(m.headline, /8 giây xanh tối thiểu/);
  // Nếu controller đổi bảng fixed, nhãn lấy đúng green[0]/green[1] của row.
  const custom = rowOf({ qA: 0, qB: 8, startS: -20 });
  custom.plannedGreen = { source: 'fixed', green: [25, 14] };
  const c = earlyCutModel32(custom);
  assert.match(c.headline, /A 25s/);
  assert.match(c.headline, /B 14s/);
  assert.equal(c.pCut5s, 0);
});

test('P2-R2: q_out trong queue — margin dùng pressure count − q_out', () => {
  const base = rowOf({ qA: 2, qB: 3, startS: -10 });
  const countOnly = earlyCutModel32(base);
  assert.equal(countOnly.pressureFromQueue, false);
  assert.ok(Math.abs(countOnly.margin - 0.2) < 1e-9);
  assert.ok(countOnly.pCut5s > 0);
  assert.equal(countOnly.strongVisible, true);

  const withOut = rowOf({ qA: 2, qB: 3, startS: -10 });
  withOut.queue = [{ count: 2, q_out: 0 }, { count: 3, q_out: 2 }];
  const m = earlyCutModel32(withOut);
  assert.equal(m.pressureFromQueue, true);
  assert.equal(m.qA, 2);
  assert.equal(m.qB, 3);
  assert.equal(m.qGreen, 2);
  assert.equal(m.qOther, 3);
  assert.equal(m.pGreen, 2);
  assert.equal(m.pOther, 1);
  assert.equal(m.margin, 0);
  assert.equal(m.pCut5s, 0);
  assert.equal(m.strongVisible, false);
});

test('P2-R2: row.qOut dạng mảng cũng được dùng; thiếu q_out thì đánh dấu ước lượng', () => {
  const withOut = rowOf({ qA: 2, qB: 3, startS: -10 });
  withOut.qOut = [0, 2];
  const m = earlyCutModel32(withOut);
  assert.equal(m.pressureFromQueue, true);
  assert.equal(m.pGreen, 2);
  assert.equal(m.pOther, 1);
  assert.equal(m.margin, 0);
  assert.equal(m.pCut5s, 0);

  const noOut = earlyCutModel32(rowOf({ qA: 2, qB: 3, startS: -10 }));
  assert.equal(noOut.pressureFromQueue, false);
  assert.equal(noOut.pOther, noOut.qOther);
  assert.equal(noOut.pGreen, noOut.qGreen);
});

test('đọc được pha xanh chỉ từ segments khi thiếu now', () => {
  const m = earlyCutModel32({
    queue: [6, 2],
    segments: [
      { group: 1, phase: 'green', start: -12, end: 4 },
      { group: 0, phase: 'red', start: -12, end: 4 }
    ]
  });
  assert.equal(m.active, true);
  assert.equal(m.greenGroup, 1);
  assert.equal(m.otherGroup, 0);
  assert.equal(m.elapsedS, 12);
  assert.ok(m.pCut5s > 0);
});
