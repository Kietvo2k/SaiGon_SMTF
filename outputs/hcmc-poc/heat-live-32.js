// heat-live-32.js - logic sống M4b1 (thuần JS, không three, không DOM; chạy được trong Node và trình duyệt):
// thu mẫu xe trong khu Bắc (1 s sim) → bản đồ nhiệt → dự báo kẹt (10/20/30 phút) → cảnh báo → lệch tuyến xe
// (routeBias của sim) → chọn vị trí + thông điệp bảng VMS → payload gửi trạm (POST /station/heat).
// Không tự đặt hẹn giờ: người gọi gọi engine.tick() theo nhịp của mình; mọi mốc tính theo giây sim.
import { createHeat32 } from './heat-32.js?v=32a';
import { forecastEdge32, alerts32 } from './forecast-32.js?v=32a';
import { hashU32, SEED, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';

export const HEAT_LIVE_32_VERSION = 'heat-live-32a';
export const SAMPLE_S_32 = 1;           // s sim: nhịp thu mẫu
export const SERIES_S_32 = 60;          // s sim: nhịp lịch sử ngắn hạn (xu hướng 5 phút gần nhất)
export const FORECAST_S_32 = 30;        // s sim: nhịp dự báo
export const POST_S_32 = 10;            // s sim: nhịp gửi trạm
export const LEVEL_MIN_32 = 0.3;        // cạnh có mức nhiệt từ ngưỡng này mới được dự báo
export const HORIZONS_MIN_32 = [10, 20, 30];
export const ALERT_PROB_32 = 0.6;       // xác suất từ ngưỡng này là cảnh báo và kích hoạt lệch tuyến
export const COMPLY_SHARE_32 = 0.6;     // ~60 % xe tuân thủ cảnh báo (tất định theo seed)
export const BIAS_FACTOR_32 = 0.02;     // hệ số trọng số rẽ vào cạnh cảnh báo với xe tuân thủ (sim kẹp tối thiểu 0,02)
export const POST_MIN_LEVEL_32 = 0.05;  // payload chỉ gửi cạnh có mức nhiệt ≥ 0,05
export const STOP_SPEED_32 = 0.5;       // m/s: dưới ngưỡng này xe được coi là đang dừng
export const BOARD_OFFSET_M_32 = 1.8;   // m: khoảng cách bảng VMS ra mép đường
export const BOARD_BACK_M_32 = 32;      // m: vị trí bảng cách nút Hàng Xanh (theo chiều đi)
const SERIES_KEEP_32 = 6;
const ALPHA_32 = 0.25;
const DAY_START_HOUR_32 = 6;
const APPROACH_MIN_RANK_32 = 2;         // ≥ tertiary
const BOARD_MIN_GAP_M_32 = 120;

const r3 = v => Math.round(v * 1000) / 1000;
const r1 = v => Math.round(v * 10) / 10;

// Tốc độ tự do của cạnh (m/s) = tốc độ làn của sim (cùng bảng SPEED_BY_RANK, link ×0,8).
export function speedLimitsOf32(net) {
  const out = new Float64Array(net.NE);
  for (let l = 0; l < net.NL; l++) { const e = net.lanes.edge[l], s = net.lanes.speed[l]; if (s > out[e]) out[e] = s; }
  for (let e = 0; e < net.NE; e++) if (!(out[e] > 0)) out[e] = 10;
  return out;
}

export function roadNameOf32(net, e) {
  const ed = net.E[e], road = ed && net.G.roads[ed.road];
  return (road && road.name) || 'đường không tên';
}

// Mẫu xe trong khu (isEligible) đang chạy: {edge, speed, stopped}. Chỉ đọc trạng thái sim, không đổi gì.
export function collectSamples32(sim, net) {
  const out = [];
  const { lane, v, active } = sim;
  for (let i = 0; i < sim.N; i++) {
    if (!active[i] || !sim.isEligible(i)) continue;
    const speed = Number(v[i]);
    out.push({ edge: net.lanes.edge[lane[i]], speed, stopped: speed < STOP_SPEED_32 ? 1 : 0 });
  }
  return out;
}

// Xe i có tuân thủ cảnh báo không: hash tất định theo seed, đạt tỉ lệ `share` trên toàn đàn.
export function complies32(i, seed = SEED, share = COMPLY_SHARE_32) {
  return hashU32(Math.imul(i + 1, 0x9e3779b1) ^ (seed >>> 0)) / 4294967296 < share;
}

// Bộ điều hướng: routeBias(edge, i) cho sim. Chỉ xe tuân thủ mới bị giảm trọng số rẽ vào cạnh cảnh báo.
export function createRouteBias32({ seed = SEED, share = COMPLY_SHARE_32, factor = BIAS_FACTOR_32 } = {}) {
  let avoid = new Set();
  return {
    routeBias(edge, i) { return avoid.has(edge) && complies32(i, seed, share) ? factor : 1; },
    setAvoid(edges) { avoid = new Set(edges || []); },
    avoided() { return [...avoid]; },
    share, factor
  };
}

const hourOf32 = t => ((Math.floor(t / 3600 + DAY_START_HOUR_32) % 24) + 24) % 24;

// Engine: giữ bản đồ nhiệt, lịch sử ngắn hạn, cảnh báo hiện tại; mỗi tick đọc sim.counters.t và làm các việc đến hạn.
export function createHeatLive32({ net, sim, routing = null, onPayload = null, nameOf = e => roadNameOf32(net, e) } = {}) {
  if (!net || !sim) throw new TypeError('createHeatLive32 cần net và sim');
  const NE = net.NE;
  let heat = null, series = new Map(), hourSeen = new Uint8Array(24), alertList = [];
  let nextSample = 0, nextSeries = 0, nextForecast = 0, nextPost = 0, lastT = -Infinity;

  function reset() {
    heat = createHeat32({ edgeCount: NE, edgeLen: Array.from({ length: NE }, (_, e) => net.E[e].length),
      edgeSpeedLimit: speedLimitsOf32(net), alpha: ALPHA_32, dayStartHour: DAY_START_HOUR_32 });
    series = new Map(); hourSeen = new Uint8Array(24); alertList = [];
    nextSample = nextSeries = nextForecast = nextPost = 0;
    if (routing) routing.setAvoid([]);
  }
  reset();

  function pushSeries(t) {
    const lv = heat.snapshot();
    for (let e = 0; e < NE; e++) {
      let arr = series.get(e);
      if (!arr) { if (lv[e] < 0.01) continue; arr = []; series.set(e, arr); }
      arr.push({ t, level: lv[e] });
      if (arr.length > SERIES_KEEP_32) arr.splice(0, arr.length - SERIES_KEEP_32);
    }
  }

  function histOf(hourly, e) {
    const out = [];
    for (let h = 0; h < 24; h++) if (hourSeen[h]) out.push(hourly[h * NE + e]);
    return out;
  }

  function runForecast(t) {
    const lv = heat.snapshot(), hourly = heat.hourly();
    const forecasts = new Array(NE);
    for (let e = 0; e < NE; e++) {
      if (!(lv[e] >= LEVEL_MIN_32)) continue;
      const hist = histOf(hourly, e);
      const rec = (series.get(e) || []).concat([{ t, level: lv[e] }]).slice(-SERIES_KEEP_32);
      let best = null;
      for (const h of HORIZONS_MIN_32) {
        const f = forecastEdge32({ history: hist, recent: rec, horizonMin: h });
        if (!best || f.prob > best.prob) best = { prob: f.prob, reliability: f.reliability, horizonMin: h };
      }
      forecasts[e] = best;
    }
    const hits = alerts32(lv, forecasts, { probThreshold: ALERT_PROB_32 });
    alertList = hits.map(a => ({ edge: a.edge, name: nameOf(a.edge), prob: a.prob, reliability: a.reliability, horizonMin: a.horizonMin, level: a.level }));
    if (routing) routing.setAvoid(alertList.map(a => a.edge));
  }

  function post(t) {
    if (!onPayload) return;
    const lv = heat.snapshot();
    const levels = [];
    for (let e = 0; e < NE; e++) if (lv[e] >= POST_MIN_LEVEL_32) levels.push([e, r3(lv[e])]);
    const alerts = alertList.map(a => ({ edge: a.edge, prob: r3(a.prob), reliability: r3(a.reliability), horizon_min: a.horizonMin, level: r3(a.level) }));
    onPayload({ t_sim: r1(t), levels, alerts });
  }

  function state() { return { t: lastT, alerts: alertList.slice(), avoided: routing ? routing.avoided() : [] }; }

  // Gọi định kỳ (ví dụ mỗi 250 ms thực). Làm đủ mọi việc đến hạn theo giây sim; trả về trạng thái hiện tại.
  function tick() {
    const t = Number(sim.counters.t);
    if (!Number.isFinite(t)) return state();
    if (t < lastT - 1e-6) reset();   // sim đã đặt lại: xóa lịch sử
    lastT = t;
    if (t >= nextSample) {
      heat.ingest(t, collectSamples32(sim, net));
      hourSeen[hourOf32(t)] = 1;
      nextSample = Math.floor(t / SAMPLE_S_32) * SAMPLE_S_32 + SAMPLE_S_32;
    }
    if (t >= nextSeries) { pushSeries(t); nextSeries = Math.floor(t / SERIES_S_32) * SERIES_S_32 + SERIES_S_32; }
    if (t >= nextForecast) { runForecast(t); nextForecast = Math.floor(t / FORECAST_S_32) * FORECAST_S_32 + FORECAST_S_32; }
    if (t >= nextPost) { post(t); nextPost = Math.floor(t / POST_S_32) * POST_S_32 + POST_S_32; }
    return state();
  }

  return {
    tick, state, reset,
    level: e => heat.level(e),
    levels: () => heat.snapshot(),
    hourly: () => heat.hourly(),
    alerts: () => alertList.slice()
  };
}

// Vị trí bảng VMS: làn đi vào nút Hàng Xanh từ ngoài cụm, hạng ≥ tertiary, cách nhau ≥ 120 m, tối đa `max` bảng.
// Thông tin: điểm trên tim làn (lanePoint), cao độ (laneY), chiều hướng xe tới, cạnh "phía trước" (cạnh tiếp cận
// và cạnh rời nút HX) và tên tuyến thay thế (cạnh khác tên, đi ra từ nút đầu đoạn tiếp cận, không nằm trong "phía trước").
export function chooseVmsBoards32({ net, nodeMap = [], max = 4 } = {}) {
  if (!net) throw new TypeError('chooseVmsBoards32 cần net');
  const { lanes, E, G } = net;
  const idx = new Map(G.nodes.map((n, i) => [n.id, i]));
  const hx = new Set((nodeMap || []).map(m => idx.get(m.osm_id)).filter(i => i !== undefined));
  if (!hx.size) return [];
  const geo = createTrafficGeometry31(net, { jit: [], len: [] });
  const roadHalf = new Float32Array(net.NE);
  const hasLane = new Uint8Array(net.NE);
  for (let l = 0; l < net.NL; l++) {
    const e = lanes.edge[l];
    hasLane[e] = 1;
    roadHalf[e] = Math.max(roadHalf[e], Math.abs(lanes.offset[l]) + lanes.width[l] / 2);
  }
  const outOfNode = new Map();   // nút HX → cạnh rời nút đó (phía trước của bảng đặt trên làn tới nút đó)
  for (let l = 0; l < net.NL; l++) {
    if (!hx.has(lanes.from[l])) continue;
    let set = outOfNode.get(lanes.from[l]); if (!set) outOfNode.set(lanes.from[l], set = new Set());
    set.add(lanes.edge[l]);
  }
  const cands = [];
  for (let l = 0; l < net.NL; l++) if (hx.has(lanes.to[l]) && !hx.has(lanes.from[l]) && lanes.rank[l] >= APPROACH_MIN_RANK_32) cands.push(l);
  cands.sort((a, b) => (lanes.rank[b] - lanes.rank[a]) || (lanes.length[b] - lanes.length[a]) || (a - b));
  const boards = [];
  const usedEdges = new Set();
  for (const l of cands) {
    if (boards.length >= max) break;
    const e = lanes.edge[l];
    if (usedEdges.has(e)) continue;
    const sl = Math.max(0, lanes.length[l] - BOARD_BACK_M_32);
    const P = geo.lanePoint(l, sl, roadHalf[e] + BOARD_OFFSET_M_32, {});
    const tl = Math.hypot(P.tx, P.tz) || 1;
    const tx = P.tx / tl, tz = P.tz / tl;
    if (boards.some(b => Math.hypot(b.x - P.x, b.z - P.z) < BOARD_MIN_GAP_M_32)) continue;
    usedEdges.add(e);
    const watch = new Set([e, ...(outOfNode.get(lanes.to[l]) || [])]);
    const curName = G.roads[E[e].road].name || '';
    let alt = null;
    for (const [e2] of G.nodes[lanes.from[l]].adj) {
      if (e2 === e || watch.has(e2) || !hasLane[e2]) continue;
      const rank = net.rankOf(e2);
      const nm = G.roads[E[e2].road].name || '';
      if (rank < APPROACH_MIN_RANK_32 || !nm || nm === curName) continue;
      if (!alt || rank > alt.rank) alt = { rank, name: nm };
    }
    boards.push({
      id: `VMS-${String(boards.length + 1).padStart(2, '0')}`,
      lane: l, edge: e, approach: curName || 'đường không tên',
      x: P.x, y: geo.laneY(l, sl), z: P.z, tx, tz,
      yaw: Math.atan2(-tx, -tz),          // mặt bảng quay về phía xe tới
      watch, altName: alt ? alt.name : ''
    });
  }
  return boards;
}

// Thông điệp bảng VMS: khi có cảnh báo trên cạnh "phía trước" của bảng → KẸT XE + tuyến thay thế; không thì LÁI XE AN TOÀN.
export function vmsMessage32(board, alerts = []) {
  let hit = null;
  for (const a of alerts || []) if (board && board.watch && board.watch.has(a.edge) && (!hit || a.prob > hit.prob)) hit = a;
  if (!hit) return { state: 'normal', lines: ['LÁI XE AN TOÀN'], text: 'LÁI XE AN TOÀN', key: 'normal', edge: null, prob: 0, horizonMin: 0 };
  const alt = board.altName ? `ĐI ${board.altName}` : 'ĐI TUYẾN KHÁC';
  const lines = ['KẸT XE PHÍA TRƯỚC', alt];
  return { state: 'alert', lines, text: lines.join(' · '), key: `alert|${board.altName || ''}`, edge: hit.edge, prob: hit.prob, horizonMin: hit.horizonMin };
}
