// Kế hoạch đèn M1 — cụm Hàng Xanh + Bắc. Thuần JS, chạy được trong Node.
// group_axis_deg: hướng trục đường chính tại nút (độ, 0–180, trong hệ cảnh x–z).
// Quy tắc suy trục: đường cấp cao nhất qua nút (trunk > primary > …); cùng cấp thì
// tổng chiều dài cạnh qua nút lớn nhất; trục = hướng trung bình modulo 180° của các
// nhánh thuộc đường đó (đã tra trên road-graph-31.json).
// HX-06 (Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh) có hai đường CÙNG CẤP; chọn trục Hàng Xanh
// 171,4° vì gần trục dọc cụm Hàng Xanh (HX-01/HX-05 ≈ 160°) nên nhóm pha liền mạch dọc Điện
// Biên Phủ – Hàng Xanh; Xô Viết Nghệ Tĩnh 98° lệch trục rõ rệt nên xếp nhóm 1.
//
// `split`: nút OSM bị tách khỏi nút chính vài chục mét nhưng là CÙNG một giao lộ thật.
//   Gộp vào cluster của nút chính để stop line/queue của panel tính đúng nhánh.
// `flashing`: cụm chỉ nhấp nháy vàng (không chạy chu kỳ); node bị loại khỏi signalNodes
//   để mô phỏng coi là nút nhường đường, không phải nút "managed".
// `green0_s`/`green1_s`: thời lượng xanh theo cụm cho bộ điều khiển (hợp đồng retime).
export const SIGNAL_PLAN_32_VERSION = 'signal-plan-32b';

export const SIGNAL_PLAN_32 = [
  { node_id: 'HX-01', osm_id: 366390689, group_axis_deg: 160.4, offset_s: 0, name: 'Ngã tư Hàng Xanh', green0_s: 30, green1_s: 10 },
  { node_id: 'HX-01-02', osm_id: 676554122, group_axis_deg: 160.4, offset_s: 0, name: 'Ngã tư Hàng Xanh', split: true },
  { node_id: 'HX-01-03', osm_id: 2030639354, group_axis_deg: 160.4, offset_s: 0, name: 'Ngã tư Hàng Xanh', split: true },
  { node_id: 'HX-02', osm_id: 366440827, group_axis_deg: 17.6, offset_s: 8, name: 'Nguyễn Gia Trí × Điện Biên Phủ', green0_s: 22, green1_s: 16 },
  { node_id: 'HX-02-02', osm_id: 729523408, group_axis_deg: 17.6, offset_s: 8, name: 'Nguyễn Gia Trí × Điện Biên Phủ', split: true },
  // HX-C3/HX-C4 là hộp nút OSM bị tách thành vòng nhiều node ngắn (10–22 m) — gộp cả vòng
  // vào cụm để không còn vạch/đèn nằm giữa hộp (nguyên nhân "xanh mà xe không chạy").
  { node_id: 'HX-03', osm_id: 10118771782, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', flashing: true },
  { node_id: 'HX-03-02', osm_id: 10118771783, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-03-03', osm_id: 10118771784, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-03-04', osm_id: 12313165808, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-03-05', osm_id: 12313165809, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-03-06', osm_id: 12313165810, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-03-07', osm_id: 12313165811, group_axis_deg: 4.3, offset_s: 16, name: 'Bạch Đằng × Đinh Bộ Lĩnh', split: true, flashing: true },
  { node_id: 'HX-04', osm_id: 12437015526, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', flashing: true },
  { node_id: 'HX-04-02', osm_id: 12307718619, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-03', osm_id: 366419346, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-04', osm_id: 5733448384, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-05', osm_id: 12313135290, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-06', osm_id: 10118771791, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-07', osm_id: 729523390, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-04-08', osm_id: 5733448390, group_axis_deg: 93.4, offset_s: 24, name: 'Bạch Đằng × Xô Viết Nghệ Tĩnh', split: true, flashing: true },
  { node_id: 'HX-05', osm_id: 701671562, group_axis_deg: 162.9, offset_s: 0, name: 'Ngã tư Hàng Xanh' },
  { node_id: 'HX-06', osm_id: 1497276515, group_axis_deg: 171.4, offset_s: 32, name: 'Hàng Xanh × Xô Viết Nghệ Tĩnh', green0_s: 22, green1_s: 16 }
];

// Cầu vượt Hàng Xanh: tuyệt đối không đặt vạch dừng/đầu đèn trên deck hoặc chân dốc.
// Đây là hợp đồng cho mô phỏng (noStopSt) — sim có thể đọc để không meter nhánh cầu.
export const OVERPASS_NAME_RE_32 = /cầu vượt/i;

export function buildSignalPlan32({ graph, nodeMap, rows = SIGNAL_PLAN_32 }) {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const metaByOsm = new Map(nodeMap.map(m => [Number(m.osm_id), m]));
  const clusters = [], clusterById = new Map(), accepted = [], skipped = [];
  // Cụm gom THEO node_map (cluster_id); dòng thiếu node_map/graph bị bỏ (kế hoạch HX dùng
  // chung cho cả mạng classic không có các node tách) và ghi vào `skipped` để kiểm.
  const isPublicNorth = graph.region === 'bac';
  for (const row of rows) {
    const osm = Number(row.osm_id);
    const meta = metaByOsm.get(osm);
    const ni = index.get(osm) ?? index.get(row.osm_id);
    if (!meta || ni === undefined) { skipped.push({ osm_id: row.osm_id, why: !meta ? 'node_map' : 'graph' }); continue; }
    const key = meta.cluster_id || row.cluster_id || row.node_id;
    let cluster = clusterById.get(key);
    if (!cluster) {
      cluster = { cluster_id: key, name: row.name || row.node_id, nodeIds: [], offset_s: row.offset_s || 0, flashing: false };
      if (isPublicNorth && Number.isFinite(row.green0_s) && Number.isFinite(row.green1_s)) cluster.timing = { green0_s: row.green0_s, green1_s: row.green1_s };
      clusters.push(cluster); clusterById.set(key, cluster);
    }
    if (row.flashing && isPublicNorth) cluster.flashing = true;
    if (row.roundabout && isPublicNorth) cluster.roundabout = true;
    if (!cluster.nodeIds.includes(ni)) cluster.nodeIds.push(ni);
    accepted.push({ row, ni, cluster });
  }
  // Nút có đèn THẬT (chạy chu kỳ) ≠ nút chỉ nhấp nháy vàng. Chỉ nút thật vào signalNodes.
  const signalNodes = [], flashingNodes = [], offset = new Map();
  for (const { ni, cluster } of accepted) {
    (cluster.flashing ? flashingNodes : signalNodes).push(ni);
    offset.set(ni, cluster.offset_s);
  }
  // arriveGroup theo st = edge*2 + (dir>0 ? 0 : 1): nhóm 0 nếu |cos(hướng vào − trục)| > 0,5.
  const rowByOsm = new Map(accepted.map(({ row }) => [Number(row.osm_id), row]));
  const arriveGroup = new Uint8Array(graph.edges.length * 2);
  const E = graph.edges;
  for (let st = 0; st < arriveGroup.length; st++) {
    const e = st >> 1, dir = st & 1 ? -1 : 1;
    const toId = dir > 0 ? E[e].to : E[e].from;
    const row = rowByOsm.get(Number(toId));
    if (!row) continue;
    const c = E[e].c, n = c.length / 2;
    const head = dir > 0
      ? Math.atan2(c[n * 2 - 1] - c[n * 2 - 3], c[n * 2 - 2] - c[n * 2 - 4])
      : Math.atan2(c[3] - c[1], c[2] - c[0]);
    arriveGroup[st] = Math.abs(Math.cos(head - row.group_axis_deg * Math.PI / 180)) > 0.5 ? 0 : 1;
  }
  // Đoạn nối hai điểm dữ liệu trong cùng giao lộ không tạo thêm vạch đèn bên trong.
  const clusterOf = new Map(clusters.flatMap(c => c.nodeIds.map(n => [graph.nodes[n].id, c.cluster_id])));
  const internalSt = new Set();
  // Cầu vượt: không vạch dừng, không meter ở chân dốc. Mark state là "internal" để mô phỏng
  // cho xe thoát tự do (nhường/khoá hộp) và layout không dựng đầu đèn cho nhánh này.
  // Chỉ áp cho bản public-north (graph.region === 'bac'); mạng classic giữ nguyên hành vi.
  const noStopSt = new Set(), noStopEdges = [], yieldEdges = [];
  if (graph.region === 'bac') {
    const signalSet = new Set(signalNodes);
    const MINOR_TYPES = new Set(['residential', 'service', 'living_street', 'track', 'path', 'footway', 'pedestrian', 'cycleway', 'steps']);
    graph.edges.forEach((e, k) => {
      const road = graph.roads?.[e.road];
      const name = road?.name || '';
      const type = road?.type || road?.highway || '';
      const overpass = e.elevationClass === 'overpass' || OVERPASS_NAME_RE_32.test(name);
      // Hẻm/nhánh phụ vào nút có đèn: nhường đường, không cấp pha riêng (tránh pha xanh rỗng).
      const minorIntoSignal = MINOR_TYPES.has(type) && (signalSet.has(e.to) || signalSet.has(e.from));
      if (overpass || minorIntoSignal) {
        noStopSt.add(k * 2); noStopSt.add(k * 2 + 1);
        (overpass ? noStopEdges : yieldEdges).push(k);
      }
    });
  }
  graph.edges.forEach((e, k) => {
    if (clusterOf.has(e.from) && clusterOf.get(e.from) === clusterOf.get(e.to)) { internalSt.add(k * 2); internalSt.add(k * 2 + 1); }
  });
  for (const st of noStopSt) internalSt.add(st);
  return { signalNodes, flashingNodes, offset, arriveGroup, clusters, internalSt, noStopSt, noStopEdges, yieldEdges, rows: accepted.map(({ row }) => row), skipped };
}
