/* signal-explainer-32.js — giải thích vì sao đèn xanh có thể bị rút ngắn.
   Mô hình MINH HỌA, thuần JS, không dùng Math.random và không điều khiển đèn.
   Bộ điều khiển thật (traffic-controller-32.js, decideA) là tất định:
   - xanh tối thiểu 8 s, tối đa 45 s, kiểm tra lại mỗi 1 s;
   - sau 8 s, nếu chênh áp lực hai nhóm ≥ 15% và nhóm kia áp lực hơn thì kết thúc xanh;
   - vàng luôn 3 s rồi đỏ (all-red 2 s).
   Xác suất dưới đây chỉ là cách diễn giải hàng chờ hiện tại cho người xem, KHÔNG phải
   xúc xắc và không được dùng để quyết định pha. */

export const EXPLAIN_PARAMS_32 = Object.freeze({
  minGreenS: 8,
  maxGreenS: 45,
  yellowS: 3,
  switchMargin: 0.15,
  decisionIntervalS: 1,
  // Bảng xanh cố định của SIGNAL_PARAMS_32.fixed (A 22 s, B 16 s) để panel nói đúng
  // khi controller đang áp dụng chế độ cố định, không trộn với mốc thích ứng 8–45 s.
  fixedGreenS: Object.freeze([22, 16])
});

const GROUP_NAME = ['A', 'B'];
const CUT_WINDOW_S = 5;

const clamp01 = v => Math.min(1, Math.max(0, v));
// Hàng chờ có thể thiếu/âm/không phải số: quy về 0 để không sinh NaN.
const countOf = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmtNum = v => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const groupName = g => GROUP_NAME[g] ?? '?';

// Nhóm đang xanh tại thời điểm hiện tại (t = 0 của dự báo). Ưu tiên row.now,
// sau đó tìm đoạn segments đang chạy (start ≤ 0 < end) để chịu được dữ liệu chỉ có segments.
function activeGreenGroup(row) {
  const now = Array.isArray(row?.now) ? row.now : [];
  for (const g of [0, 1]) {
    if (now[g]?.phase === 'green') return g;
  }
  const segments = Array.isArray(row?.segments) ? row.segments : [];
  for (const s of segments) {
    const g = Number(s?.group);
    if (s?.phase !== 'green' || !(g === 0 || g === 1)) continue;
    const start = Number(s.start), end = Number(s.end);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= 0 && end > 0) return g;
  }
  return null;
}

// Số giây nhóm đang xanh đã chạy: đoạn xanh chứa mốc 0 có start âm.
function elapsedGreenS(row, group) {
  const segments = Array.isArray(row?.segments) ? row.segments : [];
  for (const s of segments) {
    if (Number(s?.group) !== group || s?.phase !== 'green') continue;
    const start = Number(s.start), end = Number(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= 0 && end > 0) return Math.max(0, -start);
  }
  return 0;
}

// Dự báo 60 s dựng lại từ mốc 0 nên đoạn đang chạy có start = 0, không cho biết đã xanh bao lâu.
// Với controller thích ứng, plannedGreen.green[0] là greenLen của nhóm đang phục vụ — decideA
// ghi lại số giây đã xanh mỗi 1 s. Dùng làm nguồn dự phòng, kẹp [0, maxGreen]; nhờ vậy panel
// live có số thật thay vì luôn đứng ở giây 0 (vẫn giữ mốc 8 s tối thiểu).
function elapsedFromPlan32(row) {
  const planned = row?.plannedGreen;
  if (!planned || planned.source !== 'adaptive' || !Array.isArray(planned.green)) return null;
  const raw = Number(planned.green[0]);
  if (!Number.isFinite(raw) || raw < 0) return null;
  // greenLen = 8 khi vừa sang xanh hoặc vừa chạm mốc 8 (decideA chỉ ghi 9 ở nhịp sau).
  // Chưa chắc đã qua 8 s tối thiểu nên trả 0 để không báo "có thể cắt" quá sớm.
  if (raw <= EXPLAIN_PARAMS_32.minGreenS) return 0;
  return Math.min(EXPLAIN_PARAMS_32.maxGreenS, raw);
}

// Hàng chờ có thể là số (preview hiện tại) hoặc object/row có q_out như controller.
// Khi có q_out, áp lực = count − q_out đúng như decideA; khi không có, dùng count và
// panel phải ghi "Ước lượng theo hàng chờ".
function groupPressure32(row, group) {
  const raw = row?.queue?.[group];
  let count = 0, out = 0, hasOut = false;
  const add = item => {
    if (item && typeof item === 'object') {
      count += countOf(item.count ?? item.q_in ?? item.value);
      if (item.q_out != null || item.qOut != null) {
        out += countOf(item.q_out ?? item.qOut);
        hasOut = true;
      }
    } else count += countOf(item);
  };
  if (Array.isArray(raw)) { for (const item of raw) add(item); } else add(raw);
  if (Array.isArray(row?.qOut) && row.qOut[group] != null) {
    out = countOf(row.qOut[group]);
    hasOut = true;
  }
  return { count, pressure: count - out, hasOut };
}

/**
 * Ước lượng trực quan cho một giao lộ đang xanh.
 * `row.queue[g]` có thể là số (preview hiện tại) hoặc object/row có `q_out`;
 * khi có `q_out` (hoặc `row.qOut`), margin dùng pressure = count − q_out như controller.
 * @param {object|null} row dòng của previewSignals32: {now, queue, segments, plannedGreen?, qOut?}
 * @returns {{active:boolean, fixed:boolean, greenGroup:number|null, otherGroup:number|null,
 *   qA:number, qB:number, qGreen:number, qOther:number, pGreen:number, pOther:number, pressureFromQueue:boolean,
 *   elapsedS:number, margin:number, pCut5s:number, strongAllowed:boolean, strongVisible:boolean,
 *   outcomes:{keep:number, short:number, strong:number}, headline:string, reason:string}}
 */
export function earlyCutModel32(row) {
  const P = EXPLAIN_PARAMS_32;
  const fixed = row?.plannedGreen?.source === 'fixed';
  const greenGroup = activeGreenGroup(row);
  const active = greenGroup !== null;
  const otherGroup = active ? (greenGroup === 0 ? 1 : 0) : null;
  const pressA = groupPressure32(row, 0);
  const pressB = groupPressure32(row, 1);
  const greenPress = active ? (greenGroup === 0 ? pressA : pressB) : { count: 0, pressure: 0, hasOut: false };
  const otherPress = active ? (greenGroup === 0 ? pressB : pressA) : { count: 0, pressure: 0, hasOut: false };
  const qA = pressA.count;
  const qB = pressB.count;
  const qGreen = greenPress.count;
  const qOther = otherPress.count;
  const pGreen = greenPress.pressure;
  const pOther = otherPress.pressure;
  const pressureFromQueue = pressA.hasOut || pressB.hasOut;
  const fromSegments = active ? elapsedGreenS(row, greenGroup) : 0;
  const fromPlan = active ? elapsedFromPlan32(row) : null;
  // Ưu tiên mốc âm trong segments; nếu không có (dữ liệu preview thật) lấy greenLen thích ứng.
  const elapsedS = fromSegments > 0 ? fromSegments : (fromPlan ?? 0);

  // Chênh áp lực: dùng count − q_out nếu dữ liệu có, ngược lại dùng count (ước lượng).
  // Chỉ tính khi áp lực chiều kia lớn hơn chiều đang xanh.
  const margin = active ? clamp01(Math.max(0, pOther - pGreen) / Math.max(1, pGreen + pOther)) : 0;
  const base = clamp01((margin - P.switchMargin) / (1 - P.switchMargin));
  // Cửa sổ 5 s tới: phần nằm sau mốc xanh tối thiểu mới có thể bị cắt.
  const eligibleS = elapsedS < P.minGreenS
    ? Math.max(0, CUT_WINDOW_S - (P.minGreenS - elapsedS))
    : CUT_WINDOW_S;
  const rawCut = (active && !fixed) ? clamp01(1 - Math.pow(1 - base, eligibleS)) : 0;

  // Mô hình minh họa: chỉ cho "Rút mạnh" khi chiều đông hơn (max hai chiều) có ít nhất 2 xe.
  // Dưới 2 xe thì chặn pCut ở 0,6 và dồn phần còn lại vào "Rút ngắn" (strong = 0).
  const strongAllowed = !fixed && Math.max(qGreen, qOther) >= 2;
  const pCut5s = strongAllowed ? rawCut : Math.min(rawCut, 0.6);
  // Chỉ hiện hàng "Rút mạnh" khi có một lần cắt thật: đang xanh, chiều kia đông hơn
  // ít nhất 2 xe và pCut > 0. pCut = 0 hoặc chiều xanh đông hơn/bằng → ẩn hẳn hàng.
  const strongVisible = !fixed && qOther > qGreen && qOther >= 2 && pCut5s > 0;
  const outcomes = strongVisible
    ? { keep: 1 - pCut5s, short: pCut5s * 0.7, strong: pCut5s * 0.3 }
    : { keep: 1 - pCut5s, short: pCut5s, strong: 0 };

  let headline, reason;
  if (fixed) {
    // Ưu tiên bảng fixed thật trong row.plannedGreen (controller có thể đổi params);
    // EXPLAIN_PARAMS_32.fixedGreenS chỉ là mặc định/đối chiếu test.
    const green = Array.isArray(row?.plannedGreen?.green) ? row.plannedGreen.green : P.fixedGreenS;
    const a = Number(green[0]), b = Number(green[1]);
    headline = `Đèn cố định · chu kỳ A ${fmtNum(Number.isFinite(a) ? a : P.fixedGreenS[0])}s / B ${fmtNum(Number.isFinite(b) ? b : P.fixedGreenS[1])}s`;
    reason = 'Chu kỳ cố định, không rút ngắn theo hàng chờ.';
  } else if (!active) {
    headline = 'Đang chuyển pha.';
    reason = 'Chưa có chiều nào đang xanh — đèn đang vàng hoặc đỏ.';
  } else if (elapsedS < P.minGreenS) {
    headline = 'Đang trong 8 giây xanh tối thiểu, chưa thể cắt.';
    reason = `Chiều ${groupName(greenGroup)} đã xanh ${fmtNum(Math.round(elapsedS * 10) / 10)} giây; còn ${fmtNum(Math.ceil(P.minGreenS - elapsedS))} giây tối thiểu.`;
  } else if (qGreen > qOther) {
    headline = 'Chiều đang xanh đông hơn — giữ xanh.';
    reason = `Chiều ${groupName(greenGroup)} ${fmtNum(qGreen)} xe · chiều ${groupName(otherGroup)} ${fmtNum(qOther)} xe.`;
  } else if (qGreen === qOther) {
    headline = 'Hai chiều bằng nhau — giữ xanh.';
    reason = `Chiều ${groupName(greenGroup)} và ${groupName(otherGroup)} cùng ${fmtNum(qGreen)} xe.`;
  } else if (margin <= P.switchMargin && qGreen > 0 && qOther > 0) {
    // Chỉ gọi "gần nhau" khi chênh thực sự ≤15% và cả hai chiều đều có xe.
    headline = 'Hai chiều gần nhau — giữ xanh.';
    reason = `Chiều ${groupName(greenGroup)} ${fmtNum(qGreen)} xe · chiều ${groupName(otherGroup)} ${fmtNum(qOther)} xe (chênh dưới 15%).`;
  } else {
    headline = `Có thể rút ngắn xanh để nhường chiều ${groupName(otherGroup)}.`;
    reason = `Chiều ${groupName(otherGroup)} đông hơn: ${fmtNum(qOther)} xe so với ${fmtNum(qGreen)} xe.`;
  }

  return {
    active, fixed, greenGroup, otherGroup,
    qA, qB, qGreen, qOther, pGreen, pOther, pressureFromQueue,
    elapsedS, margin, pCut5s, strongAllowed, strongVisible, outcomes, headline, reason
  };
}

export default earlyCutModel32;
