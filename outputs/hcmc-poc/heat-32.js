// heat-32.js - logic ban do nhiet M4, thuan JS, ES module.
// Chay duoc trong Node va trinh duyet, khong import three.
// Doc tu snapshot sim: ingest(tSim, samples) voi samples = [{edge,speed,stopped}].
export const HEAT_COLORS_32 = ['#1976d2', '#fbc02d', '#f57c00', '#d32f2f', '#7b1fa2'];
export function colorOf(level) {
  if (!Number.isFinite(level)) return HEAT_COLORS_32[0];
  if (level <= 0) return HEAT_COLORS_32[0];
  if (level >= 1) return HEAT_COLORS_32[HEAT_COLORS_32.length - 1];
  const n = HEAT_COLORS_32.length;
  const idx = Math.min(n - 1, Math.floor(level * n));
  return HEAT_COLORS_32[idx];
}
export function createHeat32(o) {
  const edgeCount = o.edgeCount;
  const edgeSpeedLimit = o.edgeSpeedLimit;
  const alpha = o.alpha === undefined ? 0.2 : o.alpha;
  const dayStartHour = o.dayStartHour === undefined ? 0 : o.dayStartHour;
  if (!(edgeCount > 0)) throw new TypeError('edgeCount must be > 0');
  if (!(alpha > 0 && alpha <= 1)) throw new TypeError('alpha must be in (0,1]');
  const N = edgeCount;
  const levels = new Float64Array(N);
  const speedLim = new Float64Array(N);
  for (let e = 0; e < N; e++) speedLim[e] = Number(edgeSpeedLimit && edgeSpeedLimit[e]) || 10;
  const hourlyHist = new Float32Array(24 * N);
  let hourIdx = -1;
  let hourSum = new Float64Array(N);
  let hourCount = 0;
  function rawLevel(edge, arr) {
    let sum = 0; let n = 0;
    for (const s of arr) {
      if (!s || s.edge !== edge) continue;
      const v = Number(s.speed);
      const ratio = Number.isFinite(v) ? Math.max(0, Math.min(1, v / Math.max(0.1, speedLim[edge]))) : 1;
      const stopRatio = s.stopped ? 1 : 0;
      sum += 0.5 * (1 - ratio) + 0.5 * stopRatio;
      n++;
    }
    if (n === 0) return null;
    return Math.max(0, Math.min(1, sum / n));
  }
  return {
    ingest(tSim, samples) {
      const h = Math.floor((Number(tSim) / 3600 + dayStartHour) % 24);
      const hNorm = ((h % 24) + 24) % 24;
      if (hNorm !== hourIdx) {
        if (hourIdx >= 0 && hourCount > 0) {
          for (let e = 0; e < N; e++) hourlyHist[hourIdx * N + e] = hourSum[e] / hourCount;
        }
        hourIdx = hNorm;
        hourSum = new Float64Array(N);
        hourCount = 0;
      }
      if (!samples || samples.length === 0) return;
      const byEdge = new Map();
      for (const s of samples) {
        if (!s || !Number.isInteger(s.edge) || s.edge < 0 || s.edge >= N) continue;
        let arr = byEdge.get(s.edge);
        if (!arr) { arr = []; byEdge.set(s.edge, arr); }
        arr.push(s);
      }
      let changed = false;
      for (const en of byEdge) {
        const r = rawLevel(en[0], en[1]);
        if (r === null) continue;
        levels[en[0]] = levels[en[0]] + alpha * (r - levels[en[0]]);
        if (levels[en[0]] < 0) levels[en[0]] = 0;
        if (levels[en[0]] > 1) levels[en[0]] = 1;
        hourSum[en[0]] += levels[en[0]];
        changed = true;
      }
      if (changed) hourCount++;
    },
    level(edge) {
      if (!Number.isInteger(edge) || edge < 0 || edge >= N) throw new RangeError('edge out of range');
      return levels[edge];
    },
    snapshot() {
      const out = new Float32Array(N);
      for (let e = 0; e < N; e++) out[e] = levels[e];
      return out;
    },
    hourly() {
      const out = new Float32Array(hourlyHist);
      if (hourIdx >= 0 && hourCount > 0) {
        for (let e = 0; e < N; e++) out[hourIdx * N + e] = hourSum[e] / hourCount;
      }
      return out;
    }
  };
}
