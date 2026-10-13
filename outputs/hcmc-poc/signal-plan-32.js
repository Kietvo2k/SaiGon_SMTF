// Kế hoạch đèn M1 — cụm Hàng Xanh. Thuần JS, chạy được trong Node.
// group_axis_deg: hướng trục đường chính tại nút (độ, 0–180, trong hệ cảnh x–z).
// Quy tắc suy trục: đường cấp cao nhất qua nút (trunk > primary > …); cùng cấp thì
// tổng chiều dài cạnh qua nút lớn nhất; trục = hướng trung bình modulo 180° của các
// nhánh thuộc đường đó (đã tra trên road-graph-31.json).
export const SIGNAL_PLAN_32_VERSION = 'signal-plan-32a';

export const SIGNAL_PLAN_32 = [
  { node_id: 'HX-01', osm_id: 366390689, group_axis_deg: 160.4, offset_s: 0 },
  { node_id: 'HX-02', osm_id: 366440827, group_axis_deg: 17.6, offset_s: 8 },
  { node_id: 'HX-03', osm_id: 10118771782, group_axis_deg: 4.3, offset_s: 16 },
  { node_id: 'HX-04', osm_id: 12437015526, group_axis_deg: 93.4, offset_s: 24 },
  { node_id: 'HX-05', osm_id: 701671562, group_axis_deg: 162.9, offset_s: 0 },
  { node_id: 'HX-06', osm_id: 1497276515, group_axis_deg: 171.4, offset_s: 32 }
];

export function buildSignalPlan32({ graph, nodeMap }) {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const rowByOsm = new Map(SIGNAL_PLAN_32.map(r => [r.osm_id, r]));
  const metaByOsm = new Map(nodeMap.map(m => [m.osm_id, m]));
  const signalNodes = [], offset = new Map();
  // Cụm gom THEO node_map (cluster_id), không theo khoảng cách hình học.
  const clusters = [];
  for (const row of SIGNAL_PLAN_32) {
    const meta = metaByOsm.get(row.osm_id);
    if (!meta) throw new Error(`node_map.json thiếu osm_id ${row.osm_id}`);
    let cluster = clusters.find(c => c.cluster_id === meta.cluster_id);
    if (!cluster) {
      cluster = { cluster_id: meta.cluster_id, nodeIds: [], offset_s: row.offset_s };
      clusters.push(cluster);
    }
    const ni = index.get(row.osm_id);
    if (ni === undefined) throw new Error(`graph thiếu nút ${row.osm_id}`);
    cluster.nodeIds.push(ni);
    signalNodes.push(ni);
    offset.set(ni, cluster.offset_s);
  }
  // arriveGroup theo st = edge*2 + (dir>0 ? 0 : 1): nhóm 0 nếu |cos(hướng vào − trục)| > 0,5.
  const arriveGroup = new Uint8Array(graph.edges.length * 2);
  const E = graph.edges;
  for (let st = 0; st < arriveGroup.length; st++) {
    const e = st >> 1, dir = st & 1 ? -1 : 1;
    const toId = dir > 0 ? E[e].to : E[e].from;
    const row = rowByOsm.get(toId);
    if (!row) continue;
    const c = E[e].c, n = c.length / 2;
    const head = dir > 0
      ? Math.atan2(c[n * 2 - 1] - c[n * 2 - 3], c[n * 2 - 2] - c[n * 2 - 4])
      : Math.atan2(c[3] - c[1], c[2] - c[0]);
    arriveGroup[st] = Math.abs(Math.cos(head - row.group_axis_deg * Math.PI / 180)) > 0.5 ? 0 : 1;
  }
  return { signalNodes, offset, arriveGroup, clusters };
}
