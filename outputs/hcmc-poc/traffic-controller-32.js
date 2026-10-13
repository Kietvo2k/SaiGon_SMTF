// Bộ điều khiển đèn M1 — hợp đồng đặc tả mục 4.1/6. Thuần JS, chạy được trong Node.
import { SIGNAL_PLAN_32 } from './signal-plan-32.js?v=32a';

export const CONTROLLER_32_VERSION = 'controller-32a';
export const SIGNAL_PARAMS_32 = Object.freeze({
  yellowS: 3, allRedS: 2, minGreenS: 8, maxGreenS: 45, decisionIntervalS: 1, switchMargin: 0.15,
  fixed: Object.freeze({ green0S: 22, green1S: 16 }), clusterM: 80
});

const GREEN = 'green', YELLOW = 'yellow', RED = 'red';

export function createSignalController32({ net, sim = null, mode = 'fixed', params = {}, redRun = null }) {
  if (mode !== 'fixed' && mode !== 'smart') throw new TypeError('mode phải là fixed|smart');
  let P = { ...SIGNAL_PARAMS_32, ...params, fixed: { ...SIGNAL_PARAMS_32.fixed, ...(params.fixed || {}) } };
  if (!(P.minGreenS < P.maxGreenS)) throw new TypeError('params: minGreenS phải < maxGreenS');
  let curMode = mode, pendingMode = null;
  let simRef = sim;
  const osmToIndex = new Map(net.G.nodes.map((n, i) => [Number(n.id), i]));
  const indexToNodeId = new Map();
  for (const row of SIGNAL_PLAN_32) { const idx = osmToIndex.get(row.osm_id); if (idx !== undefined) indexToNodeId.set(idx, row.node_id); }
  const nodeIdToIndex = new Map([...indexToNodeId].map(([i, nid]) => [nid, i]));
  const normNode = node => (typeof node === 'string'
    ? (nodeIdToIndex.get(node) ?? net.G.nodes.findIndex(x => String(x.id) === node))
    : node);
  // Cụm đèn: đơn vị quyết định. clusterOf: nodeIndex → id cụm.
  const clusters = [], clusterOf = new Map();
  if (net.signalPlan && net.signalPlan.clusters) {
    for (const c of net.signalPlan.clusters) {
      const st = { cluster_id: c.cluster_id, nodeIds: [...c.nodeIds], offset_s: c.offset_s, group: 0, phase: GREEN, tPhase: 0, cycleStart: 0, cycle: 0, switches: 0, lastDecision: -Infinity };
      clusters.push(st);
      for (const n of c.nodeIds) clusterOf.set(n, st);
    }
  } else {
    // Không có signalPlan: một cụm ảo cho mọi nút có đèn 31A (hành vi fixed theo SIGNAL_CYCLE giữ ở sim).
    const st = { cluster_id: 'NET-C1', nodeIds: [], offset_s: 0, group: 0, phase: GREEN, tPhase: 0, cycleStart: 0, cycle: 0, switches: 0, lastDecision: -Infinity };
    for (let n = 0; n < net.signal.length; n++) if (net.signal[n]) { st.nodeIds.push(n); clusterOf.set(n, st); }
    clusters.push(st);
  }
  const nodeIdOf = n => indexToNodeId.get(n) ?? String(net.G.nodes[n]?.id ?? n);
  const overrides = new Map(); // nodeIndex → {group, by, reason, until_t_sim, until_at}
  // Lịch sử KPI: mẫu mỗi 1 s trong cửa sổ 60 s.
  const WINDOW_S = 60;
  const samples = []; // {t, wait_avg, nodeWait: Map, nodeQueue: Map, clusterQueue: Map}
  let switchWindow = [];
  const greenOf = c => c.group === 0 ? P.fixed.green0S : P.fixed.green1S;
  const phaseLen = (c, phase) => phase === GREEN ? (curMode === 'fixed' ? greenOf(c) : c.greenLen ?? P.minGreenS) : phase === YELLOW ? P.yellowS : P.allRedS;
  const advancePhase = (c, tSim) => {
    if (c.phase === RED) {
      if (pendingMode) { curMode = pendingMode; pendingMode = null; for (const x of clusters) x.greenLen = P.minGreenS; }
      c.cycle += 1;
      c.group = c.group === 0 ? 1 : 0;
      c.phase = GREEN;
      c.greenLen = P.minGreenS;
      c.cycleStart = tSim;   // mốc để isGreen fixed suy pha trực tiếp từ thời gian
      c.lastDecision = tSim;
      c.switches++;
      switchWindow.push(tSim);
    } else if (c.phase === GREEN) c.phase = YELLOW;
    else c.phase = RED;
    c.tPhase = tSim;
  };
  const pressure = (c, queues, g) => {
    let p = 0;
    for (const n of c.nodeIds) {
      const rows = queues.get(n);
      if (!rows) continue;
      for (const r of rows) {
        if (r.group !== g) continue;
        p += Math.max(0, r.count - (r.q_out || 0));   // áp lực = hàng chờ vào − q_out (25 m đầu làn ra)
      }
    }
    return p;
  };
  const decision = (c, tSim, queues) => {
    if (curMode !== 'smart' || c.phase !== GREEN) return;
    const elapsed = tSim - c.tPhase;
    if (elapsed < P.minGreenS) return;
    if (elapsed - (c.lastDecision - c.tPhase) < P.decisionIntervalS && elapsed < P.maxGreenS) return;
    c.lastDecision = tSim;
    const p0 = pressure(c, queues, 0), p1 = pressure(c, queues, 1);
    const total = Math.max(1, p0 + p1), margin = Math.abs(p0 - p1) / total;
    const want = p0 > p1 ? 0 : 1;
    if (elapsed >= P.maxGreenS || (margin >= P.switchMargin && want !== c.group)) { c.greenLen = elapsed; advancePhase(c, tSim); }
    else if (c.greenLen === undefined) c.greenLen = Math.min(P.maxGreenS, Math.max(P.minGreenS, elapsed));
  };
  const overrideOf = (node, tSim) => {
    const o = overrides.get(node);
    if (!o) return null;
    if (tSim > o.until_t_sim) { overrides.delete(node); return null; }
    return o;
  };
  // Pha fixed suy TRỰC TIẾP từ thời gian (không phụ thuộc lần gọi `update` trước):
  // tính từ `cycleStart` (lúc nhóm-0 bắt đầu xanh) theo thời lượng cố định.
  const phaseFixed = (c, tSim, g) => {
    const g0 = P.fixed.green0S, y = P.yellowS, r = P.allRedS, g1 = P.fixed.green1S;
    const cyc = g0 + y + r + g1 + y + r;
    const el = ((tSim - c.cycleStart) % cyc + cyc) % cyc;
    if (g === 0) return el < g0 ? GREEN : (el < g0 + y ? YELLOW : RED);
    const s1 = g0 + y + r;
    if (el < s1) return RED;
    if (el < s1 + g1) return GREEN;
    return el < s1 + g1 + y ? YELLOW : RED;
  };
  const isGreen = (node, st, tSim) => {
    if (!net.signal[node]) return true;
    const c = clusterOf.get(node);
    const o = overrideOf(node, tSim);
    if (o) return net.arriveGroup[st] === o.group;
    if (!c) return true;
    const g = net.arriveGroup[st];
    if (curMode === 'fixed') return phaseFixed(c, tSim, g) === GREEN;
    // smart: suy từ (tSim − tPhase); pha đã hết thì không còn xanh (không cần update trước).
    const el = tSim - c.tPhase;
    if (c.phase === GREEN) return g === c.group && el < phaseLen(c, GREEN);
    return false;
  };
  const stateOf = (node0, tSim) => {
    const node = normNode(node0);
    const c = clusterOf.get(node) || clusters[0];
    const t = tSim - c.tPhase;
    const len = phaseLen(c, c.phase);
    const remain = phase => Math.max(0, +(len - t).toFixed(1));
    const ov = overrideOf(node, tSim);
    const phaseOf = g => {
      if (ov) return { group: g, phase: g === ov.group ? GREEN : RED, countdown_s: +(ov.until_t_sim - tSim).toFixed(1) };
      if (g === c.group) return { group: g, phase: c.phase, countdown_s: remain(c.phase) };
      // nhóm kia luôn đỏ khi nhóm này đang xanh/vàng/đỏ chung
      return { group: g, phase: RED, countdown_s: remain(c.phase) };
    };
    const cycleNominal = P.fixed.green0S + P.fixed.green1S + 2 * P.yellowS + 2 * P.allRedS;   // 48 s
    return {
      node_id: nodeIdOf(node), cluster_id: c.cluster_id,
      cycle_s: cycleNominal,
      mode: curMode,
      override: ov ? { ...ov } : null,
      phases: [phaseOf(0), phaseOf(1)]
    };
  };
  const update = (tSim, queues) => {
    for (const c of clusters) {
      const qmap = queues instanceof Map ? queues : new Map();
      decision(c, tSim, qmap);
      // Bắt buộc tôn trọng maxGreen cả khi mode fixed lẫn smart đã hết xanh kéo dài.
      const elapsed = tSim - c.tPhase;
      const maxLen = curMode === 'fixed' ? greenOf(c) : P.maxGreenS;
      if (c.phase === GREEN && elapsed > maxLen) advancePhase(c, tSim);
      else if (c.phase !== GREEN && elapsed > phaseLen(c, c.phase)) advancePhase(c, tSim);
    }
    // Mẫu KPI mỗi 1 s.
    const tRound = Math.floor(tSim);
    if (!samples.length || samples[samples.length - 1].t !== tRound) {
      let waitSum = 0, waitN = 0; const nodeWait = new Map(), nodeQueue = new Map(), nodeCross = new Map();
      if (queues instanceof Map) {
        for (const [node, rows] of queues) {
          let qw = 0, qs = 0, qc = 0;
          for (const r of rows) { waitSum += r.wait_sum_s; waitN += Math.max(1, r.count); qw += r.wait_sum_s; qs += Math.max(1, r.count); qc += r.count; nodeCross.set(node, (nodeCross.get(node) || 0) + (r.crossed || 0)); }
          if (qs) nodeWait.set(node, qw / qs);
          nodeQueue.set(node, qc);
        }
      }
      samples.push({ t: tRound, wait_avg: waitN ? waitSum / waitN : 0, nodeWait, nodeQueue, nodeCross });
      while (samples.length && samples[0].t < tRound - WINDOW_S) samples.shift();
      switchWindow = switchWindow.filter(t => t >= tSim - WINDOW_S);
    }
  };
  const metrics = tSim => {
    const win = samples.slice(-WINDOW_S);
    const waits = win.map(s => s.wait_avg).sort((a, b) => a - b);
    const wait_avg_s = waits.length ? +(waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(2) : 0;
    const wait_p95_s = waits.length ? +waits[Math.min(waits.length - 1, Math.floor(waits.length * 0.95))].toFixed(2) : 0;
    let queueMax = 0, queueSum = 0, queueN = 0;
    for (const s of win) {
      let clusterMax = 0;
      for (const c of clusters) {
        let q = 0;
        for (const n of c.nodeIds) q += s.nodeQueue.get(n) || 0;
        clusterMax = Math.max(clusterMax, q);
      }
      queueMax = Math.max(queueMax, clusterMax);
      let tot = 0, cnt = 0;
      for (const [, v] of s.nodeQueue) { tot += v; cnt++; }
      if (cnt) { queueSum += tot / cnt; queueN++; }
    }
    const flow_global = simRef ? simRef.stats().edgeTransitionsLast30s * 2 : 0;
    const by_node = [];
    for (const c of clusters) {
      for (const n of c.nodeIds) {
        const w = win.map(s => s.nodeWait.get(n)).filter(v => v !== undefined);
        const qv = win.map(s => s.nodeQueue.get(n) || 0);
        const crossed = win.reduce((a, s) => a + (s.nodeCross.get(n) || 0), 0);
        by_node.push({
          node_id: nodeIdOf(n), cluster_id: c.cluster_id,
          wait_avg_s: +(w.reduce((a, b) => a + b, 0) / Math.max(1, w.length)).toFixed(2),
          queue_max: Math.max(0, ...qv),
          flow_per_min: +(crossed * 60 / Math.max(1, win.length)).toFixed(1),
          switches_per_hour: +(c.switches * 3600 / Math.max(1, tSim)).toFixed(1)
        });
      }
    }
    return {
      window_s: WINDOW_S, wait_avg_s, wait_p95_s, queue_max: queueMax,
      queue_avg: +(queueSum / Math.max(1, queueN)).toFixed(2),
      flow_per_min: flow_global, mode: curMode,
      overrides: [...overrides.entries()].map(([n, o]) => ({ node_id: nodeIdOf(n), ...o })),
      by_node
    };
  };
  const stateHash = () => {
    let h = 2166136261;
    const mix = v => { h = (h ^ (typeof v === 'string' ? v.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) : v)) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
    mix(curMode);
    for (const c of clusters) { mix(c.group); mix(c.phase); mix(Math.round((c.tPhase ?? 0) * 10)); }
    for (const [n, o] of overrides) { mix(n); mix(o.group); mix(Math.round(o.until_t_sim * 10)); }
    return h.toString(16).padStart(8, '0');
  };
  return {
    isGreen, stateOf, update, metrics, stateHash,
    setMode(next, opts = {}) {
      if (next !== 'fixed' && next !== 'smart') throw new TypeError('setMode: fixed|smart');
      if (opts.immediate) {
        curMode = next;
        pendingMode = null;
        for (const c of clusters) c.greenLen = P.minGreenS;
      } else {
        pendingMode = next;   // áp dụng trong advancePhase ở lần hết pha đỏ kế tiếp
      }
      return { ok: true, mode: curMode };
    },
    // setMode('smart') KHÔNG tức thì: chế độ mới áp dụng ở lần đổi pha đỏ kế tiếp.
    // getMode() trả chế độ ĐANG CHỜ nếu có (để UI/tests phản ánh ý định), ngược lại curMode.
    getMode: () => pendingMode || curMode,
    overridePhase(node0, group, duration_s, by, reason) {
      const n = normNode(node0);
      if (group === null || group === undefined) { overrides.delete(n); return { ok: true, until_t_sim: 0, until_at: new Date(0).toISOString() }; }
      if (![0, 1].includes(group)) throw new TypeError('overridePhase: group 0|1|null');
      const dur = Math.min(120, Math.max(1, Number(duration_s)));
      const nowSim = simRef ? simRef.counters.t : 0;
      const until_t_sim = + (nowSim + dur).toFixed(1);
      const until_at = new Date(Date.now() + dur * 1000).toISOString();
      overrides.set(n, { group, by: String(by), reason: String(reason || ''), until_t_sim, until_at });
      return { ok: true, until_t_sim, until_at };
    },
    setParams(partial) {
      const next = { ...P, ...partial, fixed: { ...P.fixed, ...(partial.fixed || {}) } };
      if (!(next.minGreenS < next.maxGreenS)) throw new TypeError('setParams: minGreenS phải < maxGreenS');
      P = next; return getParams();
    },
    getParams: () => ({ ...P, fixed: { ...P.fixed } }),
    cycleIdOf(node0, tSim) {
      const node = normNode(node0);
      const c = clusterOf.get(node) || clusters[0];
      const cycleS = P.fixed.green0S + P.fixed.green1S + 2 * P.yellowS + 2 * P.allRedS;   // 48 s danh nghĩa
      return c.cycle + Math.floor(Math.max(0, tSim - c.tPhase) / cycleS);
    },
    runsRed: (i, node, st, tSim) => (redRun ? !!redRun(i, node, st, tSim) : false),
    attachSim(s) { simRef = s || null; return simRef; }
  };
}
