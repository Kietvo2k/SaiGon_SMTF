import { createSignalController32 } from './traffic-controller-32.js?v=32c';
import { buildJunctionLayout32 } from './junction-layout-32.js?v=32c';

// Một giao lộ logic có thể gồm nhiều mã nút dữ liệu (ví dụ HX-01 + HX-05). Nhánh nội bộ cụm
// không tính thành hướng độc lập; nhánh hẻm/dịch vụ bị bỏ khi giao lộ đã đủ 3 nhánh chính.
export function junctionRows32(net, nodeMap, opts = {}) {
  return buildJunctionLayout32({ net, nodeMap, ...opts }).map(row => ({
    ...row,
    label: `${row.name} · ${row.armCount} hướng`
  }));
}

// Mẫu chỉ đọc: không gọi buildQueues sống vì hàm đó ghi mốc crossed/lastS của mô phỏng.
export function frozenQueues32(net, sim) {
  const q = new Map(net.signalPlan.signalNodes.map(n => [n, [0, 1].map(group => ({ group, count: 0, q_out: 0, crossed: 0, wait_sum_s: 0, wait_max_s: 0, speed_mean: 0 }))]));
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const l = sim.lane[i], st = net.lanes.st[l], g = net.arriveGroup[st], n = net.lanes.to[l];
    const dist = net.lanes.length[l] - net.Rz[n] - sim.s[i];
    if (q.has(n) && !net.signalPlan.internalSt?.has(st) && dist >= 0 && (sim.v[i] < .5 || dist <= 25)) q.get(n)[g].count++;
    const from = net.lanes.from[l];
    if (q.has(from) && sim.s[i] >= 0 && sim.s[i] <= 25) q.get(from)[g].q_out++;
  }
  return q;
}

// Chạy bản sao máy trạng thái; xe/hàng chờ giữ nguyên. Không tua hoặc ghi đè controller đang chạy.
// Bước mặc định 0,5 s: đủ mịn cho dải pha 60 s mà chỉ tốn 1/5 phép tính so với 0,1 s.
// demo-v2 (P1-8): nhận thêm alerts (cạnh kẹt từ heat-live) để tính xác suất kẹt theo nút;
// plannedGreen gọi controller.plannedGreenOf (thời gian xanh kế hoạch cho thanh tra đèn).
export function previewSignals32({ net, sim, controller, rows, horizon = 60, stepS = 0.5, alerts = [] }) {
  const time = sim.counters.t, state = controller.exportPhases(), queues = frozenQueues32(net, sim);
  const plannedOf = controller.plannedGreenOf || (() => null);
  // Cạnh vào từng nút điều khiển: alert nào chạm nút thì nút đó có cảnh báo kẹt.
  const hasEdges = Array.isArray(net.lanes && net.lanes.edge);
  const edgesInto = new Map();
  if (hasEdges) for (let l = 0; l < net.lanes.to.length; l++) {
    const node = net.lanes.to[l], edge = net.lanes.edge[l];
    let set = edgesInto.get(node);
    if (!set) edgesInto.set(node, set = new Set());
    set.add(edge);
  }
  const jamOfRow = row => {
    let best = null;
    if (!hasEdges || !alerts.length) return null;
    for (const n of row.indexes) {
      const edges = edgesInto.get(n);
      if (!edges) continue;
      for (const a of alerts) {
        if (!a || !edges.has(a.edge)) continue;
        if (!best || a.prob > best.prob) best = { prob: a.prob, reliability: a.reliability, horizonMin: a.horizonMin, name: a.name || null };
      }
    }
    return best;
  };
  const frozen = { N: sim.N, active: sim.active.slice(), lane: sim.lane.slice(), s: sim.s.slice(), v: sim.v.slice(), counters: { t: time } };
  const fork = createSignalController32({ net, sim: frozen, mode: state.curMode, params: controller.getParams() });
  fork.importPhases(state);
  const result = rows.map(row => {
    const st = controller.stateOf(row.nodeIds[0], time);
    const planned = plannedOf(row.nodeIds[0], time);
    return {
      ...row, phases: st.phases, cycle_s: st.cycle_s,
      queue: [0, 1].map(g => row.indexes.reduce((sum, n) => sum + (queues.get(n)?.[g].count || 0), 0)),
      segments: [], allocation: [0, 0], allocationPct: [0, 0], now: [],
      plannedGreen: planned ? { source: planned.source, green: planned.green.slice() } : null,
      jam: jamOfRow(row)
    };
  });
  const steps = Math.max(1, Math.round(horizon / stepS));
  for (let k = 0; k < steps; k++) {
    const start = k * stepS, end = Math.min(horizon, (k + 1) * stepS);
    if (k) { frozen.counters.t = time + start; fork.update(time + start, queues); }
    result.forEach(row => {
      for (const p of fork.stateOf(row.nodeIds[0], time + start).phases) {
        const prev = row.segments.findLast(s => s.group === p.group);
        if (prev?.phase === p.phase) prev.end = end;
        else row.segments.push({ group: p.group, phase: p.phase, start, end });
        if (p.phase === 'green') row.allocation[p.group] += end - start;
      }
    });
  }
  result.forEach(row => {
    row.allocation = row.allocation.map(v => Math.round(v * 10) / 10);
    const total = Math.max(0.001, row.allocation[0] + row.allocation[1]);
    row.allocationPct = row.allocation.map(v => Math.round(v / total * 1000) / 10);
    row.now = [0, 1].map(g => {
      const segs = row.segments.filter(s => s.group === g);
      const seg = segs.find(s => s.start <= 0.001 && s.end > 0.001) || segs[0] || null;
      const nextGreen = segs.find(s => s.phase === 'green' && s.end > 0.001) || null;
      return {
        phase: seg?.phase || 'red',
        remain_s: seg ? Math.round(seg.end * 10) / 10 : 0,
        greenAt_s: nextGreen ? Math.round(nextGreen.start * 10) / 10 : null,
        greenUntil_s: nextGreen ? Math.round(nextGreen.end * 10) / 10 : null
      };
    });
  });
  return { time, mode: controller.getMode(), rows: result };
}
