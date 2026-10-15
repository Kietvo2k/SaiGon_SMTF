// Batch 31A · bước D — lõi mô phỏng giao thông minh họa (illustrative) trên ROAD_GRAPH_31: thuần JS, không THREE,
// chạy được trong Node để kiểm thử tất định. Phần vẽ ở city-traffic-31.js.
//
// Mô hình (tất định, seed cố định, bước cố định 1/20 s, vẽ nội suy giữa hai bước):
//  - Trạng thái = cạnh có hướng (edge, dir) trong thành phần liên thông mạnh lái được (xét oneway, không quay đầu;
//    nút biên nối vòng qua "siêu nút" tái sinh). Mỗi trạng thái có 1–4 làn; làn 0 sát lề phải, hai chiều đi bên phải.
//  - Mỗi xe: (làn, s dọc làn theo chiều đi, v). Bám xe IDM rút gọn + kẹp cứng khoảng cách (không xuyên nhau), nhìn qua
//    ranh giới cạnh theo lộ trình đã lập 3 làn tới. Xe máy lệch ngang cố định nhỏ trong làn (chen làn có giới hạn).
//  - Nút có ≥ 2 làn đổ vào: vạch dừng cách nút Rz; vào vùng nút phải giữ "khóa chuyển động" tương thích với xe đang
//    trong nút (cùng làn vào; hoặc cùng đi thẳng song song/đối diện, khác làn ra). Nút trục chính có chu kỳ đèn giả lập;
//    nút còn lại nhường theo cấp đường + thời gian chờ (chờ lâu thì được ưu tiên). Bộ phá kẹt: dừng > 75 s → tái sinh.
//  - Ra nút biên → tái sinh ở làn xuất phát từ nút biên khác (chọn theo rng của xe), có cờ gen.
// Hiệu năng: mô phỏng 1D rẻ cho mọi xe (giữ tất định, không phụ thuộc camera); chỉ xe trên cạnh nằm trong frustum
// và bán kính quanh camera mới tính pose + ghi ma trận (tự cull, 3 InstancedMesh theo loại xe).
export const TRAFFIC_31_VERSION = 'traffic-31D';
export const SEED = 31031;
export const STEP = 1 / 10;   // s, bước cố định 10 Hz (vẽ nội suy giữa hai bước)
export const MAX_STEPS_PER_FRAME = 5;
const POOL_TARGET = 3600;
const PN = 4, LK = 5;   // PN: số làn lập sẵn lộ trình = số nút tối đa xin khóa một lượt (cụm nút kề nhau); LK: chỗ giữ khóa (thêm 1 cho nút vừa qua chưa nhả)

const HARD_GAP = .55;          // m, khe hở cứng tối thiểu đầu xe sau – đuôi xe trước (QA đòi ≥ 0,3)
const PATIENCE_S = 12;         // s dừng liên tục trước khi xe bỏ quy tắc chừa đủ chỗ thoát hộp nút
const REL_F = .6;              // đuôi xe qua REL_F·Rz sau nút thì nhả khóa (trước đây cả Rz: giữ khóa ~5,3 s/xe, giao lộ bão hòa dù mật độ thấp)
const PRED_S = 1;              // s: đầu làn ra tính theo vị trí dự báo (xe đang chạy sẽ rời trước khi xe chờ vào tới nơi)
const RELOCATE_M = 60, RELOCATE_STEP = 2;   // m: tầm tìm chỗ trống quanh vị trí cũ khi kích hoạt lại
const BREAKER_S = 50;          // s, dừng liên tục quá ngưỡng → tái sinh (bộ phá kẹt)
const LANE_W_MIN = 2.7, LANE_W_MAX = 3.6, LANE_W_SQUEEZE = 2.6;
const DRIVE_RANK = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1, living_street: 1, road: 1 };
const SPEED_BY_RANK = [0, 5.5, 8, 9.5, 11, 13.5];             // m/s
const DENSITY_BY_RANK = [0, 2.5, 9, 16, 24, 26];              // xe / km làn (trước hệ số trung tâm và chuẩn hóa pool)
export const LIGHT_FACTOR = { day: .85, golden: 1, night: .5 };       // giờ vàng = cao điểm chiều; đêm thưa
const SIGNAL_CLUSTER_M = 80;                                   // m: đèn gần hơn ngưỡng này chung pha
const SIGNAL_CYCLE = 44;                                       // s: xanh nhóm 0 22 s, đỏ chung 3 s, xanh nhóm 1 16 s, đỏ chung 3 s

export const TRAFFIC_KINDS = [
  { name: 'motorbike', length: 1.9, width: .7, height: 1.62, s0: 1.0, T: .8, a: 2.6, b: 3.2 },
  { name: 'car', length: 4.5, width: 1.8, height: 1.48, s0: 1.6, T: 1.1, a: 2.0, b: 3.0 },
  { name: 'bus', length: 12, width: 2.5, height: 3.2, s0: 2.2, T: 1.4, a: 1.2, b: 2.6 },
  { name: 'truck', length: 7.4, width: 2.3, height: 3.05, s0: 2.0, T: 1.3, a: 1.3, b: 2.7 }
];
const HEAVY = 2;                                               // kind ≥ HEAVY (buýt, tải): chỉ chạy đường cấp ≥ 2, tránh rẽ vào hẻm
const MAX_LEN = Math.max(...TRAFFIC_KINDS.map(k => k.length));

// ---------------------------------------------------------------- tiện ích số
const profileAt = (p, s) => {
  if (s <= p[0]) return p[1];
  const n = p.length / 2; if (s >= p[(n - 1) * 2]) return p[(n - 1) * 2 + 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m * 2] <= s) lo = m; else hi = m; }
  const t = (s - p[lo * 2]) / Math.max(1e-9, p[hi * 2] - p[lo * 2]); return p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t;
};
export const hashU32 = n => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------------------------------------------------------------- dựng mạng làn (thuần dữ liệu, không THREE)
export function buildTrafficNetwork31({ graph: G, roads, widthOf, drawn, signalPlan = null }) {
  const nodeIndex = new Map(); G.nodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const E = G.edges, NE = E.length, NN = G.nodes.length;
  const rankOf = e => { const t = String(G.roads[E[e].road].type || '').replace(/_link$/, ''); return DRIVE_RANK[t] || 0; };
  const isLink = e => /_link$/.test(G.roads[E[e].road].type || '');
  const drivable = new Uint8Array(NE);
  for (let e = 0; e < NE; e++) {
    const ed = E[e]; if (ed.from === ed.to || ed.c.length < 4 || !(ed.length > .5)) continue;
    if (!rankOf(e) || !drawn(ed.road) || roads[ed.road]?.tunnel) continue;
    drivable[e] = 1;
  }
  // Hướng đi (rad, atan2(dz, dx)) ở đầu/cuối cạnh theo chiều vẽ.
  const headAt = (e, atEnd) => { const c = E[e].c, n = c.length / 2; return atEnd ? Math.atan2(c[n * 2 - 1] - c[n * 2 - 3], c[n * 2 - 2] - c[n * 2 - 4]) : Math.atan2(c[3] - c[1], c[2] - c[0]); };
  // Trạng thái st = e*2 + (dir>0 ? 0 : 1).
  const allowed = (e, d) => drivable[e] && (E[e].oneway === 'yes' ? d > 0 : E[e].oneway === '-1' ? d < 0 : true);
  const stFrom = st => { const e = st >> 1; return nodeIndex.get(st & 1 ? E[e].to : E[e].from); };
  const stTo = st => { const e = st >> 1; return nodeIndex.get(st & 1 ? E[e].from : E[e].to); };
  const arriveHead = st => { const e = st >> 1; return st & 1 ? headAt(e, false) + Math.PI : headAt(e, true); };
  const departHead = st => { const e = st >> 1; return st & 1 ? headAt(e, true) + Math.PI : headAt(e, false); };
  const boundary = n => G.nodes[n].kind === 'boundary';
  const succRaw = st => {
    const e = st >> 1, n = stTo(st), out = [];
    if (n === undefined || boundary(n)) return out;
    for (const [e2, end] of G.nodes[n].adj) { if (e2 === e) continue; const d2 = end === 0 ? 1 : -1; if (allowed(e2, d2)) out.push(e2 * 2 + (d2 > 0 ? 0 : 1)); }
    return out;
  };
  // SCC (Tarjan lặp) trên trạng thái + siêu nút SUPER: trạng thái tới nút biên → SUPER → trạng thái rời nút biên.
  const NS = NE * 2, SUPER = NS, valid = new Uint8Array(NS);
  for (let st = 0; st < NS; st++) valid[st] = allowed(st >> 1, st & 1 ? -1 : 1) && stFrom(st) !== undefined && stTo(st) !== undefined ? 1 : 0;
  const succ = new Array(NS + 1);
  const superOut = [];
  for (let st = 0; st < NS; st++) if (valid[st]) { const t = stTo(st); succ[st] = boundary(t) ? [SUPER] : succRaw(st).filter(x => valid[x]); if (boundary(stFrom(st))) superOut.push(st); }
  succ[SUPER] = superOut;
  const index = new Int32Array(NS + 1).fill(-1), low = new Int32Array(NS + 1), onStack = new Uint8Array(NS + 1), comp = new Int32Array(NS + 1).fill(-1);
  let counter = 0, compCount = 0; const stack = [], call = [];
  for (let root = 0; root <= NS; root++) {
    if ((root < NS && !valid[root]) || index[root] >= 0) continue;
    call.push([root, 0]); index[root] = low[root] = counter++; stack.push(root); onStack[root] = 1;
    while (call.length) {
      const frame = call[call.length - 1], v = frame[0], list = succ[v];
      if (frame[1] < list.length) {
        const w = list[frame[1]++];
        if (index[w] < 0) { index[w] = low[w] = counter++; stack.push(w); onStack[w] = 1; call.push([w, 0]); }
        else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      } else {
        call.pop(); if (call.length) { const u = call[call.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === index[v]) { let w; do { w = stack.pop(); onStack[w] = 0; comp[w] = compCount; } while (w !== v); compCount++; }
      }
    }
  }
  const keepComp = comp[SUPER], inScc = st => valid[st] && comp[st] === keepComp;
  // Khoảng trống hai bên mỗi cạnh giữ lại (khung chiều vẽ): tới tim cạnh lái được gần nhất song song (|cos| > 0,8),
  // cùng cao độ (±2 m) — đường đôi tách làn (Điện Biên Phủ, Cầu Kiệu, Ba Son) có tim cách nhau ~7,5 m nên mỗi chiều chỉ
  // được dùng nửa khoảng trống; bỏ 1 đoạn gần nút (vùng nút đã có khóa). Không có hàng xóm → Infinity.
  const kept = new Uint8Array(NE); for (let st = 0; st < NS; st++) if (inScc(st)) kept[st >> 1] = 1;
  const yAt = (e, sd) => E[e].profile ? profileAt(E[e].profile, sd) : G.frame.groundY;
  const CELL = 24, segGrid = new Map();
  for (let e = 0; e < NE; e++) if (kept[e]) { const c = E[e].c; for (let k = 0; k < c.length / 2 - 1; k++) { const key = Math.floor((c[k * 2] + c[k * 2 + 2]) / 2 / CELL) * 65536 + Math.floor((c[k * 2 + 1] + c[k * 2 + 3]) / 2 / CELL); let a = segGrid.get(key); if (!a) segGrid.set(key, a = []); a.push(e, k); } }
  const planarTot = new Float32Array(NE).fill(1);
  for (let e = 0; e < NE; e++) if (kept[e]) { const c = E[e].c; let t = 0; for (let k = 0; k < c.length / 2 - 1; k++) t += Math.hypot(c[k * 2 + 2] - c[k * 2], c[k * 2 + 3] - c[k * 2 + 1]); planarTot[e] = Math.max(1e-6, t); }
  const clearR = new Float32Array(NE).fill(Infinity), clearL = new Float32Array(NE).fill(Infinity);
  for (let e = 0; e < NE; e++) {
    if (!kept[e]) continue;
    const c = E[e].c, n = c.length / 2, total = planarTot[e]; let acc = 0;
    const skip = Math.min(total * .3, 14);
    for (let k = 0; k < n - 1; k++) {
      const ax = c[k * 2], az = c[k * 2 + 1], dx = c[k * 2 + 2] - ax, dz = c[k * 2 + 3] - az, Ls = Math.hypot(dx, dz); if (Ls < 1e-6) continue;
      const tx = dx / Ls, tz = dz / Ls, steps = Math.max(1, Math.ceil(Ls / 8));
      for (let q = 0; q <= steps; q++) {
        const along = acc + Ls * q / steps; if (along < skip || along > total - skip) continue;
        const px = ax + dx * q / steps, pz = az + dz * q / steps, py = yAt(e, along * E[e].length / Math.max(1e-6, total));
        const gx0 = Math.floor(px / CELL), gz0 = Math.floor(pz / CELL);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const a = segGrid.get((gx0 + i) * 65536 + gz0 + j); if (!a) continue;
          for (let m = 0; m < a.length; m += 2) {
            const f = a[m]; if (f === e) continue; const cf = E[f].c, kk = a[m + 1];
            const bx = cf[kk * 2], bz = cf[kk * 2 + 1], ex = cf[kk * 2 + 2] - bx, ez = cf[kk * 2 + 3] - bz, Lf = Math.hypot(ex, ez); if (Lf < 1e-6) continue;
            if (Math.abs((ex * tx + ez * tz) / Lf) < .8) continue;
            const t = Math.max(0, Math.min(1, ((px - bx) * ex + (pz - bz) * ez) / (Lf * Lf))), qx = bx + ex * t, qz = bz + ez * t;
            const ox = qx - px, oz = qz - pz, lat = ox * -tz + oz * tx, lon = ox * tx + oz * tz;
            if (Math.abs(lon) > 3 || Math.abs(lat) > 30) continue;
            let sf = 0; for (let r = 0; r < kk; r++) sf += Math.hypot(cf[r * 2 + 2] - cf[r * 2], cf[r * 2 + 3] - cf[r * 2 + 1]); sf += Lf * t;
            if (Math.abs(yAt(f, sf * E[f].length / planarTot[f]) - py) > 2) continue;
            if (lat > 0) clearR[e] = Math.min(clearR[e], lat); else clearL[e] = Math.min(clearL[e], -lat);
          }
        }
      }
      acc += Ls;
    }
  }
  // Làn theo trạng thái: làn 0 sát lề phải; offset dương = bên phải chiều đi.
  const lanesOfSt = new Int32Array(NS).fill(-1), laneCountOfSt = new Uint8Array(NS);
  const L = { edge: [], dir: [], from: [], to: [], length: [], offset: [], k: [], n: [], width: [], rank: [], speed: [], st: [] };
  let statesKept = 0, squeezed = 0; const edgesKept = new Set();
  for (let st = 0; st < NS; st++) {
    if (!inScc(st)) continue;
    const e = st >> 1, ed = E[e], d = st & 1 ? -1 : 1, two = ed.oneway === 'no', W = widthOf(ed.road);
    const lanesTag = Math.max(1, Number(ed.lanes) || 1), n0 = Math.min(4, two ? Math.max(1, Math.floor(lanesTag / 2)) : lanesTag);
    const w0 = Math.min(LANE_W_MAX, Math.max(LANE_W_MIN, W / (two ? n0 * 2 : n0)));
    const hr = (d > 0 ? clearR[e] : clearL[e]) / 2 - .1, hl = (d > 0 ? clearL[e] : clearR[e]) / 2 - .1;   // nửa khoảng trống phải/trái theo chiều đi
    let lo, hi;
    if (two) { lo = 0; hi = Math.min(n0 * w0, hr); } else { lo = -Math.min(n0 * w0 / 2, hl); hi = Math.min(n0 * w0 / 2, hr); }
    const avail = hi - lo, n = Math.max(1, Math.min(n0, Math.floor(avail / LANE_W_SQUEEZE))), w = Math.max(LANE_W_SQUEEZE, Math.min(w0, avail / n));
    if (n < n0 || w < w0 - 1e-6) squeezed++;
    const centre = two ? n * w / 2 : avail >= n * w ? (lo + hi) / 2 : hi - n * w / 2;
    const rank = rankOf(e), speed = SPEED_BY_RANK[rank] * (isLink(e) ? .8 : 1);
    lanesOfSt[st] = L.edge.length; laneCountOfSt[st] = n; statesKept++; edgesKept.add(e);
    for (let k = 0; k < n; k++) {
      L.edge.push(e); L.dir.push(d); L.from.push(stFrom(st)); L.to.push(stTo(st)); L.length.push(ed.length);
      L.offset.push(centre + ((n - 1) / 2 - k) * w); L.k.push(k); L.n.push(n); L.width.push(w); L.rank.push(rank); L.speed.push(speed); L.st.push(st);
    }
  }
  const NL = L.edge.length;
  const lanes = {
    edge: Int32Array.from(L.edge), dir: Int8Array.from(L.dir), from: Int32Array.from(L.from), to: Int32Array.from(L.to),
    length: Float32Array.from(L.length), offset: Float32Array.from(L.offset), k: Uint8Array.from(L.k), n: Uint8Array.from(L.n),
    width: Float32Array.from(L.width), rank: Uint8Array.from(L.rank), speed: Float32Array.from(L.speed), st: Int32Array.from(L.st)
  };
  // "Co ngắn" phía trong khúc cua giữa cạnh: lệch |lat| vào phía trong đỉnh gấp góc θ rút ngắn quãng thật ≈ 2·|lat|·tan(θ/2)
  // → xe cùng làn phải giữ thêm chừng đó để thân xe không chồng nhau trên đường lệch (tối đa 6 m).
  const pinch = new Float32Array(lanes.edge.length);
  for (let l = 0; l < lanes.edge.length; l++) {
    const c = E[lanes.edge[l]].c, n = c.length / 2, latDraw = lanes.offset[l] * lanes.dir[l]; let p = 0;
    for (let k = 1; k < n - 1; k++) {
      const ax = c[k * 2] - c[k * 2 - 2], az = c[k * 2 + 1] - c[k * 2 - 1], bx = c[k * 2 + 2] - c[k * 2], bz = c[k * 2 + 3] - c[k * 2 + 1];
      const th = Math.atan2(ax * bz - az * bx, ax * bx + az * bz), inner = Math.sign(th) === Math.sign(latDraw) ? Math.abs(latDraw) + .6 : .6;
      p = Math.max(p, 2 * inner * Math.tan(Math.min(Math.abs(th), 2.1) / 2));
    }
    pinch[l] = Math.min(6, p);
  }
  lanes.pinch = pinch;
  // Kế tiếp theo trạng thái (đã lọc SCC) + góc rẽ (+ phải, − trái) + cùng tên đường.
  const nextSt = new Array(NS);
  for (let st = 0; st < NS; st++) {
    if (lanesOfSt[st] < 0) continue;
    if (boundary(stTo(st))) { nextSt[st] = []; continue; }
    const ah = arriveHead(st), name = G.roads[E[st >> 1].road].name || '';
    nextSt[st] = succRaw(st).filter(x => lanesOfSt[x] >= 0).map(x => ({ st: x, turn: angleDiff(ah, departHead(x)), sameName: !!name && (G.roads[E[x >> 1].road].name || '') === name, rank: rankOf(x >> 1) }));
  }
  // Nút: số làn đổ vào, bán kính vùng nút, đèn.
  const inLanes = new Int32Array(NN), outLanes = new Int32Array(NN), maxHalf = new Float32Array(NN);
  for (let l = 0; l < NL; l++) {
    inLanes[lanes.to[l]]++; outLanes[lanes.from[l]]++; const hw = widthOf(E[lanes.edge[l]].road) / 2;
    for (const n of [lanes.to[l], lanes.from[l]]) maxHalf[n] = Math.max(maxHalf[n], hw);
  }
  const needsLock = new Uint8Array(NN), Rz = new Float32Array(NN), signal = new Uint8Array(NN), signalOffset = new Float32Array(NN);
  const arriveGroup = new Uint8Array(NS);
  let controlledNodes = 0, signals = 0;
  const incomingByNode = new Map();
  for (let st = 0; st < NS; st++) if (lanesOfSt[st] >= 0) { const n = stTo(st); let l = incomingByNode.get(n); if (!l) incomingByNode.set(n, l = []); l.push(st); }
  // Bề ngang chiếm dụng mỗi cạnh (|offset| + nửa làn lớn nhất, cả hai chiều): hai cạnh gặp nhau tại nút dưới góc φ nhỏ
  // chỉ tách hẳn sau r ≥ (ext₁ + ext₂ + 0,4)/sin φ → vùng nút (vạch dừng) phải lùi tới đó, tối đa 32 m.
  const ext = new Float32Array(NE);
  for (let l = 0; l < NL; l++) { const e = lanes.edge[l]; ext[e] = Math.max(ext[e], Math.abs(lanes.offset[l]) + lanes.width[l] / 2); }
  const convergeR = new Float32Array(NN);
  for (let n = 0; n < NN; n++) {
    const adj = G.nodes[n].adj.filter(([e]) => ext[e] > 0); if (adj.length < 2) continue;
    for (let a = 0; a < adj.length; a++) for (let b = a + 1; b < adj.length; b++) {
      if (adj[a][0] === adj[b][0]) continue;
      const phi = Math.abs(angleDiff(adj[a][2] * Math.PI / 180, adj[b][2] * Math.PI / 180));
      if (phi >= Math.PI / 2) continue;
      convergeR[n] = Math.max(convergeR[n], Math.min(32, (ext[adj[a][0]] + ext[adj[b][0]] + .4) / Math.max(.05, Math.sin(phi))));
    }
  }
  for (let n = 0; n < NN; n++) {
    Rz[n] = Math.min(32, Math.max(6, maxHalf[n] + 1.5, convergeR[n]));
    if ((inLanes[n] >= 2 || outLanes[n] >= 2) && !boundary(n)) { needsLock[n] = 1; controlledNodes++; }   // nhập hoặc tách: cần khóa
  }
  for (const [n, sts] of incomingByNode) {
    if (!needsLock[n] || sts.length < 3) continue;
    const major = sts.filter(st => rankOf(st >> 1) >= 3);
    if (major.length < 3) continue;
    signal[n] = 1; signals++; signalOffset[n] = (hashU32(n + SEED) / 4294967296) * SIGNAL_CYCLE;
    let axisSt = sts[0]; for (const st of sts) if (rankOf(st >> 1) > rankOf(axisSt >> 1)) axisSt = st;
    const axis = arriveHead(axisSt);
    for (const st of sts) arriveGroup[st] = Math.abs(Math.cos(arriveHead(st) - axis)) > .5 ? 0 : 1;
  }
  // Đèn các nút gần nhau (< 80 m) cùng một pha: xe xin khóa chuỗi nút kề nhau (liên kết ngắn) cần xanh ở tất cả nút cùng lúc, nếu lệch pha ngẫu nhiên
  // thì có xe chờ cả chục giây dù cả cụm đã xanh (một nguyên nhân bộ phá kẹt).
  { const sg = []; for (let n = 0; n < NN; n++) if (signal[n]) sg.push(n);
    const root = new Map(sg.map(n => [n, n])), find = n => { while (root.get(n) !== n) n = root.get(n); return n; };
    for (let a = 0; a < sg.length; a++) for (let b = a + 1; b < sg.length; b++) if (Math.hypot(G.nodes[sg[a]].x - G.nodes[sg[b]].x, G.nodes[sg[a]].z - G.nodes[sg[b]].z) < SIGNAL_CLUSTER_M) { const ra = find(sg[a]), rb = find(sg[b]); if (ra !== rb) root.set(Math.max(ra, rb), Math.min(ra, rb)); }
    for (const n of sg) signalOffset[n] = signalOffset[find(n)]; }
  // Kế hoạch đèn M1 (tùy chọn): ghi đè signal/signalOffset/arriveGroup cho nút Hàng Xanh.
  let net_out_signalPlan = null;
  if (signalPlan) {
    const stTo = st => { const e = st >> 1; return nodeIndex.get(st & 1 ? G.edges[e].from : G.edges[e].to); };
    for (const n of signalPlan.signalNodes) {
      if (!signal[n]) signals++;   // đếm đúng số nút có đèn sau khi kế hoạch bật thêm
      signal[n] = 1;
      signalOffset[n] = signalPlan.offset.get(n) ?? 0;
    }
    for (let st = 0; st < arriveGroup.length; st++) {
      const n = stTo(st);
      if (n !== undefined && signalPlan.signalNodes.includes(n)) arriveGroup[st] = signalPlan.arriveGroup[st];
    }
    net_out_signalPlan = signalPlan;
  }
  // Làn xuất phát từ nút biên (điểm tái sinh), sắp theo chỉ số.
  const spawnLanes = []; for (let l = 0; l < NL; l++) if (boundary(lanes.from[l])) spawnLanes.push(l);
  // Hình học cạnh: polyline phẳng, độ dài cộng dồn, pháp tuyến đỉnh (trung bình hai đoạn kề, hướng phải của chiều vẽ).
  const geoOff = new Int32Array(NE + 1); let total = 0;
  for (let e = 0; e < NE; e++) { geoOff[e] = total; if (edgesKept.has(e)) total += E[e].c.length / 2; }
  geoOff[NE] = total;
  const gx = new Float32Array(total), gz = new Float32Array(total), gs = new Float32Array(total), nx = new Float32Array(total), nz = new Float32Array(total), planar = new Float32Array(NE);
  for (const e of edgesKept) {
    const c = E[e].c, n = c.length / 2, o = geoOff[e]; let acc = 0;
    for (let k = 0; k < n; k++) { gx[o + k] = c[k * 2]; gz[o + k] = c[k * 2 + 1]; if (k) acc += Math.hypot(c[k * 2] - c[k * 2 - 2], c[k * 2 + 1] - c[k * 2 - 1]); gs[o + k] = acc; }
    planar[e] = acc;
    for (let k = 0; k < n; k++) {
      let ax = 0, az = 0;
      for (const j of [k - 1, k]) { if (j < 0 || j >= n - 1) continue; const dx = c[j * 2 + 2] - c[j * 2], dz = c[j * 2 + 3] - c[j * 2 + 1], l = Math.hypot(dx, dz) || 1; ax += -dz / l; az += dx / l; }
      const l = Math.hypot(ax, az) || 1; nx[o + k] = ax / l; nz[o + k] = az / l;
    }
  }
  const bridgeEdge = new Uint8Array(NE), signatureEdge = new Uint8Array(NE);
  for (const e of edgesKept) { bridgeEdge[e] = E[e].elevationClass && E[e].elevationClass !== 'ground' && E[e].elevationClass !== 'skip' ? 1 : 0; signatureEdge[e] = G.roads[E[e].road].signature ? 1 : 0; }
  // Cầu bán kính bao quanh từng cạnh (cull).
  const sphere = new Float32Array(NE * 4);
  for (const e of edgesKept) {
    const o = geoOff[e], n = E[e].c.length / 2; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = G.frame.groundY;
    for (let k = 0; k < n; k++) { minX = Math.min(minX, gx[o + k]); maxX = Math.max(maxX, gx[o + k]); minZ = Math.min(minZ, gz[o + k]); maxZ = Math.max(maxZ, gz[o + k]); }
    if (E[e].profile) for (let k = 1; k < E[e].profile.length; k += 2) maxY = Math.max(maxY, E[e].profile[k]);
    sphere[e * 4] = (minX + maxX) / 2; sphere[e * 4 + 1] = (G.frame.groundY + maxY) / 2 + 1.5; sphere[e * 4 + 2] = (minZ + maxZ) / 2;
    sphere[e * 4 + 3] = Math.hypot(maxX - minX, maxZ - minZ, maxY - G.frame.groundY) / 2 + 16;
  }
  // Kiểm tĩnh: mọi làn khớp tag oneway.
  let onewayLaneViolations = 0;
  for (let l = 0; l < NL; l++) { const ow = E[lanes.edge[l]].oneway; if ((ow === 'yes' && lanes.dir[l] !== 1) || (ow === '-1' && lanes.dir[l] !== -1)) onewayLaneViolations++; }
  const net = {
    G, E, NE, NN, NS, NL, lanes, lanesOfSt, laneCountOfSt, nextSt, needsLock, Rz, signal, signalOffset, arriveGroup, arriveHead, spawnLanes, signalPlan: net_out_signalPlan,
    geo: { off: geoOff, x: gx, z: gz, s: gs, nx, nz, planar }, bridgeEdge, signatureEdge, sphere, rankOf,
    stats: { drivableEdges: edgesKept.size, states: statesKept, lanes: NL, components: compCount, controlledNodes, signals, spawnLanes: spawnLanes.length, onewayLaneViolations, squeezedStates: squeezed }
  };
  net.cross = buildCrossZones31(net);
  net.stats.crossZones = net.cross.zones; net.stats.crossPairs = net.cross.pairs.size;
  return net;
}

// Vùng giao cắt không có nút chung: hai làn khác cạnh, không chung nút (hoặc chung nút nhưng xa ngoài vùng khóa) mà tim làn
// đi gần nhau < CROSS_R ở cùng cao độ (nhánh nhập cầu vắt qua mép cạnh khác, đầu dải phân cách…). Khóa nút không thấy các cặp này,
// nên mỗi vùng là một "token": xe chỉ vào đoạn [a, b] của làn mình khi không có xe ở làn xung đột đang giữ cùng vùng.
const CROSS_R = 3.4, CROSS_STEP = 1.5;
function buildCrossZones31(net) {
  const { lanes, NL, Rz } = net, geo = createTrafficGeometry31(net, { jit: [0] }), p = {};
  const xs = [], zs = [], ys = [], ls = [], ss = [], grid = new Map(), key = (x, z) => Math.floor(x / 4) * 1048576 + Math.floor(z / 4);
  for (let l = 0; l < NL; l++) {
    const L = lanes.length[l], n = Math.max(1, Math.ceil(L / CROSS_STEP));
    for (let k = 0; k <= n; k++) {
      const sl = L * k / n; geo.lanePoint(l, sl, lanes.offset[l], p);
      const id = xs.length; xs.push(p.x); zs.push(p.z); ys.push(geo.laneY(l, sl)); ls.push(l); ss.push(sl);
      const g = key(p.x, p.z); let a = grid.get(g); if (!a) grid.set(g, a = []); a.push(id);
    }
  }
  const nearNode = (l, sl, node) => (lanes.to[l] === node ? lanes.length[l] - sl : sl) < Rz[node] + 6;
  // Hai làn nối tiếp nhau (trực tiếp hoặc qua một làn ngắn < 25 m) do bám xe xử lý, không phải giao cắt.
  const follows = (u, w) => {
    const su = lanes.st[u], sw = lanes.st[w], nu = net.nextSt[su] || [];
    for (const c of nu) { if (c.st === sw) return true; const lm = net.lanesOfSt[c.st]; if (lm >= 0 && lanes.length[lm] < 25 && (net.nextSt[c.st] || []).some(x => x.st === sw)) return true; }
    return false;
  };
  const shared = (l1, s1, l2, s2) => {
    if (follows(l1, l2) || follows(l2, l1)) return true;
    for (const n of [lanes.from[l1], lanes.to[l1]]) if ((n === lanes.from[l2] || n === lanes.to[l2]) && nearNode(l1, s1, n) && nearNode(l2, s2, n)) return true;
    return false;
  };
  const hits = [];   // [id1, id2]
  for (let id = 0; id < xs.length; id++) {
    const gx = Math.floor(xs[id] / 4), gz = Math.floor(zs[id] / 4), l1 = ls[id];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cell = grid.get((gx + a) * 1048576 + gz + b); if (!cell) continue;
      for (const q of cell) {
        const l2 = ls[q]; if (l2 <= l1 || lanes.edge[l1] === lanes.edge[l2]) continue;
        if (Math.abs(ys[id] - ys[q]) > 1.5 || Math.hypot(xs[id] - xs[q], zs[id] - zs[q]) >= CROSS_R) continue;
        if (shared(l1, ss[id], l2, ss[q])) continue;
        hits.push(id, q);
      }
    }
  }
  // Gom điểm xung đột thành vùng (union-find theo khoảng cách 10 m).
  const parent = new Int32Array(hits.length / 2).map((_, k) => k), find = k => { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
  const hg = new Map();
  for (let h = 0; h < hits.length / 2; h++) {
    const id = hits[h * 2], gx = Math.floor(xs[id] / 10), gz = Math.floor(zs[id] / 10);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of hg.get((gx + a) * 1048576 + gz + b) || []) {
      const j = hits[o * 2]; if (Math.hypot(xs[id] - xs[j], zs[id] - zs[j]) < 10 && Math.abs(ys[id] - ys[j]) < 1.5) parent[find(h)] = find(o);
    }
    const g = gx * 1048576 + gz; let arr = hg.get(g); if (!arr) hg.set(g, arr = []); arr.push(h);
  }
  const zoneOf = new Map(), spans = new Map(), pairs = new Set();   // spans: "zone:lane" → [a, b]
  for (let h = 0; h < hits.length / 2; h++) {
    const r = find(h); if (!zoneOf.has(r)) zoneOf.set(r, zoneOf.size); const z = zoneOf.get(r);
    for (const id of [hits[h * 2], hits[h * 2 + 1]]) {
      const k = z + ':' + ls[id], sp = spans.get(k);
      if (!sp) spans.set(k, [z, ls[id], ss[id], ss[id]]); else { sp[2] = Math.min(sp[2], ss[id]); sp[3] = Math.max(sp[3], ss[id]); }
    }
    pairs.add(ls[hits[h * 2]] * NL + ls[hits[h * 2 + 1]]);
  }
  const byLane = [...spans.values()].sort((u, w) => u[1] - w[1] || u[2] - w[2]);
  const off = new Int32Array(NL + 1), zone = new Int32Array(byLane.length), a = new Float32Array(byLane.length), b = new Float32Array(byLane.length);
  byLane.forEach(([z, l, s0, s1], k) => { off[l + 1]++; zone[k] = z; a[k] = Math.max(0, s0 - CROSS_STEP); b[k] = Math.min(lanes.length[l], s1 + CROSS_STEP); });
  for (let l = 0; l < NL; l++) off[l + 1] += off[l];
  return { zones: zoneOf.size, off, zone, a, b, pairs, conflict: (l1, l2) => pairs.has(Math.min(l1, l2) * NL + Math.max(l1, l2)) };
}

// ---------------------------------------------------------------- mô phỏng (thuần JS, tất định)
export function createTrafficSim31(net, { centre = [0, 0], poolTarget = POOL_TARGET, signalPlan = null, controller: controller0 = null, breakerS = BREAKER_S, seed = SEED, demand = null, routeBias = null } = {}) {
  let controller = controller0;
  // M4b1: routeBias(edge, carIndex) → hệ số 0..1 nhân vào trọng số rẽ vào cạnh `edge` (không truyền / trả về ≥ 1 = y nguyên;
  // không rút thêm số ngẫu nhiên nên hash cổ điển giữ nguyên).
  const routeBiasFn = typeof routeBias === 'function' ? routeBias : null;
  const { lanes, NL, nextSt, lanesOfSt, laneCountOfSt, needsLock, Rz, signal, signalOffset, arriveGroup, arriveHead, spawnLanes, E, G } = net;
  const KL = TRAFFIC_KINDS.map(k => k.length), KW = TRAFFIC_KINDS.map(k => k.width);
  // ---- Kịch bản nhu cầu (tùy chọn, mặc định null = hành vi y nguyên): tăng trọng số sinh xe
  // trên làn gần tâm (`spawnBias`) và thiên hướng rẽ về tâm (`turnBias`).
  const demandCfg = demand ? {
    cx: demand.center?.[0] ?? 0, cz: demand.center?.[1] ?? 0,
    r2: Math.max(0, Number(demand.radius_m) || 0) ** 2,
    turnBias: Math.max(0, Number(demand.turnBias) || 0),
    spawnBias: Math.max(1, Number(demand.spawnBias) || 1),
    poolScale: Math.max(1, Number(demand.poolScale) || 1)
  } : null;
  const demW = new Float32Array(NL).fill(1);
  if (demandCfg) {
    const sp = net.sphere;
    for (let l = 0; l < NL; l++) {
      const e = lanes.edge[l], dx = sp[e * 4] - demandCfg.cx, dz = sp[e * 4 + 2] - demandCfg.cz;
      if (dx * dx + dz * dz <= demandCfg.r2) demW[l] = demandCfg.spawnBias;
    }
    poolTarget *= demandCfg.poolScale;
  }
  // ---- Bố trí pool ban đầu (tất định): xe/km làn theo cấp × hệ số trung tâm, rải đều dọc làn ngoài vùng nút.
  const centrality = l => { const s = net.sphere, e = lanes.edge[l]; const d = Math.hypot(s[e * 4] - centre[0], s[e * 4 + 2] - centre[1]); return .35 + .65 * Math.max(0, 1 - d / 4200); };
  let raw = 0; const expect = new Float32Array(NL);
  for (let l = 0; l < NL; l++) { expect[l] = DENSITY_BY_RANK[lanes.rank[l]] * lanes.length[l] / 1000 * centrality(l) * demW[l]; raw += expect[l]; }
  const scale = poolTarget / Math.max(1, raw);
  const spawnPlan = [];   // [lane, s, kind, rngSeed]
  let carry = 0, rngSpawn = seed >>> 0;
  const nextRng = () => { rngSpawn ^= rngSpawn << 13; rngSpawn >>>= 0; rngSpawn ^= rngSpawn >>> 17; rngSpawn ^= rngSpawn << 5; rngSpawn >>>= 0; return rngSpawn / 4294967296; };
  const zoneStart = (l, len) => needsLock[lanes.from[l]] ? Rz[lanes.from[l]] + len / 2 + .6 : len / 2 + .6;
  const zoneEnd = (l, len) => lanes.length[l] - (needsLock[lanes.to[l]] ? Rz[lanes.to[l]] : 0) - len / 2 - .6;
  for (let l = 0; l < NL; l++) {
    carry += expect[l] * scale; let n = Math.floor(carry); if (!n) continue;
    const kinds = []; for (let k = 0; k < n; k++) { const r = nextRng(); kinds.push(lanes.rank[l] >= 3 && r < .05 ? 2 : lanes.rank[l] >= 2 && r < .085 ? 3 : r < .23 ? 1 : 0); }
    const a = zoneStart(l, MAX_LEN), b = zoneEnd(l, MAX_LEN), span = b - a;
    if (span <= 0) continue;
    const step = span / n; if (step < MAX_LEN + 1.5) { n = Math.max(0, Math.floor(span / (MAX_LEN + 1.5))); }
    if (!n) continue;
    carry -= n;
    for (let k = 0; k < n; k++) spawnPlan.push([l, a + (k + .5) * span / n, kinds[k], hashU32(spawnPlan.length * 7919 + seed)]);
  }
  const N = spawnPlan.length;
  // ---- Trạng thái xe.
  const lane = new Int32Array(N), s = new Float64Array(N), v = new Float32Array(N), lat = new Float32Array(N), jit = new Float32Array(N);
  const gen = new Uint32Array(N), active = new Uint8Array(N), wanted = new Uint8Array(N), selRank = new Float32Array(N), pending = new Uint8Array(N), kind = new Uint8Array(N), len = new Float32Array(N), wid = new Float32Array(N);
  const vf = new Float32Array(N), rng = new Uint32Array(N), path = new Int32Array(N * PN), next = new Int32Array(N), prevLane = new Int32Array(N);
  const pLane = new Int32Array(N), pS = new Float64Array(N), pGen = new Uint32Array(N), stopT = new Float32Array(N), lastStep = new Int32Array(N), waiting = new Uint8Array(N);
  const lastStepCrossed = new Int32Array(N).fill(-1);
  const lastS = new Float64Array(N).fill(-1);
  const lockNode = new Int32Array(N * LK), lockIn = new Int32Array(N * LK), lockOut = new Int32Array(N * LK), lockRemain = new Float32Array(N * LK);
  const rand = i => { let x = rng[i]; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; rng[i] = x; return x / 4294967296; };
  const laneCars = new Array(NL); const laneActive = new Uint8Array(NL); let activeLanes = [];
  // Chỉ mục làn theo nút (dựng một lần) cho buildQueues: làn vào (lanes.to) và làn ra (lanes.from).
  const lanesIntoNode = new Map(), lanesOutOfNode = new Map();
  for (let l = 0; l < NL; l++) {
    let a = lanesIntoNode.get(lanes.to[l]); if (!a) lanesIntoNode.set(lanes.to[l], a = []); a.push(l);
    let b = lanesOutOfNode.get(lanes.from[l]); if (!b) lanesOutOfNode.set(lanes.from[l], b = []); b.push(l);
  }
  // Khoảng cách thật (theo pose) khi xe dẫn đang cắt góc trong vùng nút: quãng s không phản ánh đúng hình học Bezier rẽ gắt.
  const geoSim = createTrafficGeometry31(net, { jit, len }), PA = {}, PB = {};
  const geoGap = (i, o) => {
    geoSim.poseAt(i, lane[i], s[i], next[i], prevLane[i], PA); geoSim.poseAt(o, lane[o], s[o], next[o], prevLane[o], PB);
    const dx = PB.x - PA.x, dz = PB.z - PA.z; if (dx * PA.tx + dz * PA.tz <= 0) return Infinity;
    return Math.hypot(dx, dz) - (len[i] + len[o]) / 2 - .6;
  };
  // node → [{car, inL, outL, straight}]: mảng theo chỉ số nút (nhanh hơn Map trong vòng xe), cùng API get/set/delete/clear/values.
  const holders = (() => {
    const nn = G.nodes.length, a = new Array(nn).fill(undefined), seen = new Uint8Array(nn), used = [];
    return {
      get: n => a[n],
      set(n, v) { if (!seen[n]) { seen[n] = 1; used.push(n); } a[n] = v; },
      delete(n) { a[n] = undefined; },
      clear() { for (const n of used) { a[n] = undefined; seen[n] = 0; } used.length = 0; },
      *values() { for (const n of used) if (a[n]) yield a[n]; },
      *entries() { for (const n of used) if (a[n]) yield [n, a[n]]; }
    };
  })();
  let reqPrev = new Map(), reqCur = new Map();
  // Số khóa đang giữ theo làn vào (lọc nhanh trước khi quét holders của nút cuối làn).
  const inHold = new Int32Array(NL);
  // Token vùng giao cắt không nút (net.cross): zoneHold[z] = Map(làn → số xe giữ); mỗi xe giữ tối đa 2 token, nhả khi đuôi qua b.
  const CZ = net.cross, zoneHold = new Map(), zTok = new Int32Array(N * 2).fill(-1), zLane = new Int32Array(N * 2), zRem = new Float32Array(N * 2);
  const counters = { t: 0, step: 0, edgeTransitions: 0, teleports: 0, onewayViolations: 0, gapViolations: 0, respawns: 0, breakerRespawns: 0, waitsTotal: 0, maxStopS: 0, perSecond: new Int32Array(32), lastSecond: 0, pendingFails: 0 };
  let fraction = 1, lightFactor = 1;
  // ---- Hạn chế làn (M5a, mặc định trung tính: hệ số 1, không chắn, không đóng → hành vi cũ không đổi):
  // laneVmul[l] nhân tốc độ mong muốn của làn; laneBlockS[l] = vị trí (m) mép sau xe hỏng đứng yên trên làn (∞ = không chắn);
  // laneClosed[l] = 1 → lộ trình không chọn làn này (xe đang trên làn vẫn đi hết).
  const laneVmul = new Float32Array(NL).fill(1), laneBlockS = new Float64Array(NL).fill(Infinity), laneClosed = new Uint8Array(NL);
  let closedCount = 0;
  // ---- Khu mô phỏng (bước H): region = null → toàn thành phố; {id, poly[x0,z0,x1,z1…]} → chỉ xe trên cạnh nằm hẳn trong đa giác.
  // insideLane: làn thuộc cạnh mà mọi đỉnh nằm trong khu; spawnList: làn điểm tái sinh (nút biên thật hoặc nút trong khu kề nút ngoài khu);
  // elig: xe được tính vào khu (đặt theo vị trí lúc setRegion; xe đang chờ chỗ giữ nguyên, xe đặt/tái sinh trong khu luôn hợp lệ).
  let region = null, spawnList = spawnLanes;
  const insideLane = new Uint8Array(NL).fill(1), elig = new Uint8Array(N).fill(1);

  const laneList = l => { let a = laneCars[l]; if (!a) { a = laneCars[l] = []; } if (!laneActive[l]) { laneActive[l] = 1; activeLanes.push(l); } return a; };
  const insertSorted = (l, i) => { const a = laneList(l); let k = 0; while (k < a.length && s[a[k]] < s[i]) k++; a.splice(k, 0, i); };
  const removeFrom = (l, i) => { const a = laneCars[l]; if (!a) return; const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); };
  // Đệm khi hai xe ở hai làn nối nhau qua góc nút (đường Bezier cắt góc ngắn hơn quãng s).
  // Đệm qua góc nút: Bezier cắt góc ngắn hơn quãng s; phía trong góc rẽ θ ngắn thêm ≈ 2·(|lat|+0,75)·tan(θ/2).
  const pinchMemo = new Map();
  const turnPinch = (a, b) => {
    if (a < 0 || b < 0) return 0;
    const key = a * NL + b, m = pinchMemo.get(key); if (m !== undefined) return m;
    const v = turnPinchRaw(a, b); pinchMemo.set(key, v); return v;
  };
  const turnPinchRaw = (a, b) => {
    const c = nextSt[lanes.st[a]]?.find(x => x.st === lanes.st[b]); if (!c) return 0;
    const inner = Math.sign(c.turn) === Math.sign(lanes.offset[a]) ? Math.abs(lanes.offset[a]) : 0;
    return Math.min(8, 2 * (inner + .75) * Math.tan(Math.min(Math.abs(c.turn), 2.1) / 2));
  };
  const cornerOf = o => { const l = lane[o]; return s[o] > lanes.length[l] - Rz[lanes.to[l]] ? turnPinch(l, next[o]) : turnPinch(prevLane[o], l); };
  const cornerPad = (i, j, a = -1, b = -1) => .3 * (len[i] + len[j]) / 2 + .4 + Math.max(cornerOf(j), cornerOf(i), turnPinch(a, b));
  const inCorner = o => { const l = lane[o]; return s[o] > lanes.length[l] - Rz[lanes.to[l]] || (prevLane[o] >= 0 && s[o] < Rz[lanes.from[l]] + 4); };
  const overlapLat = (i, j) => Math.abs(jit[i] - jit[j]) < (wid[i] + wid[j]) / 2;
  // Chặn nhau khi mô phỏng: chồng dải ngang + đệm 0,45 m (thân xe xoay khi vào cua); trong vùng nút không đi song song.
  const blocks = (i, j) => Math.abs(jit[i] - jit[j]) < (wid[i] + wid[j]) / 2 + .45 || inCorner(i) || inCorner(j);

  // Lập lộ trình: chọn trạng thái kế + làn đích theo góc rẽ.
  function planNext(i, l) {
    const st = lanes.st[l]; let cands = nextSt[st];
    if (region && cands) cands = cands.filter(c => insideLane[lanesOfSt[c.st]]);   // ra khỏi khu = nút biên
    if (!cands || !cands.length) return -2;   // tới nút biên → tái sinh
    // M5a: lối rẽ mà mọi làn đều bị đóng bị loại; nếu không còn lối nào thì giữ nguyên (không dịch chuyển xe).
    if (closedCount && cands.length > 1) {
      const open = cands.filter(c => { const b = lanesOfSt[c.st], n2 = laneCountOfSt[c.st]; for (let k = 0; k < n2; k++) if (!laneClosed[b + k]) return true; return false; });
      if (open.length) cands = open;
    }
    let total = 0; const w = [];
    // Xe buýt (2,5 m) không chui đường nội bộ làn 2,7 m: thân dài quét sang làn ngược chiều khi rẽ; chỉ đi khi không còn lối khác.
    const busAvoid = kind[i] >= HEAVY && cands.some(c => c.rank >= 2);
    for (const c of cands) {
      const a = Math.abs(c.turn); let x = a < .6 ? 5 : a < 2.4 ? 1.1 : .12;
      if (c.sameName) x *= 2.2; x *= .55 + .25 * c.rank;
      if (busAvoid && c.rank < 2) x = 0;
      // Xe buýt không rẽ cắt ngang làn bên cạnh (rẽ phải từ làn trong / rẽ trái từ làn ngoài): thân 10,5 m quét qua xe chờ ở vạch.
      if (kind[i] >= HEAVY && a >= .6 && (c.turn > 0 ? lanes.k[l] > 0 : lanes.k[l] < lanes.n[l] - 1)) x *= 1e-4;
      // Kịch bản nhu cầu: thiên hướng chọn lối rẽ VỀ tâm (không đổi số lần rút rand → tất định).
      if (demandCfg && demandCfg.turnBias && x > 0) {
        const cur = G.nodes[lanes.to[l]], dst = G.nodes[lanes.to[lanesOfSt[c.st]]];
        if (cur && dst) {
          const dCur = Math.hypot(cur.x - demandCfg.cx, cur.z - demandCfg.cz);
          const dDst = Math.hypot(dst.x - demandCfg.cx, dst.z - demandCfg.cz);
          if (dDst < dCur) x *= 1 + demandCfg.turnBias;
          else if (dDst > dCur) x /= 1 + demandCfg.turnBias;
        }
      }
      // M4b1: điều hướng tránh cảnh báo kẹt — giảm trọng số rẽ vào cạnh bị cảnh báo (chỉ khi hàm trả hệ số < 1).
      if (routeBiasFn && x > 0) { const f = routeBiasFn(c.st >> 1, i); if (Number.isFinite(f) && f < 1) x *= Math.max(.02, f); }
      w.push(x); total += x;
    }
    let r = rand(i) * total, pick = 0; for (; pick < w.length - 1; pick++) { r -= w[pick]; if (r < 0) break; }
    const c = cands[pick], n2 = laneCountOfSt[c.st], base = lanesOfSt[c.st];
    let k2 = Math.abs(c.turn) < .6 ? Math.min(lanes.k[l], n2 - 1) : c.turn > 0 ? 0 : n2 - 1;
    // M5a: làn đích đang bị chắn (xe hỏng) → xe đổi sang làn kề còn thông NGAY TẠI NÚT (không đổi làn giữa đoạn).
    if (laneBlockS[base + k2] < Infinity) { for (const dk of [1, -1, 2, -2]) { const kk = k2 + dk; if (kk >= 0 && kk < n2 && laneBlockS[base + kk] === Infinity) { k2 = kk; break; } } }
    return base + k2;
  }
  function fillPath(i) { for (let p = 0; p < PN; p++) { const prev = p === 0 ? lane[i] : path[i * PN + p - 1]; path[i * PN + p] = prev >= 0 ? planNext(i, prev) : -2; } next[i] = path[i * PN]; }
  function shiftPath(i) { for (let p = 0; p < PN - 1; p++) path[i * PN + p] = path[i * PN + p + 1]; const prev = path[i * PN + PN - 2]; path[i * PN + PN - 1] = prev >= 0 ? planNext(i, prev) : -2; next[i] = path[i * PN]; }
  const straightMove = (inL, outL) => { const c = nextSt[lanes.st[inL]]?.find(x => x.st === lanes.st[outL]); return !!c && Math.abs(c.turn) < .87; };

  // ---- Khóa nút.
  const relR = n => Rz[n] * REL_F;   // bán kính tính từ nút mà đuôi xe qua thì nhả khóa
  const holdsFor = (i, node) => { for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] === node) return k; return -1; };
  // Biên ngang của xe khi đổi làn qua nút: nửa rộng + lệch xe máy + đuôi xe xoay (≈ 10 % chiều dài, xe buýt ~1 m).
  const sideMargin = i => i < 0 ? 1 : wid[i] / 2 + Math.abs(jit[i]) + .1 * len[i];
  const sweepApart = (a1, b1, m1, a2, b2, m2) => {
    const lo1 = Math.min(lanes.offset[a1], lanes.offset[b1]) - m1, hi1 = Math.max(lanes.offset[a1], lanes.offset[b1]) + m1;
    const lo2 = Math.min(lanes.offset[a2], lanes.offset[b2]) - m2, hi2 = Math.max(lanes.offset[a2], lanes.offset[b2]) + m2;
    return hi1 <= lo2 || hi2 <= lo1;
  };
  function compatible(inL, outL, h, i = -1) {
    if (h.inL === inL) return true;
    if (h.outL === outL) return false;
    if (straightMove(inL, outL) && h.straight) {
      // Song song cùng cặp trạng thái: dải ngang quét (làn vào → làn ra, cộng biên thân xe) không được chồng nhau (nút có tim đường lệch).
      if (lanes.st[inL] === lanes.st[h.inL]) return lanes.st[outL] === lanes.st[h.outL] && sweepApart(inL, outL, sideMargin(i), h.inL, h.outL, sideMargin(h.car ?? -1));
      // Đối đầu đi thẳng: chỉ khi tránh nhau trên cùng cạnh hai chiều; hai cạnh khác nhau tỏa góc nhỏ (đầu dải phân cách) vẫn chồng thân xe gần nút.
      const d = Math.abs(angleDiff(arriveHead(lanes.st[inL]), arriveHead(lanes.st[h.inL])));
      if (d > 2.6 && lanes.edge[inL] === lanes.edge[h.outL] && lanes.edge[outL] === lanes.edge[h.inL]) return true;
    }
    return false;
  }
  function green(node, st) {
    if (!signal[node]) return true;
    const managed = signalPlan && signalPlan.signalNodes.includes(node);
    if (controller && managed) return controller.isGreen(node, st, counters.t);
    // Nút có đèn 31A NGOÀI plan (signal=1, không do controller quản): giữ chu kỳ 44 s cũ
    // (không để thành nút "không đèn, không nhường").
    const t = (counters.t + signalOffset[node]) % SIGNAL_CYCLE, g = arriveGroup[st];
    return g === 0 ? t < 22 : t >= 25 && t < 41;
  }
  const firstRear = (l, i, shiftJit, pred = 0) => { const a = laneCars[l]; if (!a) return Infinity; for (const j of a) { if (j === i) continue; if (!shiftJit || blocks(i, j)) return s[j] - len[j] / 2 + v[j] * pred; } return Infinity; };
  const sigHeld = (i, plan) => { for (const p of plan) if (signal[p.node]) return true; for (let k = 0; k < LK; k++) { const n = lockNode[i * LK + k]; if (n >= 0 && signal[n]) return true; } return false; };
  // Thử lấy khóa cho chuyển động (inL → outL) tại nút cuối inL, kèm chuỗi nút kế nếu làn ra quá ngắn để dừng.
  function tryAcquire(i, inL, depth, plan, ignorePriority) {
    const node = lanes.to[inL], outL = depth === 0 ? path[i * PN] : path[i * PN + depth];
    if (outL < 0) return true;
    if (!needsLock[node]) { return true; }
    if (holdsFor(i, node) >= 0) return true;
    const st = lanes.st[inL];
    // Đèn chỉ chặn ở nút có đèn đầu tiên trên chuỗi khóa: chuỗi nút kề nhau (liên kết ngắn) có đèn lệch nhóm (xanh nhóm 0 / nhóm 1 không bao giờ trùng)
    // sẽ không bao giờ có đủ xanh cùng lúc → xe đứng vĩnh viễn; xe đã giữ/đang xin một nút có đèn coi cả cụm là một giao lộ.
    if (!ignorePriority && !green(node, st) && !sigHeld(i, plan) && !(controller && controller.runsRed(i, node, st, counters.t))) return false;
    const hs = holders.get(node) || [];
    for (const h of hs) if (h.car !== i && !compatible(inL, outL, h, i)) return false;
    for (const p of plan) if (p.node === node && !(p.inL === inL) && !compatible(inL, outL, { car: i, inL: p.inL, outL: p.outL, straight: straightMove(p.inL, p.outL) }, i)) return false;
    // Chỗ trống ở làn ra: đuôi xe đầu tiên (cùng dải ngang) phải đủ xa để xe lọt hẳn khỏi vạch nút.
    // Chờ quá PATIENCE_S thì nhượng bộ quy tắc "không vào hộp nếu chưa thoát được" (vòng/cụm nút ngắn có hai xe là tự chặn nhau):
    // chỉ cần chỗ cho thân xe nối đuôi xe đầu làn ra; va chạm vẫn do IDM + kẹp khe cứng bảo đảm.
    const need = stopT[i] > PATIENCE_S ? len[i] + HARD_GAP + 1.5 : Math.min(lanes.length[outL] - .2, Rz[node] + len[i] + 1.5);
    if (firstRear(outL, i, true, PRED_S) < need) return false;
    plan.push({ node, inL, outL });
    // Chỗ dừng trên làn ra (trước vạch nút kế) phải để đuôi xe ra khỏi vùng nút này, nếu không xe đứng chắn giữa nút: xin luôn khóa nút kế.
    const node2 = lanes.to[outL], stop2 = lanes.length[outL] - Rz[node2] - len[i] / 2;
    if (needsLock[node2] && stop2 - len[i] / 2 < Rz[node] + .3 && depth < PN - 1) { if (!tryAcquire(i, outL, depth + 1, plan, ignorePriority)) return false; }
    // Nhường ở nút không đèn: chỉ xe đã "sẵn sàng" (tương thích + có chỗ + chuỗi nút kế thông) mới tranh lượt, theo cấp đường + thời gian chờ;
    // xe chưa đi được thì không giữ lượt (tránh chặn vô hạn).
    const managed = signalPlan && signalPlan.signalNodes.includes(node);
    if (!ignorePriority && !signal[node] && depth === 0 && !managed) {
      const prio = lanes.rank[inL] * 10 + stopT[i] * 1.5 + (i % 997) * 1e-6;
      const cur = reqCur.get(node); if (!cur || prio > cur.p) reqCur.set(node, { p: prio, car: i });
      const prev = reqPrev.get(node); if (prev && prev.car !== i && prev.p > prio && active[prev.car] && lanes.to[lane[prev.car]] === node && holdsFor(prev.car, node) < 0) return false;
    }
    return true;
  }
  // inL/depth: khóa nút xa hơn trên lộ trình (làn kế quá ngắn, xe phải xin trước khi rời làn hiện tại).
  function acquire(i, ignorePriority = false, inL = lane[i], depth = 0) {
    const plan = [];
    if (!tryAcquire(i, inL, depth, plan, ignorePriority)) return false;
    for (const p of plan) {
      let slot = -1; for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] < 0) { slot = k; break; }
      if (slot < 0) return true;
      lockNode[i * LK + slot] = p.node; lockIn[i * LK + slot] = p.inL; lockOut[i * LK + slot] = p.outL; lockRemain[i * LK + slot] = Infinity;
      let hs = holders.get(p.node); if (!hs) holders.set(p.node, hs = []);
      hs.push({ car: i, inL: p.inL, outL: p.outL, straight: straightMove(p.inL, p.outL) }); if (p.inL >= 0) inHold[p.inL]++;
    }
    return true;
  }
  function releaseSlot(i, k) {
    const node = lockNode[i * LK + k]; if (node < 0) return;
    const hs = holders.get(node); if (hs) { const idx = hs.findIndex(h => h.car === i); if (idx >= 0) { if (hs[idx].inL >= 0) inHold[hs[idx].inL]--; hs.splice(idx, 1); } if (!hs.length) holders.delete(node); }
    lockNode[i * LK + k] = -1; lockRemain[i * LK + k] = Infinity;
  }
  const releaseAll = i => { for (let k = 0; k < LK; k++) releaseSlot(i, k); for (let k = 0; k < 2; k++) dropZone(i, k); };

  // ---- Token vùng giao cắt không nút.
  const holdsZone = (i, z) => zTok[i * 2] === z || zTok[i * 2 + 1] === z;
  const zoneFree = (z, l) => { const h = zoneHold.get(z); if (!h) return true; for (const hl of h.keys()) if (hl !== l && CZ.conflict(hl, l)) return false; return true; };
  function takeZone(i, z, l, rem) {
    const k = zTok[i * 2] < 0 ? 0 : zTok[i * 2 + 1] < 0 ? 1 : -1; if (k < 0) return false;
    zTok[i * 2 + k] = z; zLane[i * 2 + k] = l; zRem[i * 2 + k] = rem;
    let h = zoneHold.get(z); if (!h) zoneHold.set(z, h = new Map()); h.set(l, (h.get(l) || 0) + 1);
    return true;
  }
  function dropZone(i, k) {
    const z = zTok[i * 2 + k]; if (z < 0) return;
    const h = zoneHold.get(z), l = zLane[i * 2 + k]; if (h) { const c = (h.get(l) || 1) - 1; if (c > 0) h.set(l, c); else h.delete(l); if (!h.size) zoneHold.delete(z); }
    zTok[i * 2 + k] = -1;
  }
  // Khoảng tới đầu vùng chưa xin được (Infinity nếu đường thông); xin token cho các vùng trong tầm phanh.
  function crossGate(i, l, si, Li, reach) {
    let base = 0, ln = l;
    for (let p = -1; p < PN; p++) {
      if (p >= 0) { base += lanes.length[ln]; ln = path[i * PN + p]; if (ln < 0) break; }
      if (base - (si + Li / 2) > reach) break;
      for (let q = CZ.off[ln]; q < CZ.off[ln + 1]; q++) {
        const a = base + CZ.a[q], b = base + CZ.b[q], z = CZ.zone[q];
        if (b < si - Li / 2 || holdsZone(i, z)) continue;
        const g = a - (si + Li / 2); if (g > reach) return Infinity;
        if (zoneFree(z, ln) && takeZone(i, z, ln, b - (si - Li / 2))) continue;
        return g;
      }
    }
    return Infinity;
  }
  // Xe đặt/kích hoạt giữa vùng: phải xin được mọi token vùng đang chạm thân xe.
  function claimInside(i, l, si) {
    for (let q = CZ.off[l]; q < CZ.off[l + 1]; q++) {
      const z = CZ.zone[q]; if (CZ.a[q] > si + len[i] / 2 || CZ.b[q] < si - len[i] / 2 || holdsZone(i, z)) continue;
      if (!(zoneFree(z, l) && takeZone(i, z, l, CZ.b[q] - (si - len[i] / 2)))) { for (let k = 0; k < 2; k++) dropZone(i, k); return false; }
    }
    return true;
  }

  // ---- Đặt xe vào làn (kích hoạt / tái sinh) nếu đủ chỗ cả trước và sau.
  // tight: kích hoạt lại tại chỗ cũ (trạng thái đóng băng vốn hợp lệ) chỉ cần khe vi phạm 0,3 m + đệm như khi bám xe; đặt mới thì rộng hơn.
  function spotFree(i, l, si, tight = false) {
    const a = laneCars[l] || [];
    for (const j of a) {
      if (j === i || !blocks(i, j)) continue;
      const d = Math.abs(s[j] - si), need = tight
        ? (len[i] + len[j]) / 2 + .3 + lanes.pinch[l] + (inCorner(s[j] > si ? j : i) ? cornerPad(i, j) : 0)
        : (len[i] + len[j]) / 2 + HARD_GAP + 1 + lanes.pinch[l] + cornerPad(i, j);
      if (d < need) return false;
    }
    return true;
  }
  function place(i, l, si, vel) {
    lane[i] = l; s[i] = si; v[i] = vel; lat[i] = lanes.offset[l] + jit[i]; prevLane[i] = -1; stopT[i] = 0; waiting[i] = 0; elig[i] = 1;
    insertSorted(l, i); fillPath(i); active[i] = 1; pending[i] = 0;
  }
  function respawn(i, breaker, maxTries = 8) {
    if (active[i]) { removeFrom(lane[i], i); releaseAll(i); }
    gen[i]++; counters.respawns++; if (breaker) counters.breakerRespawns++;
    active[i] = 0;
    for (let tries = 0; tries < maxTries && spawnList.length; tries++) {
      const l = spawnList[Math.floor(rand(i) * spawnList.length)];
      if (kind[i] >= HEAVY && lanes.rank[l] < 2) continue;
      const si = Math.min(lanes.length[l] * .5, len[i] / 2 + .8 + (needsLock[lanes.from[l]] ? Rz[lanes.from[l]] : 0));
      if (si + len[i] / 2 > zoneEnd(l, 0) + .6) continue;
      jit[i] = kind[i] === 0 ? (rand(i) - .5) * 1.5 : 0;
      if (spotFree(i, l, si) && claimInside(i, l, si)) { place(i, l, si, Math.min(lanes.speed[l] * .6, 6)); pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; return true; }
    }
    pending[i] = 1; return false;
  }
  // Chỗ cũ đã bị xe khác chiếm: tìm chỗ trống gần nhất trong tầm RELOCATE_M cùng làn (rồi các làn cùng trạng thái), ngoài vùng nút,
  // để xe hồi tức thì thay vì chờ tái sinh ở nút biên (sau sim dài ~2 % xe không còn chỗ cũ).
  function relocate(i) {
    const l0 = lane[i], s0 = s[i], st = lanes.st[l0], base = lanesOfSt[st], n = laneCountOfSt[st], vel = Math.min(v[i], lanes.speed[l0] * .6);
    for (let q = 0; q < n; q++) {
      const l = q === 0 ? l0 : base + (l0 - base + q) % n;
      if ((region && !insideLane[l]) || (kind[i] >= HEAVY && lanes.rank[l] < 2)) continue;
      const a = zoneStart(l, len[i]), b = zoneEnd(l, len[i]); if (b <= a) continue;
      const c = Math.max(a, Math.min(b, s0));
      for (let d = 0; d <= RELOCATE_M; d += RELOCATE_STEP) for (let sg = d ? -1 : 1; sg <= 1; sg += 2) {
        const si = c + sg * d; if (si < a || si > b) continue;
        if (spotFree(i, l, si) && claimInside(i, l, si)) { place(i, l, si, vel); pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; return true; }
      }
    }
    return false;
  }
  // Kích hoạt lại tại chỗ cũ (trạng thái đóng băng); trong vùng nút phải lấy lại khóa (bỏ qua ưu tiên/đèn).
  function reactivate(i) {
    const l = lane[i];
    if (!spotFree(i, l, s[i], true) || !claimInside(i, l, s[i])) return false;
    const node = lanes.to[l], stopPos = lanes.length[l] - Rz[node] - len[i] / 2;
    insertSorted(l, i); active[i] = 1; pending[i] = 0;
    if (needsLock[node] && s[i] > stopPos && path[i * PN] >= 0 && !acquire(i, true)) { removeFrom(l, i); releaseAll(i); active[i] = 0; return false; }
    // Đang trong vùng sau nút (đuôi chưa qua): lấy lại khóa nút đầu làn.
    const n0 = lanes.from[l];
    if (needsLock[n0] && prevLane[i] >= 0 && s[i] - len[i] / 2 < Rz[n0] && holdsFor(i, n0) < 0) {
      const hs = holders.get(n0) || [];
      if (hs.some(h => h.car !== i && !compatible(prevLane[i], l, h, i))) { removeFrom(l, i); releaseAll(i); active[i] = 0; return false; }
      let slot = -1; for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] < 0) { slot = k; break; }
      if (slot >= 0) { lockNode[i * LK + slot] = n0; lockIn[i * LK + slot] = prevLane[i]; lockOut[i * LK + slot] = l; lockRemain[i * LK + slot] = relR(n0) + len[i] / 2 - s[i]; let h2 = holders.get(n0); if (!h2) holders.set(n0, h2 = []); h2.push({ car: i, inL: prevLane[i], outL: l, straight: straightMove(prevLane[i], l) }); if (prevLane[i] >= 0) inHold[prevLane[i]]++; }
    }
    return true;
  }
  function deactivate(i) { if (!active[i]) return; removeFrom(lane[i], i); releaseAll(i); active[i] = 0; waiting[i] = 0; }

  // ---- Chọn tập xe hoạt động theo tỉ lệ F.
  // Hạng không gian: trong mỗi ô 200 m (theo vị trí ở bước hiện tại) xe được xếp hạng (xe đang chạy trước, rồi theo hash(id)),
  // selRank = (k + 1 − u_ô)/n_ô với u_ô = hash(ô) ∈ [0, 1) → ngưỡng F lấy ≈ F·n_ô xe mỗi ô, không ô nào bị làm trống, tập lồng nhau khi F đổi.
  // Tổng số xe KHÔNG phụ thuộc vị trí: lấy đúng Q = round(F·N) xe có hạng thấp nhất toàn cục (xe signature đang trên cầu luôn được giữ
  // và tính vào Q; chỉ khi số xe signature > Q mới vượt Q). Nhờ vậy setFraction(1) hoặc đưa F về giá trị cũ khôi phục đúng tổng cũ
  // dù mô phỏng đã chạy bao lâu; trước đây tổng = Σ_ô floor(F·n_ô + u_ô) đổi theo cách xe phân bố vào ô nên trôi vài chục xe.
  // Hạng nhớ theo bước nên gọi lại cùng F trong cùng bước → cùng tập.
  let rankStep = -1;
  const order = Array.from({ length: N }, (_, i) => i);
  function rankCells() {
    const cells = new Map();
    for (let i = 0; i < N; i++) { if (!elig[i]) { selRank[i] = Infinity; continue; } const c = cellOf(i); let a = cells.get(c); if (!a) cells.set(c, a = []); a.push(i); }
    for (const [c, a] of cells) {
      a.sort((x, y) => (active[y] - active[x]) || (hashU32(x + seed) - hashU32(y + seed)));
      const u = hashU32((c ^ seed) >>> 0) / 4294967296, n = a.length;
      a.forEach((i, k) => { selRank[i] = (k + 1 - u) / n; });
    }
    rankStep = counters.step;
  }
  function cellOf(i) { const e = lanes.edge[lane[i]], o = net.geo.off[e]; const c = E[e].c, n = c.length / 2; const t = Math.min(1, Math.max(0, s[i] / lanes.length[lane[i]])), k = Math.min(n - 1, Math.round(t * (n - 1))); return Math.floor(net.geo.x[o + k] / 200) * 100000 + Math.floor(net.geo.z[o + k] / 200); }
  function isSignature(i) { return !!(active[i] && net.signatureEdge[lanes.edge[lane[i]]]); }
  // Đánh dấu wanted: xe signature đang hoạt động trước (hạng −1), rồi theo selRank, hoà theo id; lấy max(Q, số signature) xe đầu.
  function chooseWanted(F, keepSignature) {
    let nElig = 0; for (let i = 0; i < N; i++) nElig += elig[i];
    const Q = Math.round(F * nElig), key = i => (!elig[i] ? Infinity : keepSignature && isSignature(i) ? -1 : selRank[i]);
    order.sort((x, y) => { const a = key(x), b = key(y); return a < b ? -1 : a > b ? 1 : x - y; });
    let take = Q; if (keepSignature) { let sig = 0; for (let i = 0; i < N; i++) if (elig[i] && isSignature(i)) sig++; take = Math.min(nElig, Math.max(Q, sig)); }
    wanted.fill(0); for (let k = 0; k < take; k++) wanted[order[k]] = 1;
  }
  function select() {
    const F = Math.max(0, Math.min(1, fraction * lightFactor));
    if (rankStep !== counters.step) rankCells();
    chooseWanted(F, true);
    for (let i = 0; i < N; i++) if (!wanted[i] && (active[i] || pending[i])) { deactivate(i); pending[i] = 0; }
    // Không kích hoạt lại tại chỗ được (xe khác đã tới) → tái sinh ngay ở nút biên để số xe khớp tỉ lệ ngay lập tức.
    for (let i = 0; i < N; i++) if (wanted[i] && !active[i]) { if (reactivate(i)) { pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; } else if (!relocate(i) && !respawn(i, false, 48)) pending[i] = 1; }
    return activeCount();
  }
  function activeCount() { let n = 0; for (let i = 0; i < N; i++) n += active[i]; return n; }

  // ---- Khu mô phỏng (bước H). Hợp đồng: setRegion(null) = toàn thành phố; setRegion({id, polygon:[[x,z],…], margin?}) tọa độ cảnh.
  // Xe ngoài khu bị tắt; xe chỉ sinh/tái sinh ở nút trong khu kề nút ngoài khu (hoặc nút biên thật trong khu); đi tới cạnh không nằm hẳn trong khu
  // thì coi như tới nút biên (tái sinh trong khu). F áp lên tập xe thuộc khu: Q = round(F·n_khu), cùng tính chất khôi phục của setFraction.
  // Bước H · T1: chọn cạnh/nút bằng đa giác NỚI một biên margin (mặc định 0 = hợp đồng cũ, đa giác thuần): điểm được coi
  // là "trong khu" khi nằm trong đa giác hoặc cách đa giác ≤ margin. Nhờ vậy cạnh vắt ranh (cầu nối hai khu) thuộc khu ở
  // CẢ hai bờ ⇒ xe trên cầu hiện ở cả hai khu kề thay vì biến mất ở mọi khu (trước đây chỉ dùng cạnh có mọi đỉnh trong
  // đa giác ⇒ ~4 % xe trên cạnh vắt ranh không thuộc khu nào). Cùng phép thử với city-region-31.js regionTrafficContains.
  const nodeIdx = new Map(); G.nodes.forEach((n, k) => nodeIdx.set(n.id, k));
  const inPoly = (poly, x, z) => { let c = false; for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) { const xa = poly[a], za = poly[a + 1], xb = poly[b], zb = poly[b + 1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c; } return c; };
  // Khoảng cách từ điểm tới đa giác phẳng (tới đoạn gần nhất): dùng cho biên nới.
  const distPoly = (poly, x, z) => { let best = Infinity; for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) { const xa = poly[a], za = poly[a + 1], sx = poly[b] - xa, sz = poly[b + 1] - za, l = sx * sx + sz * sz, t = l ? Math.max(0, Math.min(1, ((x - xa) * sx + (z - za) * sz) / l)) : 0; best = Math.min(best, Math.hypot(xa + sx * t - x, za + sz * t - z)); } return best; };
  function setRegion(reg) {
    finishStep();
    if (!reg) { region = null; insideLane.fill(1); spawnList = spawnLanes; }
    else {
      const pts = reg.polygon, margin = reg.margin ?? 0;
      if (typeof reg.id !== 'string' || !Array.isArray(pts) || pts.length < 3 || !pts.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) throw new TypeError('setRegion: cần {id: string, polygon: [[x, z], …≥ 3 điểm], margin?: số ≥ 0} hoặc null');
      if (!Number.isFinite(margin) || margin < 0) throw new TypeError('setRegion: margin phải là số hữu hạn ≥ 0');
      const poly = new Float64Array(pts.length * 2); pts.forEach((p, k) => { poly[k * 2] = p[0]; poly[k * 2 + 1] = p[1]; });
      const inRegion = margin > 0 ? (x, z) => inPoly(poly, x, z) || distPoly(poly, x, z) <= margin : (x, z) => inPoly(poly, x, z);
      // M5a: cầu vắt ranh dài ~1 km (cầu Sài Gòn): biên nới riêng bridgeMargin, chỉ cho các cạnh cầu có tên trong bridgeNames
      // (không truyền bridgeNames = mọi cầu). Mặc định bridgeMargin = margin → hành vi cũ không đổi.
      const bridgeMargin = reg.bridgeMargin === undefined ? margin : reg.bridgeMargin;
      if (!Number.isFinite(bridgeMargin) || bridgeMargin < margin) throw new TypeError('setRegion: bridgeMargin phải là số hữu hạn ≥ margin');
      const bridgeNames = Array.isArray(reg.bridgeNames) ? new Set(reg.bridgeNames) : null;
      const bridgeAllowed = e => net.bridgeEdge[e] && (!bridgeNames || bridgeNames.has(G.roads[E[e].road]?.name));
      const inRegionBridge = bridgeMargin > margin ? (x, z) => inPoly(poly, x, z) || distPoly(poly, x, z) <= bridgeMargin : inRegion;
      const inNode = new Uint8Array(G.nodes.length); for (let n = 0; n < inNode.length; n++) inNode[n] = inRegion(G.nodes[n].x, G.nodes[n].z) ? 1 : 0;
      const inEdge = new Uint8Array(net.NE);
      for (let e = 0; e < net.NE; e++) {
        const c = E[e].c;
        // Cầu vắt ranh: có điểm trong khu (đa giác thật) và mọi điểm trong biên nới bridgeMargin; cầu nằm hẳn ngoài khu vẫn loại.
        if (bridgeMargin > margin && bridgeAllowed(e)) {
          let anyIn = false, okB = true;
          for (let k = 0; k < c.length; k += 2) { if (inPoly(poly, c[k], c[k + 1])) anyIn = true; else if (!inRegionBridge(c[k], c[k + 1])) { okB = false; break; } }
          inEdge[e] = anyIn && okB ? 1 : 0; continue;
        }
        let ok = inNode[nodeIdx.get(E[e].from)] && inNode[nodeIdx.get(E[e].to)]; for (let k = 0; ok && k < c.length; k += 2) ok = inRegion(c[k], c[k + 1]); inEdge[e] = ok ? 1 : 0;
      }
      for (let l = 0; l < NL; l++) insideLane[l] = inEdge[lanes.edge[l]];
      const edgeNode = (e2, end) => nodeIdx.get(end === 0 ? E[e2].to : E[e2].from);
      spawnList = [];
      for (let l = 0; l < NL; l++) {
        if (!insideLane[l]) continue;
        const n = lanes.from[l], nd = G.nodes[n];
        if (nd.kind === 'boundary' || nd.adj.some(([e2, end]) => !inNode[edgeNode(e2, end)])) spawnList.push(l);
      }
      region = { id: reg.id, poly, margin, bridgeMargin, bridgeNames: bridgeNames ? [...bridgeNames] : null };
    }
    for (let i = 0; i < N; i++) elig[i] = !region || pending[i] ? 1 : insideLane[lane[i]];
    // Lộ trình: giữ đoạn còn hợp lệ, lập lại đoạn trỏ ra ngoài khu (hoặc đoạn -2 nay đi tiếp được); xe đã giữ khóa nút không đổi làn kế.
    for (let i = 0; i < N; i++) {
      if (!active[i]) { fillPath(i); continue; }
      let holdsLock = false; for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] >= 0) holdsLock = true;
      for (let p = 0; p < PN; p++) {
        const prev = p === 0 ? lane[i] : path[i * PN + p - 1], cur = path[i * PN + p];
        if (cur >= 0 && (!region || insideLane[cur])) continue;
        path[i * PN + p] = prev < 0 ? -2 : (p === 0 && holdsLock) ? -2 : planNext(i, prev);
      }
      next[i] = path[i * PN];
    }
    rankStep = -1;
    return select();
  }

  // ---- Hạn chế làn (M5a): setRestrictions({blocks:[{lane, s}], speedMul:[{lane, k}], closed:[lane…]}) đặt lại TOÀN BỘ hạn chế
  // (rỗng = bình thường). blocks: xe hỏng đứng yên, mép sau tại s (m) — xe phía sau dừng trước nó; speedMul: tốc độ mong muốn × k;
  // closed: lộ trình không chọn làn này nữa; xe đang có lộ trình qua làn đóng được lập lại đoạn đó (đoạn 0 giữ nguyên khi đang giữ khóa nút).
  function setRestrictions(r = {}) {
    finishStep();
    laneVmul.fill(1); laneBlockS.fill(Infinity); laneClosed.fill(0); closedCount = 0;
    const lane0 = l => { const v = Number(l); if (!Number.isInteger(v) || v < 0 || v >= NL) throw new RangeError('setRestrictions: làn không hợp lệ ' + l); return v; };
    for (const b of r.blocks || []) laneBlockS[lane0(b.lane)] = Math.max(0, Number(b.s) || 0);
    for (const m of r.speedMul || []) { const k = Number(m.k); if (!(k > 0 && k <= 1)) throw new RangeError('setRestrictions: hệ số tốc độ phải thuộc (0, 1]'); laneVmul[lane0(m.lane)] = k; }
    for (const l0 of r.closed || []) { const l = lane0(l0); if (!laneClosed[l]) { laneClosed[l] = 1; closedCount++; } }
    if (closedCount || laneBlockS.some(b => b < Infinity)) {
      for (let i = 0; i < N; i++) {
        let holdsLock = false; for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] >= 0) holdsLock = true;
        for (let p = holdsLock ? 1 : 0; p < PN; p++) {
          const cur = path[i * PN + p];
          if (cur < 0 || !(laneClosed[cur] || laneBlockS[cur] < Infinity)) continue;
          const prev = p === 0 ? lane[i] : path[i * PN + p - 1];
          path[i * PN + p] = prev < 0 ? -2 : planNext(i, prev);
        }
        next[i] = path[i * PN];
      }
    }
    return { blocked: r.blocks ? r.blocks.length : 0, closed: closedCount };
  }

  function reset() {
    activeLanes.forEach(l => { laneCars[l] = []; laneActive[l] = 0; }); activeLanes = [];
    inStep = false; stepLanes = null;
    holders.clear(); inHold.fill(0); reqPrev.clear(); reqCur.clear(); zoneHold.clear(); zTok.fill(-1);
    Object.assign(counters, { t: 0, step: 0, edgeTransitions: 0, teleports: 0, onewayViolations: 0, gapViolations: 0, respawns: 0, breakerRespawns: 0, waitsTotal: 0, maxStopS: 0, lastSecond: 0, pendingFails: 0 });
    counters.perSecond.fill(0);
    lockNode.fill(-1); lockRemain.fill(Infinity); lastStep.fill(-1);
    for (let i = 0; i < N; i++) {
      const [l, si, k, seed] = spawnPlan[i];
      kind[i] = k; len[i] = KL[k]; wid[i] = KW[k]; rng[i] = seed || 1; gen[i] = 0; active[i] = 0; pending[i] = 0;
      jit[i] = k === 0 ? (rand(i) - .5) * 1.5 : 0;
      vf[i] = k === 0 ? .85 + rand(i) * .35 : k === 1 ? .9 + rand(i) * .2 : .8 + rand(i) * .1;   // buýt và tải cùng dải
      lane[i] = l; s[i] = si; prevLane[i] = -1; v[i] = lanes.speed[l] * vf[i] * .7; lat[i] = lanes.offset[l] + jit[i]; stopT[i] = 0; waiting[i] = 0;
      fillPath(i);
    }
    for (let i = 0; i < N; i++) elig[i] = region ? insideLane[lane[i]] : 1;
    // Chọn tập theo tỉ lệ hiện tại (ban đầu chưa xe nào hoạt động nên kích hoạt từ trạng thái gốc).
    rankCells();
    chooseWanted(Math.max(0, Math.min(1, fraction * lightFactor)), false);
    for (let i = 0; i < N; i++) if (wanted[i]) { if (claimInside(i, lane[i], s[i])) { insertSorted(lane[i], i); active[i] = 1; } else pending[i] = 1; }
    for (let i = 0; i < N; i++) { pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; }
    if (controller && controller.reset) controller.reset(0);
  }

  // ---- Một bước mô phỏng.
  function updateCar(i, l, idx) {
    const K = TRAFFIC_KINDS[kind[i]], Li = len[i], list = laneCars[l];
    let laneLen = lanes.length[l], si = s[i], vi = v[i];
    // Đường tắt cho xe đang đứng sát sau xe cũng đang đứng (đuôi hàng chờ): IDM chắc chắn cho v = 0, chỉ cộng thời gian dừng.
    if (vi === 0 && idx + 1 < list.length) {
      const o = list[idx + 1];
      if (v[o] === 0 && blocks(i, o) && s[o] - len[o] / 2 - (si + Li / 2) - lanes.pinch[l] < K.s0 + .3) {
        stopT[i] += STEP; if (stopT[i] > counters.maxStopS) counters.maxStopS = stopT[i];
        if (stopT[i] > breakerS) respawn(i, true);
        return;
      }
    }
    // Xe dẫn trong làn (cùng dải ngang).
    let gap = Infinity, vl = 0;
    for (let j = idx + 1; j < list.length && j <= idx + 8; j++) { const o = list[j]; if (blocks(i, o)) { gap = s[o] - len[o] / 2 - (si + Li / 2) - lanes.pinch[l] - (inCorner(o) ? cornerPad(i, o) : 0); if (gap < 12 && next[o] !== next[i] && s[o] > laneLen - Rz[lanes.to[l]]) gap = Math.min(gap, geoGap(i, o)); vl = v[o]; break; } }
    // Nhìn qua ranh giới cạnh theo lộ trình (tối đa 3 làn, 70 m).
    const node = lanes.to[l], out0 = path[i * PN];
    // Xe cùng làn vào đã qua nút nhưng chưa nhả khóa (đang cắt góc) vẫn là xe dẫn, dù khác hướng ra.
    if (inHold[l] > 0 && needsLock[node] && laneLen - si < 60) { const hs = holders.get(node); if (hs) for (const h of hs) { const o = h.car; if (o === i || h.inL !== l || lane[o] === l || !active[o]) continue; const past = s[o] + (lane[o] !== h.outL ? lanes.length[h.outL] : 0); let g = laneLen - (si + Li / 2) + past - len[o] / 2 - cornerPad(i, o, h.inL, h.outL); if (g < 12) g = Math.min(g, geoGap(i, o)); if (g < gap) { gap = g; vl = v[o]; } } }
    let holding = out0 < 0 || !needsLock[node] || holdsFor(i, node) >= 0;
    const front = si + Li / 2;
    if (!holding && out0 >= 0 && front > laneLen - Rz[node] - (vi * vi / (2 * K.b) + 6)) holding = acquire(i);
    if (gap === Infinity) {
      let dist = laneLen - front;
      for (let p = 0; p < PN && dist < 70; p++) {
        const nl = path[i * PN + p]; if (nl < 0) break;
        // vạch dừng của nút cuối làn kế (khi chưa giữ khóa) cũng là vật cản.
        const a = laneCars[nl];
        let found = false;
        if (a) for (const o of a) { if (o !== i && blocks(i, o)) { const g = Math.min(dist + s[o] - len[o] / 2 - Math.max(lanes.pinch[l], lanes.pinch[nl]) - cornerPad(i, o, p === 0 ? l : path[i * PN + p - 1], nl), dist + s[o] < 14 && (p > 0 || (prevLane[o] >= 0 && prevLane[o] !== l)) ? geoGap(i, o) : Infinity); if (g < gap) { gap = g; vl = v[o]; } found = true; break; } }
        if (found) break;
        const n2 = lanes.to[nl], nn = path[i * PN + p + 1];
        if (holding && p < PN - 1 && nn !== undefined && nn >= 0 && needsLock[n2] && holdsFor(i, n2) < 0) {
          const g = dist + lanes.length[nl] - Rz[n2];
          // Vạch dừng nút kế đã trong tầm phanh: xin khóa luôn từ đây, nếu không xe sẽ đứng chờ mãi ở làn trước (khóa chỉ xin ở làn cuối nút).
          if (!(holding && g < vi * vi / (2 * K.b) + 6 && acquire(i, false, nl, p + 1))) { if (g < gap) { gap = g; vl = 0; } break; }
        }
        dist += lanes.length[nl];
      }
    }
    // M5a: xe hỏng đứng yên trên làn (laneBlockS = mép sau của xe hỏng): xe phía sau dừng trước nó.
    { const sb = laneBlockS[l]; if (sb < Infinity && sb > si) { const g = sb - (si + Li / 2); if (g < gap) { gap = g; vl = 0; } } }
    { const g = crossGate(i, l, si, Li, vi * vi / (2 * K.b) + 8); if (g < gap) { gap = g; vl = 0; } }
    let stopLimit = Infinity;
    if (!holding) { const g = laneLen - Rz[node] - front; if (g < gap) { gap = g; vl = 0; } stopLimit = laneLen - Rz[node] - Li / 2; }
    // IDM rút gọn.
    const v0 = lanes.speed[l] * laneVmul[l] * vf[i] * (kind[i] >= HEAVY ? .85 : 1);
    const dv = vi - vl, sStar = K.s0 + Math.max(0, vi * K.T + vi * dv / (2 * Math.sqrt(K.a * K.b)));
    const r = vi / v0, r2 = r * r, q = gap < Infinity ? sStar / Math.max(.1, gap) : 0;
    let acc = K.a * (1 - r2 * r2 - q * q);
    if (acc < -9) acc = -9;
    let vn = Math.max(0, vi + acc * STEP), ds = (vi + vn) * .5 * STEP;
    const maxDs = Math.max(0, gap - HARD_GAP);
    if (ds > maxDs) { ds = maxDs; vn = Math.min(vn, vl, ds / STEP); }
    if (si + ds > stopLimit) { ds = Math.max(0, stopLimit - si); vn = Math.min(vn, ds / STEP); }
    si += ds;
    // Giảm quãng còn lại của khóa đã qua nút; nhả khi đuôi xe rời vùng nút.
    for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] >= 0 && lockRemain[i * LK + k] !== Infinity) { lockRemain[i * LK + k] -= ds; if (lockRemain[i * LK + k] <= 0) releaseSlot(i, k); }
    for (let k = 0; k < 2; k++) if (zTok[i * 2 + k] >= 0) { zRem[i * 2 + k] -= ds; if (zRem[i * 2 + k] <= 0) dropZone(i, k); }
    // Chuyển cạnh.
    while (si >= laneLen) {
      const nl = path[i * PN];
      if (nl === -2) { v[i] = vn; respawn(i, false); return; }
      const nodeX = lanes.to[l];
      if (lanes.from[nl] !== nodeX) counters.teleports++;
      const ow = E[lanes.edge[nl]].oneway; if ((ow === 'yes' && lanes.dir[nl] !== 1) || (ow === '-1' && lanes.dir[nl] !== -1)) counters.onewayViolations++;
      const carryS = si - laneLen;
      removeFrom(l, i);
      prevLane[i] = l; lane[i] = nl; s[i] = carryS; si = carryS;
      lat[i] = lanes.offset[nl] + jit[i];
      insertSorted(nl, i);
      const k = holdsFor(i, nodeX); if (k >= 0) { lockRemain[i * LK + k] = relR(nodeX) + Li / 2 - carryS; if (lockRemain[i * LK + k] <= 0) releaseSlot(i, k); }
      shiftPath(i);
      counters.edgeTransitions++; counters.perSecond[counters.lastSecond & 31]++;
      l = nl; laneLen = lanes.length[nl];
    }
    s[i] = si; v[i] = vn;
    // Thời gian dừng, chờ ở vạch, phá kẹt.
    if (vn < .15) {
      stopT[i] += STEP; if (stopT[i] > counters.maxStopS) counters.maxStopS = stopT[i];
      if (!holding && !waiting[i]) { waiting[i] = 1; counters.waitsTotal++; }
      if (stopT[i] > breakerS) respawn(i, true);
    } else { stopT[i] = 0; waiting[i] = 0; }
  }

  // ---- Một bước chia được thành nhiều lát (theo làn) để trải CPU qua các khung hình: beginStep → workStep(n)… → endStep.
  // Giữa các lát trạng thái là trạng thái trung gian hợp lệ của đúng một bước tuần tự; kết quả cuối giống hệt step() một lần.
  let inStep = false, stepLanes = null, stepPos = 0;
  const swapReq = () => { const t = reqPrev; reqPrev = reqCur; reqCur = t; reqCur.clear(); };
  function beginStep() {
    if (inStep) finishStep();
    counters.step++; counters.t = counters.step * STEP;
    if (controller) controller.update(counters.t, buildQueues());
    const sec = Math.floor(counters.t); if (sec !== counters.lastSecond) { counters.lastSecond = sec; counters.perSecond[sec & 31] = 0; }
    pLane.set(lane); pS.set(s); pGen.set(gen);
    swapReq();
    // Tái sinh xe chờ chỗ (tất định theo chỉ số).
    for (let i = 0; i < N; i++) if (pending[i] && wanted[i]) { if (!(gen[i] === pGen[i] && reactivate(i)) && !relocate(i)) respawn(i, false, 32); }
    stepLanes = activeLanes.slice(); stepPos = 0; inStep = true;
  }
  // Cập nhật tiếp các làn của bước đang dở, dừng ở ranh giới làn khi đã cập nhật ≥ maxCars xe; trả về true khi xong bước.
  function workStep(maxCars = Infinity) {
    if (!inStep) return true;
    let done = 0;
    while (stepPos < stepLanes.length && done < maxCars) {
      const l = stepLanes[stepPos++], list = laneCars[l]; if (!list) continue;
      for (let idx = list.length - 1; idx >= 0; idx--) {
        const i = list[idx]; if (i === undefined || lastStep[i] === counters.step) continue;
        lastStep[i] = counters.step; updateCar(i, l, idx); done++;
      }
    }
    if (stepPos < stepLanes.length) return false;
    endStep(); return true;
  }
  function endStep() {
    // Sắp lại làn (xe máy vượt nhau khác dải ngang), đếm vi phạm khoảng cách, dọn làn rỗng.
    const keep = [];
    for (const l of activeLanes) {
      const a = laneCars[l];
      if (!a || !a.length) { laneActive[l] = 0; continue; }
      keep.push(l);
      for (let k = 1; k < a.length; k++) { const x = a[k]; let m = k - 1; while (m >= 0 && s[a[m]] > s[x]) { a[m + 1] = a[m]; m--; } a[m + 1] = x; }
      for (let k = 0; k < a.length; k++) for (let m = k + 1; m < a.length && m <= k + 8; m++) { const i = a[k], j = a[m]; if (!overlapLat(i, j)) continue; if (s[j] - s[i] < (len[i] + len[j]) / 2 + .3) counters.gapViolations++; break; }
    }
    activeLanes = keep; stepLanes = null; inStep = false;
  }
  function finishStep() { if (inStep) workStep(Infinity); }
  function step() { beginStep(); workStep(Infinity); }
  // Hàng chờ theo nhóm pha cho controller max-pressure (chỉ nút trong signalPlan).
  function buildQueues() {
    const q = new Map();
    for (const node of (signalPlan ? signalPlan.signalNodes : [])) {
      const push = new Map();
      const add = (key, rec) => {
        const cur = push.get(key);
        if (!cur) { push.set(key, rec); return; }
        const prevN = cur.count, prevS = cur.speed_mean;
        cur.count += rec.count; cur.wait_sum_s += rec.wait_sum_s;
        cur.wait_max_s = Math.max(cur.wait_max_s, rec.wait_max_s);
        cur.crossed += rec.crossed; cur.q_out += rec.q_out;
        cur.speed_mean = cur.count ? (prevS * prevN + rec.speed_mean * rec.count) / cur.count : 0;
      };
      for (const l of (lanesIntoNode.get(node) || [])) {
        const st = lanes.st[l], g = arriveGroup[st];
        let count = 0, wait_sum = 0, wait_max = 0, vsum = 0, crossed = 0;
        const stopPos = lanes.length[l] - Rz[node];
        const a = laneCars[l];
        if (a) for (const i of a) {
          if (!active[i]) continue;
          if (s[i] > stopPos) {
            // crossed = SỰ KIỆN qua vạch: s_prev ≥ 0 và ≤ stopPos < s (đếm 1 lần/xe)
            if (lastS[i] >= 0 && lastS[i] <= stopPos && lastStepCrossed[i] !== counters.step) { lastStepCrossed[i] = counters.step; crossed++; }
            continue;
          }
          // spec 6.1: chờ khi v < 0,5 m/s HOẶC còn cách vạch < 25 m
          const near = stopPos - s[i] <= 25;
          if (v[i] < 0.5 || near) {
            count++;
            wait_sum += stopT[i];
            if (stopT[i] > wait_max) wait_max = stopT[i];
            vsum += v[i];
          }
        }
        if (count || crossed) add(`in:${st}`, { st, group: g, count, wait_sum_s: wait_sum, wait_max_s: wait_max, speed_mean: count ? vsum / count : 0, crossed, q_out: 0 });
      }
      // q_out = số xe trong 25 m ĐẦU làn RA (lanes.from[l] == node), gom theo nhóm pha tương thích (spec 6.1).
      const qOut = [0, 0];
      for (const l of (lanesOutOfNode.get(node) || [])) {
        const a = laneCars[l]; if (!a) continue;
        const g = arriveGroup[lanes.st[l]];
        for (const i of a) if (active[i] && s[i] >= 0 && s[i] <= 25) qOut[g]++;
      }
      if (qOut[0]) add('out:0', { st: -1, group: 0, count: 0, wait_sum_s: 0, wait_max_s: 0, speed_mean: 0, crossed: 0, q_out: qOut[0] });
      if (qOut[1]) add('out:1', { st: -1, group: 1, count: 0, wait_sum_s: 0, wait_max_s: 0, speed_mean: 0, crossed: 0, q_out: qOut[1] });
      if (push.size) q.set(node, [...push.values()]);
    }
    // cập nhật s_prev cho mọi xe còn hoạt động
    for (let i = 0; i < N; i++) lastS[i] = active[i] ? s[i] : -1;
    return q;
  }

  // ---- Ảnh trạng thái (M4b2, chỉ THÊM): exportState() hoàn tất bước đang dở rồi chụp mọi mảng xe, khóa nút, token vùng,
  // hàng chờ làn, đếm, khu, tỉ lệ và hệ số ánh sáng. importState(st) đặt lại đúng các mảng đó lên một sim CÙNG mạng
  // (kiểm N/NL); khi đó sim chạy tiếp cho cùng stateHash như sim gốc (kiểm bằng test). Không đổi bước mô phỏng nào.
  function exportState() {
    finishStep();
    const cp = a => a.slice();
    return {
      format: 1, N, NL,
      counters: { ...counters, perSecond: counters.perSecond.slice() },
      fraction, lightFactor, rankStep,
      region: region ? { id: region.id, poly: Array.from(region.poly), margin: region.margin, bridgeMargin: region.bridgeMargin, bridgeNames: region.bridgeNames } : null,
      insideLane: cp(insideLane), spawnList: spawnList.slice(), elig: cp(elig),
      lane: cp(lane), s: cp(s), v: cp(v), lat: cp(lat), jit: cp(jit), gen: cp(gen), active: cp(active),
      kind: cp(kind), len: cp(len), wid: cp(wid), next: cp(next), prevLane: cp(prevLane),
      pLane: cp(pLane), pS: cp(pS), pGen: cp(pGen), path: cp(path), stopT: cp(stopT), lastStep: cp(lastStep),
      waiting: cp(waiting), lastStepCrossed: cp(lastStepCrossed), lastS: cp(lastS), wanted: cp(wanted),
      selRank: cp(selRank), pending: cp(pending), vf: cp(vf), rng: cp(rng),
      lockNode: cp(lockNode), lockIn: cp(lockIn), lockOut: cp(lockOut), lockRemain: cp(lockRemain),
      zTok: cp(zTok), zLane: cp(zLane), zRem: cp(zRem),
      laneVmul: cp(laneVmul), laneBlockS: cp(laneBlockS), laneClosed: cp(laneClosed), closedCount,
      activeLanes: activeLanes.slice(),
      laneCars: activeLanes.map(l => [l, laneCars[l].slice()]),
      holders: [...holders.entries()].map(([n, list]) => [n, list.map(h => ({ car: h.car, inL: h.inL, outL: h.outL, straight: h.straight }))]),
      reqPrev: [...reqPrev].map(([n, r]) => [n, r.p, r.car]),
      reqCur: [...reqCur].map(([n, r]) => [n, r.p, r.car])
    };
  }
  function importState(st) {
    if (!st || st.format !== 1 || st.N !== N || st.NL !== NL) throw new RangeError('importState: trạng thái không khớp mạng (N/NL)');
    const put = (dst, src) => { if (!src || src.length !== dst.length) throw new RangeError('importState: sai độ dài mảng ' + dst.length); dst.set(src); };
    for (const l of activeLanes) { laneCars[l] = []; laneActive[l] = 0; }
    activeLanes = []; inStep = false; stepLanes = null;
    put(insideLane, st.insideLane); put(elig, st.elig);
    put(lane, st.lane); put(s, st.s); put(v, st.v); put(lat, st.lat); put(jit, st.jit); put(gen, st.gen); put(active, st.active);
    put(kind, st.kind); put(len, st.len); put(wid, st.wid); put(next, st.next); put(prevLane, st.prevLane);
    put(pLane, st.pLane); put(pS, st.pS); put(pGen, st.pGen); put(path, st.path); put(stopT, st.stopT); put(lastStep, st.lastStep);
    put(waiting, st.waiting); put(lastStepCrossed, st.lastStepCrossed); put(lastS, st.lastS); put(wanted, st.wanted);
    put(selRank, st.selRank); put(pending, st.pending); put(vf, st.vf); put(rng, st.rng);
    put(lockNode, st.lockNode); put(lockIn, st.lockIn); put(lockOut, st.lockOut); put(lockRemain, st.lockRemain);
    put(zTok, st.zTok); put(zLane, st.zLane); put(zRem, st.zRem);
    if (st.laneVmul) { put(laneVmul, st.laneVmul); put(laneBlockS, st.laneBlockS); put(laneClosed, st.laneClosed); closedCount = st.closedCount | 0; }
    else { laneVmul.fill(1); laneBlockS.fill(Infinity); laneClosed.fill(0); closedCount = 0; }
    for (const [l, cars] of st.laneCars) { laneCars[l] = cars.slice(); laneActive[l] = 1; activeLanes.push(l); }
    holders.clear(); inHold.fill(0);
    for (const [n, list] of st.holders) holders.set(n, list.map(h => ({ car: h.car, inL: h.inL, outL: h.outL, straight: h.straight })));
    for (let i = 0; i < N; i++) for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] >= 0 && lockIn[i * LK + k] >= 0) inHold[lockIn[i * LK + k]]++;
    zoneHold.clear();
    for (let i = 0; i < N; i++) for (let k = 0; k < 2; k++) {
      const z = zTok[i * 2 + k]; if (z < 0) continue;
      let h = zoneHold.get(z); if (!h) zoneHold.set(z, h = new Map());
      const l = zLane[i * 2 + k]; h.set(l, (h.get(l) || 0) + 1);
    }
    reqPrev = new Map(st.reqPrev.map(([n, p, car]) => [n, { p, car }]));
    reqCur = new Map(st.reqCur.map(([n, p, car]) => [n, { p, car }]));
    const { perSecond, ...rest } = st.counters;
    Object.assign(counters, rest); counters.perSecond.set(perSecond);
    fraction = st.fraction; lightFactor = st.lightFactor; rankStep = st.rankStep;
    region = st.region ? { id: st.region.id, poly: Float64Array.from(st.region.poly), margin: st.region.margin, bridgeMargin: st.region.bridgeMargin ?? st.region.margin, bridgeNames: st.region.bridgeNames ?? null } : null;
    spawnList = st.spawnList.slice();
    return { t: counters.t, active: activeCount() };
  }
  function stateHash() {
    let h = 2166136261 >>> 0;
    const mix = x => { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; };
    for (let i = 0; i < N; i++) { mix(active[i]); if (!active[i]) continue; mix(lane[i]); mix(Math.round(s[i] * 1000)); mix(Math.round(v[i] * 1000)); mix(gen[i]); }
    return h.toString(16).padStart(8, '0');
  }
  function stats() {
    let act = 0, onBridge = 0, waitingNow = 0; for (let i = 0; i < N; i++) if (active[i]) { act++; if (net.bridgeEdge[lanes.edge[lane[i]]]) onBridge++; if (waiting[i]) waitingNow++; }
    let last30 = 0; for (let k = 1; k <= 30; k++) last30 += counters.perSecond[(counters.lastSecond - k + 64) & 31];
    return { t: +counters.t.toFixed(3), active: act, total: N, edgeTransitions: counters.edgeTransitions, edgeTransitionsLast30s: last30, gapViolations: counters.gapViolations, onewayViolations: counters.onewayViolations + net.stats.onewayLaneViolations, teleports: counters.teleports, onBridge, respawns: counters.respawns, breakerRespawns: counters.breakerRespawns, waitingNow, waitsTotal: counters.waitsTotal, maxStopS: +counters.maxStopS.toFixed(2), signals: net.stats.signals, controlledNodes: net.stats.controlledNodes, holders: [...holders.values()].reduce((a, h) => a + h.length, 0) };
  }
  reset();
  const simApi = {
    N, lane, s, v, lat, jit, gen, active, kind, len, wid, next, prevLane, pLane, pS, pGen, path, counters, exportState, importState,
    step, beginStep, workStep, finishStep, get inStep() { return inStep; }, reset, stats, wantedCount: () => { let n = 0; for (let i = 0; i < N; i++) n += wanted[i]; return n; }, pendingCount: () => { let n = 0; for (let i = 0; i < N; i++) n += pending[i]; return n; }, stateHash: () => { finishStep(); return stateHash(); }, select: () => { finishStep(); return select(); }, activeCount, isSignature,
    setRestrictions, clearRestrictions: () => setRestrictions({}), restrictionCounts: () => ({ closed: closedCount, blocked: laneBlockS.reduce((a, b) => a + (b < Infinity ? 1 : 0), 0), slowed: laneVmul.reduce((a, k) => a + (k < 1 ? 1 : 0), 0) }),
    setRegion, get region() { return region ? { id: region.id, active: true, margin: region.margin, lanes: insideLane.reduce((a, b) => a + b, 0), spawnLanes: spawnList.length } : { id: null, active: false, margin: 0, lanes: NL, spawnLanes: spawnLanes.length }; },
    eligibleCount: () => { let n = 0; for (let i = 0; i < N; i++) n += elig[i]; return n; }, isEligible: i => !!elig[i], insideLaneOf: l => !!insideLane[l],
    setFraction(f) { finishStep(); fraction = Math.max(0, Math.min(1, f)); return select(); },
    setLightFactor(f) { if (Math.abs(f - lightFactor) < 1e-9) return activeCount(); finishStep(); lightFactor = f; return select(); },
    get fraction() { return fraction; }, get lightFactor() { return lightFactor; },
    attachController(c) {
      controller = c || null;
      if (controller && controller.attachSim) controller.attachSim(simApi);
      return controller;
    },
    get controller() { return controller; },
    get signalPlan() { return signalPlan; },
    get signalGroups() {
      if (signalPlan) return signalPlan.clusters;
      const groups = [];
      for (let n = 0; n < signal.length; n++) if (signal[n]) groups.push({ cluster_id: `31A-${n}`, nodeIds: [n], offset_s: signalOffset[n] });
      return groups;
    }
  };
  if (controller && controller.attachSim) controller.attachSim(simApi);
  return simApi;
}

// ---------------------------------------------------------------- hình học pose (thuần JS)
// liftY (tuỳ chọn): (làn, s, x, z, yProfile) → y vẽ, để thân xe nằm trên mặt đường vẽ cao nhất cùng cấp tại đúng vị trí xe.
export function createTrafficGeometry31(net, sim, liftY = null) {
  const { lanes, geo, E } = net;
  const groundY = net.G.frame.groundY;
  // ---- Vị trí trên làn: tim polyline + pháp tuyến nội suy (đường lệch liên tục), y theo profile.
  function lanePoint(l, sl, latv, out) {
    const e = lanes.edge[l], d = lanes.dir[l], L = lanes.length[l], o = geo.off[e], n = E[e].c.length / 2;
    const sd = Math.max(0, Math.min(L, d > 0 ? sl : L - sl)), sp = sd * geo.planar[e] / L;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (geo.s[o + m] <= sp) lo = m; else hi = m; }
    const segL = Math.max(1e-6, geo.s[o + hi] - geo.s[o + lo]), t = Math.max(0, Math.min(1, (sp - geo.s[o + lo]) / segL));
    const cx = geo.x[o + lo] + (geo.x[o + hi] - geo.x[o + lo]) * t, cz = geo.z[o + lo] + (geo.z[o + hi] - geo.z[o + lo]) * t;
    let nx = geo.nx[o + lo] + (geo.nx[o + hi] - geo.nx[o + lo]) * t, nz = geo.nz[o + lo] + (geo.nz[o + hi] - geo.nz[o + lo]) * t; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const ld = latv * d;   // lệch phải theo chiều đi = lệch theo pháp tuyến phải của chiều vẽ × dir
    out.x = cx + nx * ld; out.z = cz + nz * ld;
    out.tx = (geo.x[o + hi] - geo.x[o + lo]) / segL * d; out.tz = (geo.z[o + hi] - geo.z[o + lo]) / segL * d;
    return out;
  }
  function laneY(l, sl) {
    const e = lanes.edge[l], d = lanes.dir[l], L = lanes.length[l], ed = E[e];
    const sd = Math.max(0, Math.min(L, d > 0 ? sl : L - sl));
    if (ed.profile) return profileAt(ed.profile, sd);
    if (ed.y) { const n = ed.c.length / 2, o = geo.off[e], sp = sd * geo.planar[e] / L; let k = 0; while (k < n - 2 && geo.s[o + k + 1] < sp) k++; const t = Math.max(0, Math.min(1, (sp - geo.s[o + k]) / Math.max(1e-6, geo.s[o + k + 1] - geo.s[o + k]))); return ed.y[k] + (ed.y[k + 1] - ed.y[k]) * t; }
    return groundY;
  }
  const rcOf = (a, b) => Math.min(net.Rz[lanes.to[a]] * .8, lanes.length[a] * .45, lanes.length[b] * .45);
  const A = {}, B = {};
  // Điểm trên quỹ đạo xe: trong vùng nút dùng Bezier bậc ba nối làn vào/ra (tiếp tuyến liên tục).
  function pathPoint(i, l, sl, nl, pl, out) {
    const L = lanes.length[l], jit = sim.jit[i];
    let a = -1, b = -1, u = 0;
    if (nl >= 0) { const rc = rcOf(l, nl); if (sl > L - rc) { a = l; b = nl; u = (sl - (L - rc)) / (2 * rc); } }
    if (a < 0 && pl >= 0) { const rc = rcOf(pl, l); if (sl < rc) { a = pl; b = l; u = .5 + sl / (2 * rc); } }
    if (a >= 0) {
      const rc = rcOf(a, b), La = lanes.length[a];
      lanePoint(a, La - rc, lanes.offset[a] + jit, A); lanePoint(b, rc, lanes.offset[b] + jit, B);
      const h = rc * .66, p1x = A.x + A.tx * h, p1z = A.z + A.tz * h, p2x = B.x - B.tx * h, p2z = B.z - B.tz * h, w = 1 - u;
      out.x = w * w * w * A.x + 3 * w * w * u * p1x + 3 * w * u * u * p2x + u * u * u * B.x;
      out.z = w * w * w * A.z + 3 * w * w * u * p1z + 3 * w * u * u * p2z + u * u * u * B.z;
      out.tx = 3 * w * w * (p1x - A.x) + 6 * w * u * (p2x - p1x) + 3 * u * u * (B.x - p2x); out.tz = 3 * w * w * (p1z - A.z) + 6 * w * u * (p2z - p1z) + 3 * u * u * (B.z - p2z);
      const tl = Math.hypot(out.tx, out.tz) || 1; out.tx /= tl; out.tz /= tl;
    } else lanePoint(l, sl, lanes.offset[l] + jit, out);
    return out;
  }
  // Điểm quỹ đạo tại quãng s có thể vượt đầu/cuối làn (sang làn trước/làn kế), ngoài cùng thì ngoại suy theo tiếp tuyến.
  function pointAlong(i, l, sl, nl, pl, out) {
    const L = lanes.length[l];
    if (sl > L && nl >= 0) return pathPoint(i, nl, Math.min(sl - L, lanes.length[nl]), -1, l, out);
    if (sl < 0 && pl >= 0) return pathPoint(i, pl, Math.max(0, lanes.length[pl] + sl), l, -1, out);
    const c = Math.max(0, Math.min(L, sl)); pathPoint(i, l, c, nl, pl, out);
    if (c !== sl) { out.x += out.tx * (sl - c); out.z += out.tz * (sl - c); }
    return out;
  }
  const F = {}, R = {};
  // Pose thân xe: hai trục (±0,4 chiều dài) đều nằm trên quỹ đạo, tâm ở giữa, hướng theo dây cung → đuôi xe dài không văng ra ngoài làn khi rẽ.
  function poseAt(i, l, sl, nl, pl, out) {
    const L = lanes.length[l], h = (sim.len ? sim.len[i] : 4) * .4;
    pointAlong(i, l, sl + h, nl, pl, F); pointAlong(i, l, sl - h, nl, pl, R);
    out.x = (F.x + R.x) / 2; out.z = (F.z + R.z) / 2;
    let tx = F.x - R.x, tz = F.z - R.z; const tl = Math.hypot(tx, tz);
    if (tl > 1e-6) { out.tx = tx / tl; out.tz = tz / tl; } else { out.tx = F.tx; out.tz = F.tz; }
    out.y = liftY ? liftY(l, sl, out.x, out.z, laneY(l, sl)) : laneY(l, sl);
    out.grade = (laneY(l, Math.min(L, sl + 1)) - laneY(l, Math.max(0, sl - 1))) / Math.max(.5, Math.min(L, sl + 1) - Math.max(0, sl - 1));
    return out;
  }
  return { poseAt, lanePoint, laneY };
}
