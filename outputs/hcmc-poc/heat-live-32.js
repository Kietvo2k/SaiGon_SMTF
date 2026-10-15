// heat-live-32.js - logic sống M4b1 (thuần JS, không three, không DOM; chạy được trong Node và trình duyệt):
// thu mẫu xe trong khu Bắc (1 s sim) → bản đồ nhiệt → dự báo kẹt (10/20/30 phút) → cảnh báo → lệch tuyến xe
// (routeBias của sim) → chọn vị trí + thông điệp bảng VMS → payload gửi trạm (POST /station/heat).
// Không tự đặt hẹn giờ: người gọi gọi engine.tick() theo nhịp của mình; mọi mốc tính theo giây sim.
import { createHeat32 } from './heat-32.js?v=32a';
import { forecastRaw32, alerts32, combineWithLookahead32, calibrateForecast32, slopeOf32 } from './forecast-32.js?v=32a';
import { hashU32, SEED, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';

export const HEAT_LIVE_32_VERSION = 'heat-live-32b';
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
export const ALPHA_32 = 0.25;
export const DAY_START_HOUR_32 = 6;
const APPROACH_MIN_RANK_32 = 2;         // ≥ tertiary
const BOARD_MIN_GAP_M_32 = 120;
// M4b2: tua trước (kết quả Worker) trộn với thống kê; chỉ dùng khi thời điểm hiện tại cách gốc tua ≤ LOOK_USE_S_32.
export const LOOK_W_32 = 0.5;           // trọng số tua trước trong dự báo (0 = chỉ thống kê, 1 = chỉ tua trước)
export const LOOK_REL_32 = 0.7;         // độ tin cậy gốc của tua trước; nhân với tỉ lệ xe còn lại khi tua đã giảm số xe
export const LOOK_USE_S_32 = 60;        // s sim
export const UNNAMED_ROAD_32 = 'đường không tên';
export const ALERT_ROWS_MAX_32 = 5;     // số dòng cảnh báo tối đa (sau khi gộp theo tên đường)
// Xác suất kẹt từ mức nhiệt: cùng hàm logistic với forecast-32 (mức 0,7 ↔ 50 %).
export const probOfLevel32 = L => 1 / (1 + Math.exp(-10 * (Number(L) - 0.7)));

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
// M5a: `extra` = cạnh tránh do kịch bản (ngập): cùng cơ chế xe tuân thủ; không bị ghi đè bởi setAvoid của dự báo.
export function createRouteBias32({ seed = SEED, share = COMPLY_SHARE_32, factor = BIAS_FACTOR_32 } = {}) {
  let avoid = new Set(), extra = new Set();
  return {
    routeBias(edge, i) { return (avoid.has(edge) || extra.has(edge)) && complies32(i, seed, share) ? factor : 1; },
    setAvoid(edges) { avoid = new Set(edges || []); },
    setExtraAvoid(edges) { extra = new Set(edges || []); },
    avoided() { return [...avoid]; },
    extraAvoided() { return [...extra]; },
    share, factor
  };
}

const hourOf32 = t => ((Math.floor(t / 3600 + DAY_START_HOUR_32) % 24) + 24) % 24;

// Engine: giữ bản đồ nhiệt, lịch sử ngắn hạn, cảnh báo hiện tại; mỗi tick đọc sim.counters.t và làm các việc đến hạn.
// clockOf() (M4b2): giây "giờ heat" = giây đồng hồ − 06:00 (heat đếm giờ từ 06:00). Mặc định: giây sim. Quyết định giờ của lịch sử.
export function createHeatLive32({ net, sim, routing = null, onPayload = null, nameOf = e => roadNameOf32(net, e), clockOf = null } = {}) {
  if (!net || !sim) throw new TypeError('createHeatLive32 cần net và sim');
  const NE = net.NE;
  let heat = null, series = new Map(), hourSeen = new Uint8Array(24), alertList = [];
  let base = null;      // lịch sử offline: {hourly: Float32Array(24·NE), seen: Uint8Array(24)}
  let look = null;      // tua trước gần nhất: {t0, scale, levels: Map(phút → Float32Array(NE))}
  let nextSample = 0, nextSeries = 0, nextForecast = 0, nextPost = 0, lastT = -Infinity;

  function reset() {
    heat = createHeat32({ edgeCount: NE, edgeLen: Array.from({ length: NE }, (_, e) => net.E[e].length),
      edgeSpeedLimit: speedLimitsOf32(net), alpha: ALPHA_32, dayStartHour: DAY_START_HOUR_32 });
    series = new Map(); hourSeen = new Uint8Array(24); alertList = [];
    nextSample = nextSeries = nextForecast = nextPost = 0;
    if (routing) routing.setAvoid([]);
    look = null;
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

  // Lịch sử theo giờ: giờ đã thấy trong phiên dùng số liệu phiên; giờ chưa thấy lấy từ lịch sử offline (nếu đã nạp).
  function histOf(hourly, e) {
    const out = [];
    for (let h = 0; h < 24; h++) {
      if (hourSeen[h]) out.push(hourly[h * NE + e]);
      else if (base && base.seen[h]) out.push(base.hourly[h * NE + e]);
    }
    return out;
  }

  function lookLevels(h, t) {
    if (!look || Math.abs(t - look.t0) > LOOK_USE_S_32) return null;
    return look.levels.get(h) || null;
  }

  // Cạnh có mức tua trước đạt ngưỡng ở một horizon nào đó (để không bỏ sót cạnh đang trống nhưng sắp kẹt).
  function lookMaxOf(t) {
    const out = new Float32Array(NE);
    let any = false;
    for (const h of HORIZONS_MIN_32) {
      const arr = lookLevels(h, t);
      if (!arr) continue;
      any = true;
      for (let e = 0; e < NE; e++) if (arr[e] > out[e]) out[e] = arr[e];
    }
    return any ? out : null;
  }

  function runForecast(t) {
    const lv = heat.snapshot(), hourly = heat.hourly();
    const forecasts = new Array(NE);
    const lookMax = lookMaxOf(t);
    for (let e = 0; e < NE; e++) {
      if (!(lv[e] >= LEVEL_MIN_32) && !(lookMax && lookMax[e] >= LEVEL_MIN_32)) continue;
      const hist = histOf(hourly, e);
      const rec = (series.get(e) || []).concat([{ t, level: lv[e] }]).slice(-SERIES_KEEP_32);
      let best = null;
      const slope = slopeOf32(rec);
      const observedRise = rec.length >= 2 ? rec[rec.length - 1].level - rec[0].level : 0;
      for (const h of HORIZONS_MIN_32) {
        // M5a: hiệu chỉnh MỘT lần sau khi trộn tua trước (không hiệu chỉnh hai lần).
        let f = forecastRaw32({ history: hist, recent: rec, horizonMin: h });
        const lk = lookLevels(h, t);
        if (lk) f = combineWithLookahead32(f, { prob: probOfLevel32(lk[e]), reliability: LOOK_REL_32 * look.scale }, LOOK_W_32);
        f = calibrateForecast32({ prob: f.prob, reliability: f.reliability, level: lv[e], horizonMin: h, slope, n: rec.length, observedRise });
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

  function state() { return { t: lastT, alerts: alertList.slice(), avoided: routing ? routing.avoided() : [], lookT0: look ? look.t0 : null }; }

  // Nạp lịch sử offline: {hourly: Float32Array(24·NE) (giờ h, cạnh e ở h·NE+e), seen: Uint8Array|Array(24)}.
  function loadHistory(hist) {
    if (!hist || !hist.hourly || hist.hourly.length !== 24 * NE || !hist.seen) return false;
    base = { hourly: Float32Array.from(hist.hourly), seen: Uint8Array.from({ length: 24 }, (_, h) => (hist.seen[h] ? 1 : 0)) };
    return true;
  }

  // Nạp kết quả Worker: {t0, scale, levels: {10: Float32Array(NE), 20: …, 30: …}}. Sai kích thước → từ chối (trả false).
  function applyLookahead(res) {
    if (!res || !Number.isFinite(Number(res.t0)) || !res.levels) return false;
    const levels = new Map();
    for (const h of HORIZONS_MIN_32) {
      const arr = res.levels[h];
      if (!arr || arr.length !== NE) return false;
      levels.set(h, Float32Array.from(arr));
    }
    const scale = Math.max(0.05, Math.min(1, Number(res.scale) || 1));
    look = { t0: Number(res.t0), scale, levels };
    return true;
  }
  function clearLookahead() { look = null; }

  // Gọi định kỳ (ví dụ mỗi 250 ms thực). Làm đủ mọi việc đến hạn theo giây sim; trả về trạng thái hiện tại.
  function tick() {
    const t = Number(sim.counters.t);
    if (!Number.isFinite(t)) return state();
    if (t < lastT - 1e-6) reset();   // sim đã đặt lại: xóa lịch sử
    lastT = t;
    const tc = clockOf ? Number(clockOf()) : t;   // giây giờ heat: quyết định giờ của lịch sử theo đồng hồ
    if (t >= nextSample) {
      heat.ingest(tc, collectSamples32(sim, net));
      hourSeen[hourOf32(tc)] = 1;
      nextSample = Math.floor(t / SAMPLE_S_32) * SAMPLE_S_32 + SAMPLE_S_32;
    }
    if (t >= nextSeries) { pushSeries(t); nextSeries = Math.floor(t / SERIES_S_32) * SERIES_S_32 + SERIES_S_32; }
    if (t >= nextForecast) { runForecast(t); nextForecast = Math.floor(t / FORECAST_S_32) * FORECAST_S_32 + FORECAST_S_32; }
    if (t >= nextPost) { post(t); nextPost = Math.floor(t / POST_S_32) * POST_S_32 + POST_S_32; }
    return state();
  }

  return {
    tick, state, reset, loadHistory, applyLookahead, clearLookahead,
    level: e => heat.level(e),
    levels: () => heat.snapshot(),
    hourly: () => heat.hourly(),
    alerts: () => alertList.slice()
  };
}

// M4b2: gộp cảnh báo theo TÊN đường (một dòng mỗi tên, lấy xác suất cao nhất, đếm số đoạn); đường không tên gộp theo cạnh.
// Trả về tối đa `max` dòng, sắp giảm dần theo xác suất.
export function groupAlertsByRoad32(alerts, max = ALERT_ROWS_MAX_32) {
  const groups = new Map();
  for (const a of alerts || []) {
    const named = !!a.name && a.name !== UNNAMED_ROAD_32;
    const key = named ? a.name : `#${a.edge}`;
    const g = groups.get(key);
    if (!g) { groups.set(key, { name: a.name || UNNAMED_ROAD_32, prob: a.prob, reliability: a.reliability, horizonMin: a.horizonMin, edge: a.edge, segments: 1 }); continue; }
    g.segments++;
    if (a.prob > g.prob) Object.assign(g, { prob: a.prob, reliability: a.reliability, horizonMin: a.horizonMin, edge: a.edge });
  }
  return [...groups.values()].sort((x, y) => y.prob - x.prob).slice(0, Math.max(0, max));
}

// M4b2: lịch sử offline (file JSON chỉ giữ cạnh đã chọn) → mảng đầy đủ 24·NE. Sai định dạng/số cạnh → null.
// json: {version, ne, edges: [chỉ số cạnh], hours: 24, levels: [h·K + k]} với K = edges.length.
export function expandHeatHistory32(json, NE) {
  if (!json || json.ne !== NE || !Array.isArray(json.edges) || json.hours !== 24) return null;
  const K = json.edges.length;
  if (!Array.isArray(json.levels) || json.levels.length !== 24 * K) return null;
  const hourly = new Float32Array(24 * NE);
  for (let h = 0; h < 24; h++) for (let k = 0; k < K; k++) {
    const e = json.edges[k];
    if (!Number.isInteger(e) || e < 0 || e >= NE) return null;
    hourly[h * NE + e] = json.levels[h * K + k];
  }
  return { hourly, seen: Uint8Array.from({ length: 24 }, () => 1) };
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

// M5a: "bus" nội dung bảng VMS. Ưu tiên: (1) nội dung cán bộ đặt từ trạm (cmd.vms, mode manual); (2) kịch bản ngập
// (cảnh báo ngập); (3) cảnh báo kẹt theo dự báo (vmsMessage32). mode auto/không có → trở về hệ thống.
export function createVmsBus32() {
  const manual = new Map();   // vms_id → {text, lines}
  const flood = new Map();    // vms_id → {lines}
  return {
    setManual(id, lines) {
      const arr = (Array.isArray(lines) ? lines : [lines]).map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 2);
      if (!arr.length) { manual.delete(id); return false; }
      manual.set(id, { lines: arr, text: arr.join(' · ') }); return true;
    },
    clearManual(id) { return manual.delete(id); },
    setFlood(id, lines) { flood.set(id, { lines: lines.slice(0, 2) }); },
    clearFlood(id) { return flood.delete(id); },
    clearFloodAll() { flood.clear(); },
    manualOf: id => manual.get(id) || null,
    floodOf: id => flood.get(id) || null,
    // Nội dung đang hiển thị gửi trạm (vms_id, text, mode): mode manual khi cán bộ đặt, còn lại auto.
    snapshot(boards, alerts = []) {
      return (boards || []).map(b => {
        const m = manual.get(b.id);
        if (m) return { vms_id: b.id, text: m.text, mode: 'manual' };
        const msg = vmsDisplay32(b, alerts, { manualOf: id => manual.get(id) || null, floodOf: id => flood.get(id) || null });
        return { vms_id: b.id, text: msg.text, mode: 'auto' };
      });
    }
  };
}

export function vmsDisplay32(board, alerts = [], bus = null) {
  if (bus && bus.manualOf) {
    const m = bus.manualOf(board && board.id);
    if (m) return { state: 'manual', lines: m.lines.slice(), text: m.text, key: `manual|${m.text}`, edge: null, prob: 0, horizonMin: 0 };
  }
  if (bus && bus.floodOf) {
    const f = bus.floodOf(board && board.id);
    if (f) return { state: 'alert', lines: f.lines.slice(), text: f.lines.join(' · '), key: `flood|${f.lines.join('|')}`, edge: null, prob: 0, horizonMin: 0 };
  }
  return vmsMessage32(board, alerts);
}
