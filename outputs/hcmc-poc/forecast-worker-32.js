// forecast-worker-32.js - Web Worker (module) của tua trước M4b2. Luồng:
//   init {graph, roads, widths, drawn, signalPlan, breakerS, expectStats} → dựng đúng mạng của trạm chính (một lần);
//   run {id, job} → chạy bản sao sim từ job.state tới 30 phút sim → result {id, t0, scale, levels, …}.
// Lỗi bất kỳ → {type:'error', id, message}. Worker không đụng DOM và không giữ trạng thái giữa các lần chạy (trừ mạng và sim tái dùng).
import { buildTrafficNetwork31 } from './city-traffic-sim-31.js?v=32a';
import { createLookaheadRunner32 } from './forecast-core-32.js?v=32a';

export const FORECAST_WORKER_32_VERSION = 'forecast-worker-32a';
let runner = null;

self.onmessage = ev => {
  const m = ev.data || {};
  try {
    if (m.type === 'init') {
      const net = buildTrafficNetwork31({
        graph: m.graph, roads: m.roads,
        widthOf: i => m.widths[i], drawn: i => !!m.drawn[i], signalPlan: m.signalPlan
      });
      const stats = JSON.stringify(net.stats);
      if (m.expectStats && stats !== m.expectStats) throw new Error('mạng trong Worker khác mạng của trạm chính');
      runner = createLookaheadRunner32({ net, breakerS: m.breakerS });
      self.postMessage({ type: 'ready', NE: net.NE, NL: net.NL, stats: net.stats });
    } else if (m.type === 'run') {
      if (!runner) throw new Error('Worker chưa init');
      const res = runner.run(m.job);
      const transfer = Object.values(res.levels).map(a => a.buffer);
      self.postMessage({ type: 'result', id: m.id, ...res }, transfer);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String((e && e.message) || e) });
  }
};
