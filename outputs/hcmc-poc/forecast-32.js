// forecast-32.js - du bao ket thong ke M4, thuan JS, ES module, chay duoc trong Node va trinh duyet.
// Khong tua sim o day. Phan tua ban sao sim trong Web Worker se do task sau lam (can serialize trang thai sim).

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

export function forecastEdge32(o) {
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
  return { prob, reliability };
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
