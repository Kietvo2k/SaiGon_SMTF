import { isDeepStrictEqual } from 'node:util';

export const KPI_SEEDS = Object.freeze([31031, 31032, 31033, 31034, 31035]);
export const KPI_WINDOW_S = Object.freeze([300, 1800]);
export const KPI_SCENARIO = 'peak-hang-xanh';
export const KPI_DURATION_S = 1800;

function validMeasurement(value, seed, mode) {
  return value?.mode === mode &&
    value.seed === seed &&
    value.scenario === KPI_SCENARIO &&
    value.duration_s === KPI_DURATION_S &&
    isDeepStrictEqual(value.a1_window_s, KPI_WINDOW_S) &&
    Number.isFinite(value.a1_delay_s_hx) &&
    value.a1_delay_s_hx >= 0 &&
    Number.isSafeInteger(value.a1_crossings_hx) &&
    value.a1_crossings_hx > 0 &&
    (value.breaker_s === null || (Number.isFinite(value.breaker_s) && value.breaker_s > 0)) &&
    (value.demand === null || (typeof value.demand === 'object' && !Array.isArray(value.demand)));
}

export function validateKpi(summary) {
  const errors = [];
  const rows = [];
  const invalidSummary = summary?.scenario !== KPI_SCENARIO ||
    summary.duration_s !== KPI_DURATION_S ||
    !isDeepStrictEqual(summary.window_s, KPI_WINDOW_S) ||
    !isDeepStrictEqual(summary.seeds, KPI_SEEDS) ||
    !Array.isArray(summary.rows) ||
    summary.rows.length !== KPI_SEEDS.length;
  if (invalidSummary) {
    errors.push('Thiếu kịch bản, cửa sổ đo, hoặc đủ năm seed A1.');
    return { ok: false, errors, meanDelayImprovementPct: null, rows };
  }

  for (const [index, seed] of KPI_SEEDS.entries()) {
    const row = summary.rows[index];
    const { fixed, smart } = row ?? {};
    if (row?.seed !== seed || !validMeasurement(fixed, seed, 'fixed') ||
        !validMeasurement(smart, seed, 'smart') || fixed.a1_delay_s_hx <= 0) {
      errors.push(`Seed ${seed} thiếu cặp phép đo hợp lệ hoặc trễ nền bằng 0.`);
      continue;
    }
    if (fixed.breaker_s !== smart.breaker_s || !isDeepStrictEqual(fixed.demand, smart.demand) ||
        !isDeepStrictEqual(fixed.params, smart.params)) {
      errors.push(`Seed ${seed} dùng cấu hình khác nhau giữa fixed và smart.`);
      continue;
    }
    const delayImprovementPct = 100 * ((fixed.a1_delay_s_hx - smart.a1_delay_s_hx) / fixed.a1_delay_s_hx);
    const throughputLossPct = 100 * ((fixed.a1_crossings_hx - smart.a1_crossings_hx) / fixed.a1_crossings_hx);
    if (!Number.isFinite(delayImprovementPct)) {
      errors.push(`Seed ${seed} có tỷ lệ cải thiện không hữu hạn.`);
      continue;
    }
    rows.push({ seed, delayImprovementPct, throughputLossPct });
    if (20n * BigInt(smart.a1_crossings_hx) < 19n * BigInt(fixed.a1_crossings_hx)) {
      errors.push(`Seed ${seed} giảm lưu lượng ${throughputLossPct.toFixed(2)}% (giới hạn 5%).`);
    }
  }

  const meanDelayImprovementPct = rows.length === KPI_SEEDS.length
    ? rows.reduce((sum, row) => sum + row.delayImprovementPct / KPI_SEEDS.length, 0)
    : null;
  if (meanDelayImprovementPct !== null &&
      (!Number.isFinite(meanDelayImprovementPct) || meanDelayImprovementPct < 15)) {
    errors.push(`Độ trễ trung bình chỉ cải thiện ${meanDelayImprovementPct.toFixed(2)}% (mục tiêu 15%).`);
  }
  return { ok: errors.length === 0, errors, meanDelayImprovementPct, rows };
}
