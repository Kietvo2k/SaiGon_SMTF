// forecast-core-32.js - lõi tua trước M4b2 (thuần JS, không DOM/three; chạy trong Web Worker và trong test Node).
// Nhận ảnh trạng thái sim (exportState của trạm chính) + chế độ đèn + lệch tuyến → chạy BẢN SAO sim tới 30 phút sim
// (heat theo giây sim, cùng cách với heat-live-32) → mức nhiệt tại 10/20/30 phút. Không đổi sim chính.
// Ngân sách: ≤ 3 s thực cho 10 phút sim; chậm hơn thì giảm số xe theo tỉ lệ (scale) rồi chạy lại từ cùng ảnh, và ghi rõ scale.
import { createTrafficSim31, SEED } from './city-traffic-sim-31.js?v=32a';
import { createSignalController32 } from './traffic-controller-32.js?v=32a';
import { createHeat32 } from './heat-32.js?v=32a';
import { collectSamples32, createRouteBias32, speedLimitsOf32, HORIZONS_MIN_32, ALPHA_32, DAY_START_HOUR_32 } from './heat-live-32.js?v=32a';

export const FORECAST_CORE_32_VERSION = 'forecast-core-32a';
export const FORECAST_HORIZON_MIN_32 = 30;        // phút sim tối đa mỗi lượt tua
export const FORECAST_BUDGET_10MIN_MS_32 = 3000;  // ms thực cho 10 phút sim (đặc tả: ≤ 3 s)
export const FORECAST_SAFETY_32 = 0.9;            // hệ số an toàn khi tính lại scale
export const BREAKER_SMART_32 = 180;              // = SMART_BREAKER_S của app smart (phải khớp để tua đúng như trạm chính)

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Một bộ chạy tua cho một mạng. Giữ một sim (tái dùng) và nạp lại ảnh trạng thái mỗi lần chạy.
export function createLookaheadRunner32({ net, breakerS = BREAKER_SMART_32, seed = SEED, demand = null } = {}) {
  if (!net) throw new TypeError('createLookaheadRunner32 cần net');
  const NE = net.NE;
  const speedLim = speedLimitsOf32(net);
  const routing = createRouteBias32({ seed });
  const sim = createTrafficSim31(net, { signalPlan: net.signalPlan || null, controller: null, breakerS, seed, routeBias: routing.routeBias, demand });

  // Chạy một lần với tỉ lệ `scale`. Nếu budget10 (ms cho 10 phút đầu) bị vượt thì trả {slow: true} để gọi lại với scale nhỏ hơn.
  function once(job, scale, budget10) {
    const horizons = job.horizonsMin || HORIZONS_MIN_32;
    const horizonS = Math.max(...horizons) * 60;
    routing.setAvoid(job.avoid || []);
    const controller = createSignalController32({ net, sim: null, mode: job.mode === 'smart' ? 'smart' : 'fixed' });
    if (job.phases) controller.importPhases(job.phases);   // pha đèn hiện tại của trạm chính (không có thì bắt đầu lại từ pha 0)
    sim.attachController(controller);
    sim.importState(job.state);
    if (scale < 1) sim.setFraction(job.state.fraction * scale);
    const heat = createHeat32({ edgeCount: NE, edgeSpeedLimit: speedLim, alpha: ALPHA_32, dayStartHour: DAY_START_HOUR_32 });
    if (job.levels0) heat.setLevels(job.levels0);
    const t0 = sim.counters.t;
    const marks = horizons.map(h => ({ h, t: t0 + h * 60, out: null }));
    const wall0 = now();
    const end = t0 + horizonS;
    let at10 = null;
    while (sim.counters.t < end - 1e-9) {
      sim.step();
      if (sim.counters.step % 10 === 0) heat.ingest(sim.counters.t, collectSamples32(sim, net));
      const t = sim.counters.t;
      for (const m of marks) if (!m.out && t >= m.t - 1e-9) m.out = heat.snapshot();
      if (at10 === null && t >= t0 + 600 - 1e-9) {
        at10 = now() - wall0;
        if (budget10 !== undefined && at10 > budget10) return { slow: true, elapsedAt10: at10 };
      }
    }
    const levels = {};
    for (const m of marks) levels[m.h] = m.out;
    return { slow: false, levels, elapsedMs: now() - wall0, stateHash: sim.stateHash(), active: sim.activeCount(), t: sim.counters.t };
  }

  // job: {state (exportState), mode ('fixed'|'smart'), avoid: [cạnh tránh], levels0: Float32Array(NE), horizonsMin?,
  //       budget10Ms? (mặc định 3000), scale? (ép tỉ lệ, không kiểm ngân sách)}
  // Trả về {t0, scale, scaled, elapsedMs, levels, stateHash, active}. scale = 1 nếu không phải giảm số xe.
  function run(job) {
    if (!job || !job.state) throw new TypeError('run cần job.state');
    const budget10 = Number.isFinite(job.budget10Ms) ? job.budget10Ms : FORECAST_BUDGET_10MIN_MS_32;
    const fixedScale = Number.isFinite(job.scale) && job.scale > 0 && job.scale <= 1 ? job.scale : null;
    const t0 = job.state.counters.t;
    let scale = fixedScale ?? 1;
    let r = once(job, scale, fixedScale === null ? budget10 : undefined);
    let scaled = false;
    if (r.slow) {
      // Chậm: giảm số xe theo tỉ lệ ngân sách/thời gian đo rồi chạy lại từ cùng ảnh (một lần).
      scale = Math.max(0.1, Math.min(1, Math.round(FORECAST_SAFETY_32 * (budget10 / r.elapsedAt10) * 20) / 20));
      r = once(job, scale, undefined);
      scaled = true;
    }
    return { t0, scale, scaled, elapsedMs: r.elapsedMs, levels: r.levels, stateHash: r.stateHash, active: r.active };
  }

  return { run, once, sim, routing };
}
