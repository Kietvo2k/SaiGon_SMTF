// forecast-32.js - du bao ket thong ke M4, thuan JS, ES module, chay duoc trong Node va trinh duyet.
// Khong tua sim o day. Phan tua ban sao sim trong Web Worker se do task sau lam (can serialize trang thai sim).

// M5a — hiệu chỉnh xác suất (công thức mới, đã thử trong test/m5a-32.test.mjs):
//   1) Cạnh đang thông (mức hiện tại < FREE_LEVEL_32 = 0,3) ở horizon ≥ 30 phút: prob ≤ PROB_CAP_FREE_32 (0,5),
//      TRỪ KHI xu hướng tăng rõ: mức tăng quan sát trong cửa sổ gần nhất ≥ RISE_CLEAR_32 (0,15) VÀ mức tăng dự kiến
//      slope·60·h ≥ RISE_CLEAR_32 (0,15).
//   2) Độ tin cậy giảm theo horizon: rel ← rel · (1 − REL_DECAY_32 · min(1, h/30)); 10 phút ×0,917, 20 phút ×0,833, 30 phút ×0,75.
// Trước M5a: cạnh thông vẫn đạt 92–93 % ở 30 phút (tua trước + sigmoid) nên cảnh báo tràn lan.
export const CAL_VERSION_32 = 'forecast-cal-32a';
export const PROB_CAP_FREE_32 = 0.5;
export const FREE_LEVEL_32 = 0.3;
export const RISE_CLEAR_32 = 0.15;
export const REL_DECAY_32 = 0.25;
const clamp01 = v => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function calibrateForecast32({ prob, reliability, level, horizonMin, slope = 0, n = 0, observedRise = 0 }) {
  const h = Math.max(0, Number(horizonMin) || 0);
  let p = clamp01(Number(prob));
  const projRise = (Number(slope) || 0) * h * 60;
  const rising = n >= 2 && Number(observedRise) >= RISE_CLEAR_32 && projRise >= RISE_CLEAR_32;
  if (h >= 30 && Number.isFinite(level) && level < FREE_LEVEL_32 && !rising) p = Math.min(p, PROB_CAP_FREE_32);
  const rel = clamp01(Number(reliability) * (1 - REL_DECAY_32 * Math.min(1, h / 30)));
  return { prob: p, reliability: rel };
}

// Độ dốc (mức/giây) của chuỗi điểm {t, level}; dùng chung cho hiệu chỉnh.
export function slopeOf32(points) { return linregSlope(Array.isArray(points) ? points : []); }

function linregSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    const t = Number(p.t), y = Number(p.level);
    if (!Number.isFinite(t) || !Number.isFinite(y)) continue;
    sx += t; sy += y; sxx += t * t; sxy += t * y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return 0;
  return (n * sxy - sx * sy) / denom;
}

function stdev(points) {
  const n = points.length;
  if (n < 2) return 0;
  let mean = 0;
  for (const p of points) mean += Number(p.level);
  mean /= n;
  let s = 0;
  for (const p of points) { const d = Number(p.level) - mean; s += d * d; }
  return Math.sqrt(s / (n - 1));
}

function horizonWeight(horizonMin) {
  const h = Math.max(0, Number(horizonMin) || 0);
  return Math.max(0, Math.min(1, 0.1 + h / 50));
}

// Dự báo thô (chưa hiệu chỉnh): dùng để trộn với tua trước rồi hiệu chỉnh MỘT lần ở heat-live-32.
export function forecastRaw32(o) {
  const hist = Array.isArray(o.history) ? o.history : [];
  const rec = Array.isArray(o.recent) ? o.recent : [];
  const h = Math.max(0, Number(o.horizonMin) || 10);
  let histMean = 0, histN = 0;
  for (const v of hist) {
    const x = Number(v);
    if (Number.isFinite(x)) { histMean += Math.max(0, Math.min(1, x)); histN++; }
  }
  histMean = histN > 0 ? histMean / histN : 0;
  const slope = linregSlope(rec);
  const lastLevel = rec.length > 0 ? Number(rec[rec.length - 1].level) : histMean;
  const horizonSec = h * 60;
  const trendProj = Math.max(0, Math.min(1, lastLevel + slope * horizonSec));
  const wTrend = horizonWeight(h);
  const blended = (1 - wTrend) * histMean + wTrend * trendProj;
  const prob = 1 / (1 + Math.exp(-10 * (blended - 0.7)));
  const n = rec.length;
  const dataFactor = Math.min(1, n / 5);
  const noise = stdev(rec);
  const noiseFactor = Math.max(0, 1 - noise / 0.3);
  const horizonFactor = Math.max(0, 1 - h / 60);
  const reliability = Math.max(0, Math.min(1, dataFactor * 0.5 + noiseFactor * 0.25 + horizonFactor * 0.25));
  const observedRise = rec.length >= 2 ? Number(rec[rec.length - 1].level) - Number(rec[0].level) : 0;
  return { prob, reliability, level: lastLevel, slope, n, observedRise };
}

// Dự báo đã hiệu chỉnh (công thức mục M5a ở trên).
export function forecastEdge32(o) {
  const r = forecastRaw32(o);
  return calibrateForecast32({ prob: r.prob, reliability: r.reliability, level: r.level, horizonMin: Math.max(0, Number(o.horizonMin) || 10), slope: r.slope, n: r.n, observedRise: r.observedRise });
}

export function alerts32(levels, forecasts, opts) {
  const o = opts || {};
  const probThreshold = o.probThreshold === undefined ? 0.6 : o.probThreshold;
  const out = [];
  const n = Math.min(levels.length, forecasts.length);
  for (let e = 0; e < n; e++) {
    const f = forecasts[e];
    if (!f) continue;
    const prob = Number(f.prob);
    if (!Number.isFinite(prob) || prob < probThreshold) continue;
    out.push({
      edge: e,
      prob,
      reliability: Number(f.reliability) || 0,
      horizonMin: Number(f.horizonMin) || 0,
      level: Number(levels[e]) || 0
    });
  }
  out.sort((a, b) => b.prob - a.prob);
  return out;
}

/**
 * Trộn kết quả thống kê (stat) với kết quả tua trước (lookahead) khi có.
 * Phần tua trước bản sao sim trong Web Worker sẽ do task sau làm (cần serialize trạng thái sim);
 * hàm này dùng để trộn ngay khi có dữ liệu giả/dữ liệu tua trước.
 * @param {number} w trọng số của lookahead (0=chỉ stat, 1=chỉ lookahead), kẹp [0,1]
 */
export function combineWithLookahead32(stat, lookahead, w) {
  const weight = Math.max(0, Math.min(1, Number(w) || 0));
  const sProb = Number(stat && stat.prob) || 0;
  const lProb = Number(lookahead && lookahead.prob) || 0;
  const sRel = Number(stat && stat.reliability) || 0;
  const lRel = Number(lookahead && lookahead.reliability) || 0;
  return {
    prob: (1 - weight) * sProb + weight * lProb,
    reliability: (1 - weight) * sRel + weight * lRel
  };
}
