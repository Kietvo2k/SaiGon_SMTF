// Chỉ số A1 (T2b): độ trễ tích lũy trung bình mỗi xe qua vạch dừng các nút Hàng Xanh.
// Thuần JS, không phụ thuộc THREE; dùng cho scripts/kpi-ab-32.mjs và test Node.
//
// Định nghĩa (theo quyết định điều phối viên, thay đặc tả §9):
//   Với mỗi xe qua vạch dừng của một nút HX trong khoảng t ∈ [window0, window1],
//   độ trễ = tổng thời gian xe có v < slowV trong vùng tiếp cận `approachM` m trước vạch.
//   A1 = trung bình các độ trễ đó (s/xe). Thông lượng = số xe qua vạch HX trong cửa sổ.
// Vùng tiếp cận đo DỌC LỘ TRÌNH (gồm cả hàng chờ tràn ngược qua làn trên, không chỉ làn sát vạch).

export const A1_APPROACH_M = 150;
export const A1_WINDOW = Object.freeze([300, 1800]);
export const A1_SLOW_V = 1.0;

// Kịch bản cao điểm Hàng Xanh (tất định): tăng nhu cầu đổ về trung tâm HX bằng
// hệ số mật độ `spawnBias` cho làn gần tâm, thiên hướng rẽ về tâm `turnBias` và `poolScale`.
export const PEAK_HANG_XANH_DEMAND = Object.freeze({
  center: [-130, -2540], radius_m: 1500, turnBias: 15, spawnBias: 200, poolScale: 10
});

// Chỉ số nút (theo net.G.nodes) của 6 nút Hàng Xanh, từ node_map (osm_id ↔ node_id).
export function hxNodeIndices(net, nodeMap) {
  const idx = new Map(net.G.nodes.map((n, i) => [n.id, i]));
  return nodeMap.map(m => idx.get(m.osm_id)).filter(i => i !== undefined);
}

export function createDelayTracker32({ net, hxNodes, approachM = A1_APPROACH_M, window = A1_WINDOW, slowV = A1_SLOW_V }) {
  const { lanes, Rz } = net;
  const hx = new Set(hxNodes);
  const [w0, w1] = window;
  const rec = new Map();   // i → {gen, lane, sPrev, slow, target, recorded}
  const records = [];      // {t, delay, i, gen, node}
  let lastT = null;
  // Nút HX gần nhất trên lộ trình (dọc làn hiện tại + các làn kế) và khoảng cách tới vạch dừng.
  const firstHxOf = (i, l, sc, path, PN) => {
    const node = lanes.to[l];
    if (hx.has(node)) return { node, dist: lanes.length[l] - (Rz[node] || 0) - sc };
    if (!path || !PN) return null;
    let d = lanes.length[l] - sc;
    for (let p = 0; p < PN; p++) {
      const nl = path[i * PN + p]; if (nl === undefined || nl < 0) break;
      const nn = lanes.to[nl];
      if (hx.has(nn)) return { node: nn, dist: d + lanes.length[nl] - (Rz[nn] || 0) };
      d += lanes.length[nl];
      if (d > approachM) break;
    }
    return null;
  };
  const record = (tSim, delay, i, gen, node) => { if (tSim >= w0 && tSim <= w1) records.push({ t: tSim, delay, i, gen, node }); };
  const tick = (tSim, sim) => {
    const delta = lastT == null ? 0 : tSim - lastT;
    lastT = tSim;
    const path = sim.path || null;
    const PN = path ? Math.round(path.length / sim.N) : 0;
    for (let i = 0; i < sim.N; i++) {
      if (!sim.active[i]) { rec.delete(i); continue; }
      const l = sim.lane[i], gen = sim.gen[i], sc = sim.s[i], vv = sim.v[i];
      let r = rec.get(i);
      if (!r || r.gen !== gen) { r = { gen, lane: l, sPrev: null, slow: 0, target: null, recorded: false }; rec.set(i, r); }
      if (l !== r.lane) {
        const oldNode = lanes.to[r.lane];
        // Qua nút: nhảy làn sang làn kế có from = nút vừa rời (bắt cả trường hợp s nhảy qua vạch trong 1 bước).
        if (r.target !== null && oldNode === r.target && !r.recorded && lanes.from[l] === oldNode) {
          record(tSim, r.slow, i, gen, oldNode);
          r.slow = 0; r.recorded = true;
        }
        r.lane = l; r.recorded = false;
      }
      const up = firstHxOf(i, l, sc, path, PN);
      const target = up ? up.node : null;
      if (target === null) r.slow = 0;
      else if (target !== r.target) { r.slow = 0; r.recorded = false; }
      r.target = target;
      if (target !== null && !r.recorded) {
        const stopPos = lanes.length[l] - (Rz[target] || 0);
        if (r.sPrev != null && r.sPrev <= stopPos && sc > stopPos) { record(tSim, r.slow, i, gen, target); r.slow = 0; r.recorded = true; }
        else if (up.dist <= approachM && vv < slowV) r.slow += delta;
      }
      r.sPrev = sc;
    }
  };
  const result = () => {
    const n = records.length;
    const total = records.reduce((a, r) => a + r.delay, 0);
    return { delay_avg_s: n ? +(total / n).toFixed(3) : 0, crossings: n, total_delay_s: +total.toFixed(3) };
  };
  return { tick, result, records };
}
