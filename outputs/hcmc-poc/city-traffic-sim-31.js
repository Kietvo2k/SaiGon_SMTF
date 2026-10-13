// Batch 31A Â· bÆ°á»›c D â€” lÃµi mÃ´ phá»ng giao thÃ´ng minh há»a (illustrative) trÃªn ROAD_GRAPH_31: thuáº§n JS, khÃ´ng THREE,
// cháº¡y Ä‘Æ°á»£c trong Node Ä‘á»ƒ kiá»ƒm thá»­ táº¥t Ä‘á»‹nh. Pháº§n váº½ á»Ÿ city-traffic-31.js.
//
// MÃ´ hÃ¬nh (táº¥t Ä‘á»‹nh, seed cá»‘ Ä‘á»‹nh, bÆ°á»›c cá»‘ Ä‘á»‹nh 1/20 s, váº½ ná»™i suy giá»¯a hai bÆ°á»›c):
//  - Tráº¡ng thÃ¡i = cáº¡nh cÃ³ hÆ°á»›ng (edge, dir) trong thÃ nh pháº§n liÃªn thÃ´ng máº¡nh lÃ¡i Ä‘Æ°á»£c (xÃ©t oneway, khÃ´ng quay Ä‘áº§u;
//    nÃºt biÃªn ná»‘i vÃ²ng qua "siÃªu nÃºt" tÃ¡i sinh). Má»—i tráº¡ng thÃ¡i cÃ³ 1â€“4 lÃ n; lÃ n 0 sÃ¡t lá» pháº£i, hai chiá»u Ä‘i bÃªn pháº£i.
//  - Má»—i xe: (lÃ n, s dá»c lÃ n theo chiá»u Ä‘i, v). BÃ¡m xe IDM rÃºt gá»n + káº¹p cá»©ng khoáº£ng cÃ¡ch (khÃ´ng xuyÃªn nhau), nhÃ¬n qua
//    ranh giá»›i cáº¡nh theo lá»™ trÃ¬nh Ä‘Ã£ láº­p 3 lÃ n tá»›i. Xe mÃ¡y lá»‡ch ngang cá»‘ Ä‘á»‹nh nhá» trong lÃ n (chen lÃ n cÃ³ giá»›i háº¡n).
//  - NÃºt cÃ³ â‰¥ 2 lÃ n Ä‘á»• vÃ o: váº¡ch dá»«ng cÃ¡ch nÃºt Rz; vÃ o vÃ¹ng nÃºt pháº£i giá»¯ "khÃ³a chuyá»ƒn Ä‘á»™ng" tÆ°Æ¡ng thÃ­ch vá»›i xe Ä‘ang
//    trong nÃºt (cÃ¹ng lÃ n vÃ o; hoáº·c cÃ¹ng Ä‘i tháº³ng song song/Ä‘á»‘i diá»‡n, khÃ¡c lÃ n ra). NÃºt trá»¥c chÃ­nh cÃ³ chu ká»³ Ä‘Ã¨n giáº£ láº­p;
//    nÃºt cÃ²n láº¡i nhÆ°á»ng theo cáº¥p Ä‘Æ°á»ng + thá»i gian chá» (chá» lÃ¢u thÃ¬ Ä‘Æ°á»£c Æ°u tiÃªn). Bá»™ phÃ¡ káº¹t: dá»«ng > 75 s â†’ tÃ¡i sinh.
//  - Ra nÃºt biÃªn â†’ tÃ¡i sinh á»Ÿ lÃ n xuáº¥t phÃ¡t tá»« nÃºt biÃªn khÃ¡c (chá»n theo rng cá»§a xe), cÃ³ cá» gen.
// Hiá»‡u nÄƒng: mÃ´ phá»ng 1D ráº» cho má»i xe (giá»¯ táº¥t Ä‘á»‹nh, khÃ´ng phá»¥ thuá»™c camera); chá»‰ xe trÃªn cáº¡nh náº±m trong frustum
// vÃ  bÃ¡n kÃ­nh quanh camera má»›i tÃ­nh pose + ghi ma tráº­n (tá»± cull, 3 InstancedMesh theo loáº¡i xe).
export const TRAFFIC_31_VERSION = 'traffic-31D';
export const SEED = 31031;
export const STEP = 1 / 10;   // s, bÆ°á»›c cá»‘ Ä‘á»‹nh 10 Hz (váº½ ná»™i suy giá»¯a hai bÆ°á»›c)
export const MAX_STEPS_PER_FRAME = 5;
const POOL_TARGET = 3600;
const PN = 4, LK = 5;   // PN: sá»‘ lÃ n láº­p sáºµn lá»™ trÃ¬nh = sá»‘ nÃºt tá»‘i Ä‘a xin khÃ³a má»™t lÆ°á»£t (cá»¥m nÃºt ká» nhau); LK: chá»— giá»¯ khÃ³a (thÃªm 1 cho nÃºt vá»«a qua chÆ°a nháº£)

const HARD_GAP = .55;          // m, khe há»Ÿ cá»©ng tá»‘i thiá»ƒu Ä‘áº§u xe sau â€“ Ä‘uÃ´i xe trÆ°á»›c (QA Ä‘Ã²i â‰¥ 0,3)
const PATIENCE_S = 12;         // s dá»«ng liÃªn tá»¥c trÆ°á»›c khi xe bá» quy táº¯c chá»«a Ä‘á»§ chá»— thoÃ¡t há»™p nÃºt
const REL_F = .6;              // Ä‘uÃ´i xe qua REL_FÂ·Rz sau nÃºt thÃ¬ nháº£ khÃ³a (trÆ°á»›c Ä‘Ã¢y cáº£ Rz: giá»¯ khÃ³a ~5,3 s/xe, giao lá»™ bÃ£o hÃ²a dÃ¹ máº­t Ä‘á»™ tháº¥p)
const PRED_S = 1;              // s: Ä‘áº§u lÃ n ra tÃ­nh theo vá»‹ trÃ­ dá»± bÃ¡o (xe Ä‘ang cháº¡y sáº½ rá»i trÆ°á»›c khi xe chá» vÃ o tá»›i nÆ¡i)
const RELOCATE_M = 60, RELOCATE_STEP = 2;   // m: táº§m tÃ¬m chá»— trá»‘ng quanh vá»‹ trÃ­ cÅ© khi kÃ­ch hoáº¡t láº¡i
const BREAKER_S = 50;          // s, dá»«ng liÃªn tá»¥c quÃ¡ ngÆ°á»¡ng â†’ tÃ¡i sinh (bá»™ phÃ¡ káº¹t)
const LANE_W_MIN = 2.7, LANE_W_MAX = 3.6, LANE_W_SQUEEZE = 2.6;
const DRIVE_RANK = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1, living_street: 1, road: 1 };
const SPEED_BY_RANK = [0, 5.5, 8, 9.5, 11, 13.5];             // m/s
const DENSITY_BY_RANK = [0, 2.5, 9, 16, 24, 26];              // xe / km lÃ n (trÆ°á»›c há»‡ sá»‘ trung tÃ¢m vÃ  chuáº©n hÃ³a pool)
export const LIGHT_FACTOR = { day: .85, golden: 1, night: .5 };       // giá» vÃ ng = cao Ä‘iá»ƒm chiá»u; Ä‘Ãªm thÆ°a
const SIGNAL_CLUSTER_M = 80;                                   // m: Ä‘Ã¨n gáº§n hÆ¡n ngÆ°á»¡ng nÃ y chung pha
const SIGNAL_CYCLE = 44;                                       // s: xanh nhÃ³m 0 22 s, Ä‘á» chung 3 s, xanh nhÃ³m 1 16 s, Ä‘á» chung 3 s

export const TRAFFIC_KINDS = [
  { name: 'motorbike', length: 1.9, width: .7, height: 1.62, s0: 1.0, T: .8, a: 2.6, b: 3.2 },
  { name: 'car', length: 4.5, width: 1.8, height: 1.48, s0: 1.6, T: 1.1, a: 2.0, b: 3.0 },
  { name: 'bus', length: 12, width: 2.5, height: 3.2, s0: 2.2, T: 1.4, a: 1.2, b: 2.6 },
  { name: 'truck', length: 7.4, width: 2.3, height: 3.05, s0: 2.0, T: 1.3, a: 1.3, b: 2.7 }
];
const HEAVY = 2;                                               // kind â‰¥ HEAVY (buÃ½t, táº£i): chá»‰ cháº¡y Ä‘Æ°á»ng cáº¥p â‰¥ 2, trÃ¡nh ráº½ vÃ o háº»m
const MAX_LEN = Math.max(...TRAFFIC_KINDS.map(k => k.length));

// ---------------------------------------------------------------- tiá»‡n Ã­ch sá»‘
const profileAt = (p, s) => {
  if (s <= p[0]) return p[1];
  const n = p.length / 2; if (s >= p[(n - 1) * 2]) return p[(n - 1) * 2 + 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m * 2] <= s) lo = m; else hi = m; }
  const t = (s - p[lo * 2]) / Math.max(1e-9, p[hi * 2] - p[lo * 2]); return p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t;
};
export const hashU32 = n => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------------------------------------------------------------- dá»±ng máº¡ng lÃ n (thuáº§n dá»¯ liá»‡u, khÃ´ng THREE)
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
  // HÆ°á»›ng Ä‘i (rad, atan2(dz, dx)) á»Ÿ Ä‘áº§u/cuá»‘i cáº¡nh theo chiá»u váº½.
  const headAt = (e, atEnd) => { const c = E[e].c, n = c.length / 2; return atEnd ? Math.atan2(c[n * 2 - 1] - c[n * 2 - 3], c[n * 2 - 2] - c[n * 2 - 4]) : Math.atan2(c[3] - c[1], c[2] - c[0]); };
  // Tráº¡ng thÃ¡i st = e*2 + (dir>0 ? 0 : 1).
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
  // SCC (Tarjan láº·p) trÃªn tráº¡ng thÃ¡i + siÃªu nÃºt SUPER: tráº¡ng thÃ¡i tá»›i nÃºt biÃªn â†’ SUPER â†’ tráº¡ng thÃ¡i rá»i nÃºt biÃªn.
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
  // Khoáº£ng trá»‘ng hai bÃªn má»—i cáº¡nh giá»¯ láº¡i (khung chiá»u váº½): tá»›i tim cáº¡nh lÃ¡i Ä‘Æ°á»£c gáº§n nháº¥t song song (|cos| > 0,8),
  // cÃ¹ng cao Ä‘á»™ (Â±2 m) â€” Ä‘Æ°á»ng Ä‘Ã´i tÃ¡ch lÃ n (Äiá»‡n BiÃªn Phá»§, Cáº§u Kiá»‡u, Ba Son) cÃ³ tim cÃ¡ch nhau ~7,5 m nÃªn má»—i chiá»u chá»‰
  // Ä‘Æ°á»£c dÃ¹ng ná»­a khoáº£ng trá»‘ng; bá» 1 Ä‘oáº¡n gáº§n nÃºt (vÃ¹ng nÃºt Ä‘Ã£ cÃ³ khÃ³a). KhÃ´ng cÃ³ hÃ ng xÃ³m â†’ Infinity.
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
  // LÃ n theo tráº¡ng thÃ¡i: lÃ n 0 sÃ¡t lá» pháº£i; offset dÆ°Æ¡ng = bÃªn pháº£i chiá»u Ä‘i.
  const lanesOfSt = new Int32Array(NS).fill(-1), laneCountOfSt = new Uint8Array(NS);
  const L = { edge: [], dir: [], from: [], to: [], length: [], offset: [], k: [], n: [], width: [], rank: [], speed: [], st: [] };
  let statesKept = 0, squeezed = 0; const edgesKept = new Set();
  for (let st = 0; st < NS; st++) {
    if (!inScc(st)) continue;
    const e = st >> 1, ed = E[e], d = st & 1 ? -1 : 1, two = ed.oneway === 'no', W = widthOf(ed.road);
    const lanesTag = Math.max(1, Number(ed.lanes) || 1), n0 = Math.min(4, two ? Math.max(1, Math.floor(lanesTag / 2)) : lanesTag);
    const w0 = Math.min(LANE_W_MAX, Math.max(LANE_W_MIN, W / (two ? n0 * 2 : n0)));
    const hr = (d > 0 ? clearR[e] : clearL[e]) / 2 - .1, hl = (d > 0 ? clearL[e] : clearR[e]) / 2 - .1;   // ná»­a khoáº£ng trá»‘ng pháº£i/trÃ¡i theo chiá»u Ä‘i
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
  // "Co ngáº¯n" phÃ­a trong khÃºc cua giá»¯a cáº¡nh: lá»‡ch |lat| vÃ o phÃ­a trong Ä‘á»‰nh gáº¥p gÃ³c Î¸ rÃºt ngáº¯n quÃ£ng tháº­t â‰ˆ 2Â·|lat|Â·tan(Î¸/2)
  // â†’ xe cÃ¹ng lÃ n pháº£i giá»¯ thÃªm chá»«ng Ä‘Ã³ Ä‘á»ƒ thÃ¢n xe khÃ´ng chá»“ng nhau trÃªn Ä‘Æ°á»ng lá»‡ch (tá»‘i Ä‘a 6 m).
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
  // Káº¿ tiáº¿p theo tráº¡ng thÃ¡i (Ä‘Ã£ lá»c SCC) + gÃ³c ráº½ (+ pháº£i, âˆ’ trÃ¡i) + cÃ¹ng tÃªn Ä‘Æ°á»ng.
  const nextSt = new Array(NS);
  for (let st = 0; st < NS; st++) {
    if (lanesOfSt[st] < 0) continue;
    if (boundary(stTo(st))) { nextSt[st] = []; continue; }
    const ah = arriveHead(st), name = G.roads[E[st >> 1].road].name || '';
    nextSt[st] = succRaw(st).filter(x => lanesOfSt[x] >= 0).map(x => ({ st: x, turn: angleDiff(ah, departHead(x)), sameName: !!name && (G.roads[E[x >> 1].road].name || '') === name, rank: rankOf(x >> 1) }));
  }
  // NÃºt: sá»‘ lÃ n Ä‘á»• vÃ o, bÃ¡n kÃ­nh vÃ¹ng nÃºt, Ä‘Ã¨n.
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
  // Bá» ngang chiáº¿m dá»¥ng má»—i cáº¡nh (|offset| + ná»­a lÃ n lá»›n nháº¥t, cáº£ hai chiá»u): hai cáº¡nh gáº·p nhau táº¡i nÃºt dÆ°á»›i gÃ³c Ï† nhá»
  // chá»‰ tÃ¡ch háº³n sau r â‰¥ (extâ‚ + extâ‚‚ + 0,4)/sin Ï† â†’ vÃ¹ng nÃºt (váº¡ch dá»«ng) pháº£i lÃ¹i tá»›i Ä‘Ã³, tá»‘i Ä‘a 32 m.
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
    if ((inLanes[n] >= 2 || outLanes[n] >= 2) && !boundary(n)) { needsLock[n] = 1; controlledNodes++; }   // nháº­p hoáº·c tÃ¡ch: cáº§n khÃ³a
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
  // ÄÃ¨n cÃ¡c nÃºt gáº§n nhau (< 80 m) cÃ¹ng má»™t pha: xe xin khÃ³a chuá»—i nÃºt ká» nhau (liÃªn káº¿t ngáº¯n) cáº§n xanh á»Ÿ táº¥t cáº£ nÃºt cÃ¹ng lÃºc, náº¿u lá»‡ch pha ngáº«u nhiÃªn
  // thÃ¬ cÃ³ xe chá» cáº£ chá»¥c giÃ¢y dÃ¹ cáº£ cá»¥m Ä‘Ã£ xanh (má»™t nguyÃªn nhÃ¢n bá»™ phÃ¡ káº¹t).
  { const sg = []; for (let n = 0; n < NN; n++) if (signal[n]) sg.push(n);
    const root = new Map(sg.map(n => [n, n])), find = n => { while (root.get(n) !== n) n = root.get(n); return n; };
    for (let a = 0; a < sg.length; a++) for (let b = a + 1; b < sg.length; b++) if (Math.hypot(G.nodes[sg[a]].x - G.nodes[sg[b]].x, G.nodes[sg[a]].z - G.nodes[sg[b]].z) < SIGNAL_CLUSTER_M) { const ra = find(sg[a]), rb = find(sg[b]); if (ra !== rb) root.set(Math.max(ra, rb), Math.min(ra, rb)); }
    for (const n of sg) signalOffset[n] = signalOffset[find(n)]; }
  // Káº¿ hoáº¡ch Ä‘Ã¨n M1 (tÃ¹y chá»n): ghi Ä‘Ã¨ signal/signalOffset/arriveGroup cho nÃºt HÃ ng Xanh.
  let net_out_signalPlan = null;
  if (signalPlan) {
    const stTo = st => { const e = st >> 1; return nodeIndex.get(st & 1 ? G.edges[e].from : G.edges[e].to); };
    for (const n of signalPlan.signalNodes) {
      signal[n] = 1;
      signalOffset[n] = signalPlan.offset.get(n) ?? 0;
    }
    for (let st = 0; st < arriveGroup.length; st++) {
      const n = stTo(st);
      if (n !== undefined && signalPlan.signalNodes.includes(n)) arriveGroup[st] = signalPlan.arriveGroup[st];
    }
    net_out_signalPlan = signalPlan;
  }
  // LÃ n xuáº¥t phÃ¡t tá»« nÃºt biÃªn (Ä‘iá»ƒm tÃ¡i sinh), sáº¯p theo chá»‰ sá»‘.
  const spawnLanes = []; for (let l = 0; l < NL; l++) if (boundary(lanes.from[l])) spawnLanes.push(l);
  // HÃ¬nh há»c cáº¡nh: polyline pháº³ng, Ä‘á»™ dÃ i cá»™ng dá»“n, phÃ¡p tuyáº¿n Ä‘á»‰nh (trung bÃ¬nh hai Ä‘oáº¡n ká», hÆ°á»›ng pháº£i cá»§a chiá»u váº½).
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
  // Cáº§u bÃ¡n kÃ­nh bao quanh tá»«ng cáº¡nh (cull).
  const sphere = new Float32Array(NE * 4);
  for (const e of edgesKept) {
    const o = geoOff[e], n = E[e].c.length / 2; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = G.frame.groundY;
    for (let k = 0; k < n; k++) { minX = Math.min(minX, gx[o + k]); maxX = Math.max(maxX, gx[o + k]); minZ = Math.min(minZ, gz[o + k]); maxZ = Math.max(maxZ, gz[o + k]); }
    if (E[e].profile) for (let k = 1; k < E[e].profile.length; k += 2) maxY = Math.max(maxY, E[e].profile[k]);
    sphere[e * 4] = (minX + maxX) / 2; sphere[e * 4 + 1] = (G.frame.groundY + maxY) / 2 + 1.5; sphere[e * 4 + 2] = (minZ + maxZ) / 2;
    sphere[e * 4 + 3] = Math.hypot(maxX - minX, maxZ - minZ, maxY - G.frame.groundY) / 2 + 16;
  }
  // Kiá»ƒm tÄ©nh: má»i lÃ n khá»›p tag oneway.
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

// VÃ¹ng giao cáº¯t khÃ´ng cÃ³ nÃºt chung: hai lÃ n khÃ¡c cáº¡nh, khÃ´ng chung nÃºt (hoáº·c chung nÃºt nhÆ°ng xa ngoÃ i vÃ¹ng khÃ³a) mÃ  tim lÃ n
// Ä‘i gáº§n nhau < CROSS_R á»Ÿ cÃ¹ng cao Ä‘á»™ (nhÃ¡nh nháº­p cáº§u váº¯t qua mÃ©p cáº¡nh khÃ¡c, Ä‘áº§u dáº£i phÃ¢n cÃ¡châ€¦). KhÃ³a nÃºt khÃ´ng tháº¥y cÃ¡c cáº·p nÃ y,
// nÃªn má»—i vÃ¹ng lÃ  má»™t "token": xe chá»‰ vÃ o Ä‘oáº¡n [a, b] cá»§a lÃ n mÃ¬nh khi khÃ´ng cÃ³ xe á»Ÿ lÃ n xung Ä‘á»™t Ä‘ang giá»¯ cÃ¹ng vÃ¹ng.
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
  // Hai lÃ n ná»‘i tiáº¿p nhau (trá»±c tiáº¿p hoáº·c qua má»™t lÃ n ngáº¯n < 25 m) do bÃ¡m xe xá»­ lÃ½, khÃ´ng pháº£i giao cáº¯t.
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
  // Gom Ä‘iá»ƒm xung Ä‘á»™t thÃ nh vÃ¹ng (union-find theo khoáº£ng cÃ¡ch 10 m).
  const parent = new Int32Array(hits.length / 2).map((_, k) => k), find = k => { while (parent[k] !== k) k = parent[k] = parent[parent[k]]; return k; };
  const hg = new Map();
  for (let h = 0; h < hits.length / 2; h++) {
    const id = hits[h * 2], gx = Math.floor(xs[id] / 10), gz = Math.floor(zs[id] / 10);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of hg.get((gx + a) * 1048576 + gz + b) || []) {
      const j = hits[o * 2]; if (Math.hypot(xs[id] - xs[j], zs[id] - zs[j]) < 10 && Math.abs(ys[id] - ys[j]) < 1.5) parent[find(h)] = find(o);
    }
    const g = gx * 1048576 + gz; let arr = hg.get(g); if (!arr) hg.set(g, arr = []); arr.push(h);
  }
  const zoneOf = new Map(), spans = new Map(), pairs = new Set();   // spans: "zone:lane" â†’ [a, b]
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

// ---------------------------------------------------------------- mÃ´ phá»ng (thuáº§n JS, táº¥t Ä‘á»‹nh)
export function createTrafficSim31(net, { centre = [0, 0], poolTarget = POOL_TARGET, signalPlan = null, controller: controller0 = null, breakerS = BREAKER_S, seed = SEED } = {}) {
  let controller = controller0;
  const { lanes, NL, nextSt, lanesOfSt, laneCountOfSt, needsLock, Rz, signal, signalOffset, arriveGroup, arriveHead, spawnLanes, E, G } = net;
  const KL = TRAFFIC_KINDS.map(k => k.length), KW = TRAFFIC_KINDS.map(k => k.width);
  // ---- Bá»‘ trÃ­ pool ban Ä‘áº§u (táº¥t Ä‘á»‹nh): xe/km lÃ n theo cáº¥p Ã— há»‡ sá»‘ trung tÃ¢m, ráº£i Ä‘á»u dá»c lÃ n ngoÃ i vÃ¹ng nÃºt.
  const centrality = l => { const s = net.sphere, e = lanes.edge[l]; const d = Math.hypot(s[e * 4] - centre[0], s[e * 4 + 2] - centre[1]); return .35 + .65 * Math.max(0, 1 - d / 4200); };
  let raw = 0; const expect = new Float32Array(NL);
  for (let l = 0; l < NL; l++) { expect[l] = DENSITY_BY_RANK[lanes.rank[l]] * lanes.length[l] / 1000 * centrality(l); raw += expect[l]; }
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
  // ---- Tráº¡ng thÃ¡i xe.
  const lane = new Int32Array(N), s = new Float64Array(N), v = new Float32Array(N), lat = new Float32Array(N), jit = new Float32Array(N);
  const gen = new Uint32Array(N), active = new Uint8Array(N), wanted = new Uint8Array(N), selRank = new Float32Array(N), pending = new Uint8Array(N), kind = new Uint8Array(N), len = new Float32Array(N), wid = new Float32Array(N);
  const vf = new Float32Array(N), rng = new Uint32Array(N), path = new Int32Array(N * PN), next = new Int32Array(N), prevLane = new Int32Array(N);
  const pLane = new Int32Array(N), pS = new Float64Array(N), pGen = new Uint32Array(N), stopT = new Float32Array(N), lastStep = new Int32Array(N), waiting = new Uint8Array(N);
  const lastStepCrossed = new Int32Array(N).fill(-1);
  const lastS = new Float64Array(N).fill(-1);
  const lockNode = new Int32Array(N * LK), lockIn = new Int32Array(N * LK), lockOut = new Int32Array(N * LK), lockRemain = new Float32Array(N * LK);
  const rand = i => { let x = rng[i]; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; rng[i] = x; return x / 4294967296; };
  const laneCars = new Array(NL); const laneActive = new Uint8Array(NL); let activeLanes = [];
  // Khoáº£ng cÃ¡ch tháº­t (theo pose) khi xe dáº«n Ä‘ang cáº¯t gÃ³c trong vÃ¹ng nÃºt: quÃ£ng s khÃ´ng pháº£n Ã¡nh Ä‘Ãºng hÃ¬nh há»c Bezier ráº½ gáº¯t.
  const geoSim = createTrafficGeometry31(net, { jit, len }), PA = {}, PB = {};
  const geoGap = (i, o) => {
    geoSim.poseAt(i, lane[i], s[i], next[i], prevLane[i], PA); geoSim.poseAt(o, lane[o], s[o], next[o], prevLane[o], PB);
    const dx = PB.x - PA.x, dz = PB.z - PA.z; if (dx * PA.tx + dz * PA.tz <= 0) return Infinity;
    return Math.hypot(dx, dz) - (len[i] + len[o]) / 2 - .6;
  };
  // node â†’ [{car, inL, outL, straight}]: máº£ng theo chá»‰ sá»‘ nÃºt (nhanh hÆ¡n Map trong vÃ²ng xe), cÃ¹ng API get/set/delete/clear/values.
  const holders = (() => {
    const nn = G.nodes.length, a = new Array(nn).fill(undefined), seen = new Uint8Array(nn), used = [];
    return {
      get: n => a[n],
      set(n, v) { if (!seen[n]) { seen[n] = 1; used.push(n); } a[n] = v; },
      delete(n) { a[n] = undefined; },
      clear() { for (const n of used) { a[n] = undefined; seen[n] = 0; } used.length = 0; },
      *values() { for (const n of used) if (a[n]) yield a[n]; }
    };
  })();
  let reqPrev = new Map(), reqCur = new Map();
  // Sá»‘ khÃ³a Ä‘ang giá»¯ theo lÃ n vÃ o (lá»c nhanh trÆ°á»›c khi quÃ©t holders cá»§a nÃºt cuá»‘i lÃ n).
  const inHold = new Int32Array(NL);
  // Token vÃ¹ng giao cáº¯t khÃ´ng nÃºt (net.cross): zoneHold[z] = Map(lÃ n â†’ sá»‘ xe giá»¯); má»—i xe giá»¯ tá»‘i Ä‘a 2 token, nháº£ khi Ä‘uÃ´i qua b.
  const CZ = net.cross, zoneHold = new Map(), zTok = new Int32Array(N * 2).fill(-1), zLane = new Int32Array(N * 2), zRem = new Float32Array(N * 2);
  const counters = { t: 0, step: 0, edgeTransitions: 0, teleports: 0, onewayViolations: 0, gapViolations: 0, respawns: 0, breakerRespawns: 0, waitsTotal: 0, maxStopS: 0, perSecond: new Int32Array(32), lastSecond: 0, pendingFails: 0 };
  let fraction = 1, lightFactor = 1;
  // ---- Khu mÃ´ phá»ng (bÆ°á»›c H): region = null â†’ toÃ n thÃ nh phá»‘; {id, poly[x0,z0,x1,z1â€¦]} â†’ chá»‰ xe trÃªn cáº¡nh náº±m háº³n trong Ä‘a giÃ¡c.
  // insideLane: lÃ n thuá»™c cáº¡nh mÃ  má»i Ä‘á»‰nh náº±m trong khu; spawnList: lÃ n Ä‘iá»ƒm tÃ¡i sinh (nÃºt biÃªn tháº­t hoáº·c nÃºt trong khu ká» nÃºt ngoÃ i khu);
  // elig: xe Ä‘Æ°á»£c tÃ­nh vÃ o khu (Ä‘áº·t theo vá»‹ trÃ­ lÃºc setRegion; xe Ä‘ang chá» chá»— giá»¯ nguyÃªn, xe Ä‘áº·t/tÃ¡i sinh trong khu luÃ´n há»£p lá»‡).
  let region = null, spawnList = spawnLanes;
  const insideLane = new Uint8Array(NL).fill(1), elig = new Uint8Array(N).fill(1);

  const laneList = l => { let a = laneCars[l]; if (!a) { a = laneCars[l] = []; } if (!laneActive[l]) { laneActive[l] = 1; activeLanes.push(l); } return a; };
  const insertSorted = (l, i) => { const a = laneList(l); let k = 0; while (k < a.length && s[a[k]] < s[i]) k++; a.splice(k, 0, i); };
  const removeFrom = (l, i) => { const a = laneCars[l]; if (!a) return; const k = a.indexOf(i); if (k >= 0) a.splice(k, 1); };
  // Äá»‡m khi hai xe á»Ÿ hai lÃ n ná»‘i nhau qua gÃ³c nÃºt (Ä‘Æ°á»ng Bezier cáº¯t gÃ³c ngáº¯n hÆ¡n quÃ£ng s).
  // Äá»‡m qua gÃ³c nÃºt: Bezier cáº¯t gÃ³c ngáº¯n hÆ¡n quÃ£ng s; phÃ­a trong gÃ³c ráº½ Î¸ ngáº¯n thÃªm â‰ˆ 2Â·(|lat|+0,75)Â·tan(Î¸/2).
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
  // Cháº·n nhau khi mÃ´ phá»ng: chá»“ng dáº£i ngang + Ä‘á»‡m 0,45 m (thÃ¢n xe xoay khi vÃ o cua); trong vÃ¹ng nÃºt khÃ´ng Ä‘i song song.
  const blocks = (i, j) => Math.abs(jit[i] - jit[j]) < (wid[i] + wid[j]) / 2 + .45 || inCorner(i) || inCorner(j);

  // Láº­p lá»™ trÃ¬nh: chá»n tráº¡ng thÃ¡i káº¿ + lÃ n Ä‘Ã­ch theo gÃ³c ráº½.
  function planNext(i, l) {
    const st = lanes.st[l]; let cands = nextSt[st];
    if (region && cands) cands = cands.filter(c => insideLane[lanesOfSt[c.st]]);   // ra khá»i khu = nÃºt biÃªn
    if (!cands || !cands.length) return -2;   // tá»›i nÃºt biÃªn â†’ tÃ¡i sinh
    let total = 0; const w = [];
    // Xe buÃ½t (2,5 m) khÃ´ng chui Ä‘Æ°á»ng ná»™i bá»™ lÃ n 2,7 m: thÃ¢n dÃ i quÃ©t sang lÃ n ngÆ°á»£c chiá»u khi ráº½; chá»‰ Ä‘i khi khÃ´ng cÃ²n lá»‘i khÃ¡c.
    const busAvoid = kind[i] >= HEAVY && cands.some(c => c.rank >= 2);
    for (const c of cands) {
      const a = Math.abs(c.turn); let x = a < .6 ? 5 : a < 2.4 ? 1.1 : .12;
      if (c.sameName) x *= 2.2; x *= .55 + .25 * c.rank;
      if (busAvoid && c.rank < 2) x = 0;
      // Xe buÃ½t khÃ´ng ráº½ cáº¯t ngang lÃ n bÃªn cáº¡nh (ráº½ pháº£i tá»« lÃ n trong / ráº½ trÃ¡i tá»« lÃ n ngoÃ i): thÃ¢n 10,5 m quÃ©t qua xe chá» á»Ÿ váº¡ch.
      if (kind[i] >= HEAVY && a >= .6 && (c.turn > 0 ? lanes.k[l] > 0 : lanes.k[l] < lanes.n[l] - 1)) x *= 1e-4;
      w.push(x); total += x;
    }
    let r = rand(i) * total, pick = 0; for (; pick < w.length - 1; pick++) { r -= w[pick]; if (r < 0) break; }
    const c = cands[pick], n2 = laneCountOfSt[c.st], base = lanesOfSt[c.st];
    const k2 = Math.abs(c.turn) < .6 ? Math.min(lanes.k[l], n2 - 1) : c.turn > 0 ? 0 : n2 - 1;
    return base + k2;
  }
  function fillPath(i) { for (let p = 0; p < PN; p++) { const prev = p === 0 ? lane[i] : path[i * PN + p - 1]; path[i * PN + p] = prev >= 0 ? planNext(i, prev) : -2; } next[i] = path[i * PN]; }
  function shiftPath(i) { for (let p = 0; p < PN - 1; p++) path[i * PN + p] = path[i * PN + p + 1]; const prev = path[i * PN + PN - 2]; path[i * PN + PN - 1] = prev >= 0 ? planNext(i, prev) : -2; next[i] = path[i * PN]; }
  const straightMove = (inL, outL) => { const c = nextSt[lanes.st[inL]]?.find(x => x.st === lanes.st[outL]); return !!c && Math.abs(c.turn) < .87; };

  // ---- KhÃ³a nÃºt.
  const relR = n => Rz[n] * REL_F;   // bÃ¡n kÃ­nh tÃ­nh tá»« nÃºt mÃ  Ä‘uÃ´i xe qua thÃ¬ nháº£ khÃ³a
  const holdsFor = (i, node) => { for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] === node) return k; return -1; };
  // BiÃªn ngang cá»§a xe khi Ä‘á»•i lÃ n qua nÃºt: ná»­a rá»™ng + lá»‡ch xe mÃ¡y + Ä‘uÃ´i xe xoay (â‰ˆ 10 % chiá»u dÃ i, xe buÃ½t ~1 m).
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
      // Song song cÃ¹ng cáº·p tráº¡ng thÃ¡i: dáº£i ngang quÃ©t (lÃ n vÃ o â†’ lÃ n ra, cá»™ng biÃªn thÃ¢n xe) khÃ´ng Ä‘Æ°á»£c chá»“ng nhau (nÃºt cÃ³ tim Ä‘Æ°á»ng lá»‡ch).
      if (lanes.st[inL] === lanes.st[h.inL]) return lanes.st[outL] === lanes.st[h.outL] && sweepApart(inL, outL, sideMargin(i), h.inL, h.outL, sideMargin(h.car ?? -1));
      // Äá»‘i Ä‘áº§u Ä‘i tháº³ng: chá»‰ khi trÃ¡nh nhau trÃªn cÃ¹ng cáº¡nh hai chiá»u; hai cáº¡nh khÃ¡c nhau tá»a gÃ³c nhá» (Ä‘áº§u dáº£i phÃ¢n cÃ¡ch) váº«n chá»“ng thÃ¢n xe gáº§n nÃºt.
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
  // Thá»­ láº¥y khÃ³a cho chuyá»ƒn Ä‘á»™ng (inL â†’ outL) táº¡i nÃºt cuá»‘i inL, kÃ¨m chuá»—i nÃºt káº¿ náº¿u lÃ n ra quÃ¡ ngáº¯n Ä‘á»ƒ dá»«ng.
  function tryAcquire(i, inL, depth, plan, ignorePriority) {
    const node = lanes.to[inL], outL = depth === 0 ? path[i * PN] : path[i * PN + depth];
    if (outL < 0) return true;
    if (!needsLock[node]) { return true; }
    if (holdsFor(i, node) >= 0) return true;
    const st = lanes.st[inL];
    // ÄÃ¨n chá»‰ cháº·n á»Ÿ nÃºt cÃ³ Ä‘Ã¨n Ä‘áº§u tiÃªn trÃªn chuá»—i khÃ³a: chuá»—i nÃºt ká» nhau (liÃªn káº¿t ngáº¯n) cÃ³ Ä‘Ã¨n lá»‡ch nhÃ³m (xanh nhÃ³m 0 / nhÃ³m 1 khÃ´ng bao giá» trÃ¹ng)
    // sáº½ khÃ´ng bao giá» cÃ³ Ä‘á»§ xanh cÃ¹ng lÃºc â†’ xe Ä‘á»©ng vÄ©nh viá»…n; xe Ä‘Ã£ giá»¯/Ä‘ang xin má»™t nÃºt cÃ³ Ä‘Ã¨n coi cáº£ cá»¥m lÃ  má»™t giao lá»™.
    if (!ignorePriority && !green(node, st) && !sigHeld(i, plan) && !(controller && controller.runsRed(i, node, st, counters.t))) return false;
    const hs = holders.get(node) || [];
    for (const h of hs) if (h.car !== i && !compatible(inL, outL, h, i)) return false;
    for (const p of plan) if (p.node === node && !(p.inL === inL) && !compatible(inL, outL, { car: i, inL: p.inL, outL: p.outL, straight: straightMove(p.inL, p.outL) }, i)) return false;
    // Chá»— trá»‘ng á»Ÿ lÃ n ra: Ä‘uÃ´i xe Ä‘áº§u tiÃªn (cÃ¹ng dáº£i ngang) pháº£i Ä‘á»§ xa Ä‘á»ƒ xe lá»t háº³n khá»i váº¡ch nÃºt.
    // Chá» quÃ¡ PATIENCE_S thÃ¬ nhÆ°á»£ng bá»™ quy táº¯c "khÃ´ng vÃ o há»™p náº¿u chÆ°a thoÃ¡t Ä‘Æ°á»£c" (vÃ²ng/cá»¥m nÃºt ngáº¯n cÃ³ hai xe lÃ  tá»± cháº·n nhau):
    // chá»‰ cáº§n chá»— cho thÃ¢n xe ná»‘i Ä‘uÃ´i xe Ä‘áº§u lÃ n ra; va cháº¡m váº«n do IDM + káº¹p khe cá»©ng báº£o Ä‘áº£m.
    const need = stopT[i] > PATIENCE_S ? len[i] + HARD_GAP + 1.5 : Math.min(lanes.length[outL] - .2, Rz[node] + len[i] + 1.5);
    if (firstRear(outL, i, true, PRED_S) < need) return false;
    plan.push({ node, inL, outL });
    // Chá»— dá»«ng trÃªn lÃ n ra (trÆ°á»›c váº¡ch nÃºt káº¿) pháº£i Ä‘á»ƒ Ä‘uÃ´i xe ra khá»i vÃ¹ng nÃºt nÃ y, náº¿u khÃ´ng xe Ä‘á»©ng cháº¯n giá»¯a nÃºt: xin luÃ´n khÃ³a nÃºt káº¿.
    const node2 = lanes.to[outL], stop2 = lanes.length[outL] - Rz[node2] - len[i] / 2;
    if (needsLock[node2] && stop2 - len[i] / 2 < Rz[node] + .3 && depth < PN - 1) { if (!tryAcquire(i, outL, depth + 1, plan, ignorePriority)) return false; }
    // NhÆ°á»ng á»Ÿ nÃºt khÃ´ng Ä‘Ã¨n: chá»‰ xe Ä‘Ã£ "sáºµn sÃ ng" (tÆ°Æ¡ng thÃ­ch + cÃ³ chá»— + chuá»—i nÃºt káº¿ thÃ´ng) má»›i tranh lÆ°á»£t, theo cáº¥p Ä‘Æ°á»ng + thá»i gian chá»;
    // xe chÆ°a Ä‘i Ä‘Æ°á»£c thÃ¬ khÃ´ng giá»¯ lÆ°á»£t (trÃ¡nh cháº·n vÃ´ háº¡n).
    const managed = signalPlan && signalPlan.signalNodes.includes(node);
    if (!ignorePriority && !signal[node] && depth === 0 && !managed) {
      const prio = lanes.rank[inL] * 10 + stopT[i] * 1.5 + (i % 997) * 1e-6;
      const cur = reqCur.get(node); if (!cur || prio > cur.p) reqCur.set(node, { p: prio, car: i });
      const prev = reqPrev.get(node); if (prev && prev.car !== i && prev.p > prio && active[prev.car] && lanes.to[lane[prev.car]] === node && holdsFor(prev.car, node) < 0) return false;
    }
    return true;
  }
  // inL/depth: khÃ³a nÃºt xa hÆ¡n trÃªn lá»™ trÃ¬nh (lÃ n káº¿ quÃ¡ ngáº¯n, xe pháº£i xin trÆ°á»›c khi rá»i lÃ n hiá»‡n táº¡i).
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

  // ---- Token vÃ¹ng giao cáº¯t khÃ´ng nÃºt.
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
  // Khoáº£ng tá»›i Ä‘áº§u vÃ¹ng chÆ°a xin Ä‘Æ°á»£c (Infinity náº¿u Ä‘Æ°á»ng thÃ´ng); xin token cho cÃ¡c vÃ¹ng trong táº§m phanh.
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
  // Xe Ä‘áº·t/kÃ­ch hoáº¡t giá»¯a vÃ¹ng: pháº£i xin Ä‘Æ°á»£c má»i token vÃ¹ng Ä‘ang cháº¡m thÃ¢n xe.
  function claimInside(i, l, si) {
    for (let q = CZ.off[l]; q < CZ.off[l + 1]; q++) {
      const z = CZ.zone[q]; if (CZ.a[q] > si + len[i] / 2 || CZ.b[q] < si - len[i] / 2 || holdsZone(i, z)) continue;
      if (!(zoneFree(z, l) && takeZone(i, z, l, CZ.b[q] - (si - len[i] / 2)))) { for (let k = 0; k < 2; k++) dropZone(i, k); return false; }
    }
    return true;
  }

  // ---- Äáº·t xe vÃ o lÃ n (kÃ­ch hoáº¡t / tÃ¡i sinh) náº¿u Ä‘á»§ chá»— cáº£ trÆ°á»›c vÃ  sau.
  // tight: kÃ­ch hoáº¡t láº¡i táº¡i chá»— cÅ© (tráº¡ng thÃ¡i Ä‘Ã³ng bÄƒng vá»‘n há»£p lá»‡) chá»‰ cáº§n khe vi pháº¡m 0,3 m + Ä‘á»‡m nhÆ° khi bÃ¡m xe; Ä‘áº·t má»›i thÃ¬ rá»™ng hÆ¡n.
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
  // Chá»— cÅ© Ä‘Ã£ bá»‹ xe khÃ¡c chiáº¿m: tÃ¬m chá»— trá»‘ng gáº§n nháº¥t trong táº§m RELOCATE_M cÃ¹ng lÃ n (rá»“i cÃ¡c lÃ n cÃ¹ng tráº¡ng thÃ¡i), ngoÃ i vÃ¹ng nÃºt,
  // Ä‘á»ƒ xe há»“i tá»©c thÃ¬ thay vÃ¬ chá» tÃ¡i sinh á»Ÿ nÃºt biÃªn (sau sim dÃ i ~2 % xe khÃ´ng cÃ²n chá»— cÅ©).
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
  // KÃ­ch hoáº¡t láº¡i táº¡i chá»— cÅ© (tráº¡ng thÃ¡i Ä‘Ã³ng bÄƒng); trong vÃ¹ng nÃºt pháº£i láº¥y láº¡i khÃ³a (bá» qua Æ°u tiÃªn/Ä‘Ã¨n).
  function reactivate(i) {
    const l = lane[i];
    if (!spotFree(i, l, s[i], true) || !claimInside(i, l, s[i])) return false;
    const node = lanes.to[l], stopPos = lanes.length[l] - Rz[node] - len[i] / 2;
    insertSorted(l, i); active[i] = 1; pending[i] = 0;
    if (needsLock[node] && s[i] > stopPos && path[i * PN] >= 0 && !acquire(i, true)) { removeFrom(l, i); releaseAll(i); active[i] = 0; return false; }
    // Äang trong vÃ¹ng sau nÃºt (Ä‘uÃ´i chÆ°a qua): láº¥y láº¡i khÃ³a nÃºt Ä‘áº§u lÃ n.
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

  // ---- Chá»n táº­p xe hoáº¡t Ä‘á»™ng theo tá»‰ lá»‡ F.
  // Háº¡ng khÃ´ng gian: trong má»—i Ã´ 200 m (theo vá»‹ trÃ­ á»Ÿ bÆ°á»›c hiá»‡n táº¡i) xe Ä‘Æ°á»£c xáº¿p háº¡ng (xe Ä‘ang cháº¡y trÆ°á»›c, rá»“i theo hash(id)),
  // selRank = (k + 1 âˆ’ u_Ã´)/n_Ã´ vá»›i u_Ã´ = hash(Ã´) âˆˆ [0, 1) â†’ ngÆ°á»¡ng F láº¥y â‰ˆ FÂ·n_Ã´ xe má»—i Ã´, khÃ´ng Ã´ nÃ o bá»‹ lÃ m trá»‘ng, táº­p lá»“ng nhau khi F Ä‘á»•i.
  // Tá»•ng sá»‘ xe KHÃ”NG phá»¥ thuá»™c vá»‹ trÃ­: láº¥y Ä‘Ãºng Q = round(FÂ·N) xe cÃ³ háº¡ng tháº¥p nháº¥t toÃ n cá»¥c (xe signature Ä‘ang trÃªn cáº§u luÃ´n Ä‘Æ°á»£c giá»¯
  // vÃ  tÃ­nh vÃ o Q; chá»‰ khi sá»‘ xe signature > Q má»›i vÆ°á»£t Q). Nhá» váº­y setFraction(1) hoáº·c Ä‘Æ°a F vá» giÃ¡ trá»‹ cÅ© khÃ´i phá»¥c Ä‘Ãºng tá»•ng cÅ©
  // dÃ¹ mÃ´ phá»ng Ä‘Ã£ cháº¡y bao lÃ¢u; trÆ°á»›c Ä‘Ã¢y tá»•ng = Î£_Ã´ floor(FÂ·n_Ã´ + u_Ã´) Ä‘á»•i theo cÃ¡ch xe phÃ¢n bá»‘ vÃ o Ã´ nÃªn trÃ´i vÃ i chá»¥c xe.
  // Háº¡ng nhá»› theo bÆ°á»›c nÃªn gá»i láº¡i cÃ¹ng F trong cÃ¹ng bÆ°á»›c â†’ cÃ¹ng táº­p.
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
  // ÄÃ¡nh dáº¥u wanted: xe signature Ä‘ang hoáº¡t Ä‘á»™ng trÆ°á»›c (háº¡ng âˆ’1), rá»“i theo selRank, hoÃ  theo id; láº¥y max(Q, sá»‘ signature) xe Ä‘áº§u.
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
    // KhÃ´ng kÃ­ch hoáº¡t láº¡i táº¡i chá»— Ä‘Æ°á»£c (xe khÃ¡c Ä‘Ã£ tá»›i) â†’ tÃ¡i sinh ngay á»Ÿ nÃºt biÃªn Ä‘á»ƒ sá»‘ xe khá»›p tá»‰ lá»‡ ngay láº­p tá»©c.
    for (let i = 0; i < N; i++) if (wanted[i] && !active[i]) { if (reactivate(i)) { pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; } else if (!relocate(i) && !respawn(i, false, 48)) pending[i] = 1; }
    return activeCount();
  }
  function activeCount() { let n = 0; for (let i = 0; i < N; i++) n += active[i]; return n; }

  // ---- Khu mÃ´ phá»ng (bÆ°á»›c H). Há»£p Ä‘á»“ng: setRegion(null) = toÃ n thÃ nh phá»‘; setRegion({id, polygon:[[x,z],â€¦], margin?}) tá»a Ä‘á»™ cáº£nh.
  // Xe ngoÃ i khu bá»‹ táº¯t; xe chá»‰ sinh/tÃ¡i sinh á»Ÿ nÃºt trong khu ká» nÃºt ngoÃ i khu (hoáº·c nÃºt biÃªn tháº­t trong khu); Ä‘i tá»›i cáº¡nh khÃ´ng náº±m háº³n trong khu
  // thÃ¬ coi nhÆ° tá»›i nÃºt biÃªn (tÃ¡i sinh trong khu). F Ã¡p lÃªn táº­p xe thuá»™c khu: Q = round(FÂ·n_khu), cÃ¹ng tÃ­nh cháº¥t khÃ´i phá»¥c cá»§a setFraction.
  // BÆ°á»›c H Â· T1: chá»n cáº¡nh/nÃºt báº±ng Ä‘a giÃ¡c Ná»šI má»™t biÃªn margin (máº·c Ä‘á»‹nh 0 = há»£p Ä‘á»“ng cÅ©, Ä‘a giÃ¡c thuáº§n): Ä‘iá»ƒm Ä‘Æ°á»£c coi
  // lÃ  "trong khu" khi náº±m trong Ä‘a giÃ¡c hoáº·c cÃ¡ch Ä‘a giÃ¡c â‰¤ margin. Nhá» váº­y cáº¡nh váº¯t ranh (cáº§u ná»‘i hai khu) thuá»™c khu á»Ÿ
  // Cáº¢ hai bá» â‡’ xe trÃªn cáº§u hiá»‡n á»Ÿ cáº£ hai khu ká» thay vÃ¬ biáº¿n máº¥t á»Ÿ má»i khu (trÆ°á»›c Ä‘Ã¢y chá»‰ dÃ¹ng cáº¡nh cÃ³ má»i Ä‘á»‰nh trong
  // Ä‘a giÃ¡c â‡’ ~4 % xe trÃªn cáº¡nh váº¯t ranh khÃ´ng thuá»™c khu nÃ o). CÃ¹ng phÃ©p thá»­ vá»›i city-region-31.js regionTrafficContains.
  const nodeIdx = new Map(); G.nodes.forEach((n, k) => nodeIdx.set(n.id, k));
  const inPoly = (poly, x, z) => { let c = false; for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) { const xa = poly[a], za = poly[a + 1], xb = poly[b], zb = poly[b + 1]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c; } return c; };
  // Khoáº£ng cÃ¡ch tá»« Ä‘iá»ƒm tá»›i Ä‘a giÃ¡c pháº³ng (tá»›i Ä‘oáº¡n gáº§n nháº¥t): dÃ¹ng cho biÃªn ná»›i.
  const distPoly = (poly, x, z) => { let best = Infinity; for (let a = 0, b = poly.length - 2; a < poly.length; b = a, a += 2) { const xa = poly[a], za = poly[a + 1], sx = poly[b] - xa, sz = poly[b + 1] - za, l = sx * sx + sz * sz, t = l ? Math.max(0, Math.min(1, ((x - xa) * sx + (z - za) * sz) / l)) : 0; best = Math.min(best, Math.hypot(xa + sx * t - x, za + sz * t - z)); } return best; };
  function setRegion(reg) {
    finishStep();
    if (!reg) { region = null; insideLane.fill(1); spawnList = spawnLanes; }
    else {
      const pts = reg.polygon, margin = reg.margin ?? 0;
      if (typeof reg.id !== 'string' || !Array.isArray(pts) || pts.length < 3 || !pts.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) throw new TypeError('setRegion: cáº§n {id: string, polygon: [[x, z], â€¦â‰¥ 3 Ä‘iá»ƒm], margin?: sá»‘ â‰¥ 0} hoáº·c null');
      if (!Number.isFinite(margin) || margin < 0) throw new TypeError('setRegion: margin pháº£i lÃ  sá»‘ há»¯u háº¡n â‰¥ 0');
      const poly = new Float64Array(pts.length * 2); pts.forEach((p, k) => { poly[k * 2] = p[0]; poly[k * 2 + 1] = p[1]; });
      const inRegion = margin > 0 ? (x, z) => inPoly(poly, x, z) || distPoly(poly, x, z) <= margin : (x, z) => inPoly(poly, x, z);
      const inNode = new Uint8Array(G.nodes.length); for (let n = 0; n < inNode.length; n++) inNode[n] = inRegion(G.nodes[n].x, G.nodes[n].z) ? 1 : 0;
      const inEdge = new Uint8Array(net.NE);
      for (let e = 0; e < net.NE; e++) { const c = E[e].c; let ok = inNode[nodeIdx.get(E[e].from)] && inNode[nodeIdx.get(E[e].to)]; for (let k = 0; ok && k < c.length; k += 2) ok = inRegion(c[k], c[k + 1]); inEdge[e] = ok ? 1 : 0; }
      for (let l = 0; l < NL; l++) insideLane[l] = inEdge[lanes.edge[l]];
      const edgeNode = (e2, end) => nodeIdx.get(end === 0 ? E[e2].to : E[e2].from);
      spawnList = [];
      for (let l = 0; l < NL; l++) {
        if (!insideLane[l]) continue;
        const n = lanes.from[l], nd = G.nodes[n];
        if (nd.kind === 'boundary' || nd.adj.some(([e2, end]) => !inNode[edgeNode(e2, end)])) spawnList.push(l);
      }
      region = { id: reg.id, poly, margin };
    }
    for (let i = 0; i < N; i++) elig[i] = !region || pending[i] ? 1 : insideLane[lane[i]];
    // Lá»™ trÃ¬nh: giá»¯ Ä‘oáº¡n cÃ²n há»£p lá»‡, láº­p láº¡i Ä‘oáº¡n trá» ra ngoÃ i khu (hoáº·c Ä‘oáº¡n -2 nay Ä‘i tiáº¿p Ä‘Æ°á»£c); xe Ä‘Ã£ giá»¯ khÃ³a nÃºt khÃ´ng Ä‘á»•i lÃ n káº¿.
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
      vf[i] = k === 0 ? .85 + rand(i) * .35 : k === 1 ? .9 + rand(i) * .2 : .8 + rand(i) * .1;   // buÃ½t vÃ  táº£i cÃ¹ng dáº£i
      lane[i] = l; s[i] = si; prevLane[i] = -1; v[i] = lanes.speed[l] * vf[i] * .7; lat[i] = lanes.offset[l] + jit[i]; stopT[i] = 0; waiting[i] = 0;
      fillPath(i);
    }
    for (let i = 0; i < N; i++) elig[i] = region ? insideLane[lane[i]] : 1;
    // Chá»n táº­p theo tá»‰ lá»‡ hiá»‡n táº¡i (ban Ä‘áº§u chÆ°a xe nÃ o hoáº¡t Ä‘á»™ng nÃªn kÃ­ch hoáº¡t tá»« tráº¡ng thÃ¡i gá»‘c).
    rankCells();
    chooseWanted(Math.max(0, Math.min(1, fraction * lightFactor)), false);
    for (let i = 0; i < N; i++) if (wanted[i]) { if (claimInside(i, lane[i], s[i])) { insertSorted(lane[i], i); active[i] = 1; } else pending[i] = 1; }
    for (let i = 0; i < N; i++) { pLane[i] = lane[i]; pS[i] = s[i]; pGen[i] = gen[i]; }
  }

  // ---- Má»™t bÆ°á»›c mÃ´ phá»ng.
  function updateCar(i, l, idx) {
    const K = TRAFFIC_KINDS[kind[i]], Li = len[i], list = laneCars[l];
    let laneLen = lanes.length[l], si = s[i], vi = v[i];
    // ÄÆ°á»ng táº¯t cho xe Ä‘ang Ä‘á»©ng sÃ¡t sau xe cÅ©ng Ä‘ang Ä‘á»©ng (Ä‘uÃ´i hÃ ng chá»): IDM cháº¯c cháº¯n cho v = 0, chá»‰ cá»™ng thá»i gian dá»«ng.
    if (vi === 0 && idx + 1 < list.length) {
      const o = list[idx + 1];
      if (v[o] === 0 && blocks(i, o) && s[o] - len[o] / 2 - (si + Li / 2) - lanes.pinch[l] < K.s0 + .3) {
        stopT[i] += STEP; if (stopT[i] > counters.maxStopS) counters.maxStopS = stopT[i];
        if (stopT[i] > breakerS) respawn(i, true);
        return;
      }
    }
    // Xe dáº«n trong lÃ n (cÃ¹ng dáº£i ngang).
    let gap = Infinity, vl = 0;
    for (let j = idx + 1; j < list.length && j <= idx + 8; j++) { const o = list[j]; if (blocks(i, o)) { gap = s[o] - len[o] / 2 - (si + Li / 2) - lanes.pinch[l] - (inCorner(o) ? cornerPad(i, o) : 0); if (gap < 12 && next[o] !== next[i] && s[o] > laneLen - Rz[lanes.to[l]]) gap = Math.min(gap, geoGap(i, o)); vl = v[o]; break; } }
    // NhÃ¬n qua ranh giá»›i cáº¡nh theo lá»™ trÃ¬nh (tá»‘i Ä‘a 3 lÃ n, 70 m).
    const node = lanes.to[l], out0 = path[i * PN];
    // Xe cÃ¹ng lÃ n vÃ o Ä‘Ã£ qua nÃºt nhÆ°ng chÆ°a nháº£ khÃ³a (Ä‘ang cáº¯t gÃ³c) váº«n lÃ  xe dáº«n, dÃ¹ khÃ¡c hÆ°á»›ng ra.
    if (inHold[l] > 0 && needsLock[node] && laneLen - si < 60) { const hs = holders.get(node); if (hs) for (const h of hs) { const o = h.car; if (o === i || h.inL !== l || lane[o] === l || !active[o]) continue; const past = s[o] + (lane[o] !== h.outL ? lanes.length[h.outL] : 0); let g = laneLen - (si + Li / 2) + past - len[o] / 2 - cornerPad(i, o, h.inL, h.outL); if (g < 12) g = Math.min(g, geoGap(i, o)); if (g < gap) { gap = g; vl = v[o]; } } }
    let holding = out0 < 0 || !needsLock[node] || holdsFor(i, node) >= 0;
    const front = si + Li / 2;
    if (!holding && out0 >= 0 && front > laneLen - Rz[node] - (vi * vi / (2 * K.b) + 6)) holding = acquire(i);
    if (gap === Infinity) {
      let dist = laneLen - front;
      for (let p = 0; p < PN && dist < 70; p++) {
        const nl = path[i * PN + p]; if (nl < 0) break;
        // váº¡ch dá»«ng cá»§a nÃºt cuá»‘i lÃ n káº¿ (khi chÆ°a giá»¯ khÃ³a) cÅ©ng lÃ  váº­t cáº£n.
        const a = laneCars[nl];
        let found = false;
        if (a) for (const o of a) { if (o !== i && blocks(i, o)) { const g = Math.min(dist + s[o] - len[o] / 2 - Math.max(lanes.pinch[l], lanes.pinch[nl]) - cornerPad(i, o, p === 0 ? l : path[i * PN + p - 1], nl), dist + s[o] < 14 && (p > 0 || (prevLane[o] >= 0 && prevLane[o] !== l)) ? geoGap(i, o) : Infinity); if (g < gap) { gap = g; vl = v[o]; } found = true; break; } }
        if (found) break;
        const n2 = lanes.to[nl], nn = path[i * PN + p + 1];
        if (holding && p < PN - 1 && nn !== undefined && nn >= 0 && needsLock[n2] && holdsFor(i, n2) < 0) {
          const g = dist + lanes.length[nl] - Rz[n2];
          // Váº¡ch dá»«ng nÃºt káº¿ Ä‘Ã£ trong táº§m phanh: xin khÃ³a luÃ´n tá»« Ä‘Ã¢y, náº¿u khÃ´ng xe sáº½ Ä‘á»©ng chá» mÃ£i á»Ÿ lÃ n trÆ°á»›c (khÃ³a chá»‰ xin á»Ÿ lÃ n cuá»‘i nÃºt).
          if (!(holding && g < vi * vi / (2 * K.b) + 6 && acquire(i, false, nl, p + 1))) { if (g < gap) { gap = g; vl = 0; } break; }
        }
        dist += lanes.length[nl];
      }
    }
    { const g = crossGate(i, l, si, Li, vi * vi / (2 * K.b) + 8); if (g < gap) { gap = g; vl = 0; } }
    let stopLimit = Infinity;
    if (!holding) { const g = laneLen - Rz[node] - front; if (g < gap) { gap = g; vl = 0; } stopLimit = laneLen - Rz[node] - Li / 2; }
    // IDM rÃºt gá»n.
    const v0 = lanes.speed[l] * vf[i] * (kind[i] >= HEAVY ? .85 : 1);
    const dv = vi - vl, sStar = K.s0 + Math.max(0, vi * K.T + vi * dv / (2 * Math.sqrt(K.a * K.b)));
    const r = vi / v0, r2 = r * r, q = gap < Infinity ? sStar / Math.max(.1, gap) : 0;
    let acc = K.a * (1 - r2 * r2 - q * q);
    if (acc < -9) acc = -9;
    let vn = Math.max(0, vi + acc * STEP), ds = (vi + vn) * .5 * STEP;
    const maxDs = Math.max(0, gap - HARD_GAP);
    if (ds > maxDs) { ds = maxDs; vn = Math.min(vn, vl, ds / STEP); }
    if (si + ds > stopLimit) { ds = Math.max(0, stopLimit - si); vn = Math.min(vn, ds / STEP); }
    si += ds;
    // Giáº£m quÃ£ng cÃ²n láº¡i cá»§a khÃ³a Ä‘Ã£ qua nÃºt; nháº£ khi Ä‘uÃ´i xe rá»i vÃ¹ng nÃºt.
    for (let k = 0; k < LK; k++) if (lockNode[i * LK + k] >= 0 && lockRemain[i * LK + k] !== Infinity) { lockRemain[i * LK + k] -= ds; if (lockRemain[i * LK + k] <= 0) releaseSlot(i, k); }
    for (let k = 0; k < 2; k++) if (zTok[i * 2 + k] >= 0) { zRem[i * 2 + k] -= ds; if (zRem[i * 2 + k] <= 0) dropZone(i, k); }
    // Chuyá»ƒn cáº¡nh.
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
    // Thá»i gian dá»«ng, chá» á»Ÿ váº¡ch, phÃ¡ káº¹t.
    if (vn < .15) {
      stopT[i] += STEP; if (stopT[i] > counters.maxStopS) counters.maxStopS = stopT[i];
      if (!holding && !waiting[i]) { waiting[i] = 1; counters.waitsTotal++; }
      if (stopT[i] > breakerS) respawn(i, true);
    } else { stopT[i] = 0; waiting[i] = 0; }
  }

  // ---- Má»™t bÆ°á»›c chia Ä‘Æ°á»£c thÃ nh nhiá»u lÃ¡t (theo lÃ n) Ä‘á»ƒ tráº£i CPU qua cÃ¡c khung hÃ¬nh: beginStep â†’ workStep(n)â€¦ â†’ endStep.
  // Giá»¯a cÃ¡c lÃ¡t tráº¡ng thÃ¡i lÃ  tráº¡ng thÃ¡i trung gian há»£p lá»‡ cá»§a Ä‘Ãºng má»™t bÆ°á»›c tuáº§n tá»±; káº¿t quáº£ cuá»‘i giá»‘ng há»‡t step() má»™t láº§n.
  let inStep = false, stepLanes = null, stepPos = 0;
  const swapReq = () => { const t = reqPrev; reqPrev = reqCur; reqCur = t; reqCur.clear(); };
  function beginStep() {
    if (inStep) finishStep();
    counters.step++; counters.t = counters.step * STEP;
    if (controller) controller.update(counters.t, buildQueues());
    const sec = Math.floor(counters.t); if (sec !== counters.lastSecond) { counters.lastSecond = sec; counters.perSecond[sec & 31] = 0; }
    pLane.set(lane); pS.set(s); pGen.set(gen);
    swapReq();
    // TÃ¡i sinh xe chá» chá»— (táº¥t Ä‘á»‹nh theo chá»‰ sá»‘).
    for (let i = 0; i < N; i++) if (pending[i] && wanted[i]) { if (!(gen[i] === pGen[i] && reactivate(i)) && !relocate(i)) respawn(i, false, 32); }
    stepLanes = activeLanes.slice(); stepPos = 0; inStep = true;
  }
  // Cáº­p nháº­t tiáº¿p cÃ¡c lÃ n cá»§a bÆ°á»›c Ä‘ang dá»Ÿ, dá»«ng á»Ÿ ranh giá»›i lÃ n khi Ä‘Ã£ cáº­p nháº­t â‰¥ maxCars xe; tráº£ vá» true khi xong bÆ°á»›c.
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
    // Sáº¯p láº¡i lÃ n (xe mÃ¡y vÆ°á»£t nhau khÃ¡c dáº£i ngang), Ä‘áº¿m vi pháº¡m khoáº£ng cÃ¡ch, dá»n lÃ n rá»—ng.
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
      const rows = [];
      const push = new Map();
      for (let l = 0; l < NL; l++) {
        if (lanes.to[l] !== node) continue;
        const st = lanes.st[l];
        const g = arriveGroup[st];
        let count = 0, wait_sum = 0, wait_max = 0, vsum = 0, crossed = 0, q_out = 0;
        const stopPos = lanes.length[l] - Rz[node];
        const a = laneCars[l];
        if (a) for (const i of a) {
          if (!active[i]) continue;
          if (s[i] > stopPos) {
            // crossed = SỰ KIỆN qua vạch: s_prev ≤ stopPos < s (đếm 1 lần/xe)
            if (lastS[i] <= stopPos && lastStepCrossed[i] !== counters.step) { lastStepCrossed[i] = counters.step; crossed++; }
            continue;
          }
          const near = stopPos - s[i] <= 20;
          if (v[i] < 0.5 || near) {
            count++;
            wait_sum += stopT[i];
            if (stopT[i] > wait_max) wait_max = stopT[i];
            vsum += v[i];
          }
        }
        // q_out = số xe trong 25 m CUỐI làn (đầu làn ra) — dùng cho áp lực max-pressure.
        if (a) for (const i of a) { if (active[i] && s[i] <= stopPos && lanes.length[l] - s[i] <= 25) q_out++; }
        if (count || crossed || q_out) {
          const key = `${st}`;
          const rec = push.get(key) || { st, group: g, count: 0, wait_sum_s: 0, wait_max_s: 0, speed_mean: 0, crossed: 0, q_out: 0 };
          rec.count += count;
          rec.wait_sum_s += wait_sum;
          rec.wait_max_s = Math.max(rec.wait_max_s, wait_max);
          rec.speed_mean = count ? vsum / count : 0;
          rec.crossed += crossed;
          rec.q_out += q_out;
          push.set(key, rec);
        }
      }
      if (push.size) q.set(node, [...push.values()]);
    }
    // cập nhật s_prev cho mọi xe còn hoạt động
    for (let i = 0; i < N; i++) lastS[i] = active[i] ? s[i] : -1;
    return q;
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
    N, lane, s, v, lat, jit, gen, active, kind, len, wid, next, prevLane, pLane, pS, pGen, path, counters,
    step, beginStep, workStep, finishStep, get inStep() { return inStep; }, reset, stats, wantedCount: () => { let n = 0; for (let i = 0; i < N; i++) n += wanted[i]; return n; }, pendingCount: () => { let n = 0; for (let i = 0; i < N; i++) n += pending[i]; return n; }, stateHash: () => { finishStep(); return stateHash(); }, select: () => { finishStep(); return select(); }, activeCount, isSignature,
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

// ---------------------------------------------------------------- hÃ¬nh há»c pose (thuáº§n JS)
// liftY (tuá»³ chá»n): (lÃ n, s, x, z, yProfile) â†’ y váº½, Ä‘á»ƒ thÃ¢n xe náº±m trÃªn máº·t Ä‘Æ°á»ng váº½ cao nháº¥t cÃ¹ng cáº¥p táº¡i Ä‘Ãºng vá»‹ trÃ­ xe.
export function createTrafficGeometry31(net, sim, liftY = null) {
  const { lanes, geo, E } = net;
  const groundY = net.G.frame.groundY;
  // ---- Vá»‹ trÃ­ trÃªn lÃ n: tim polyline + phÃ¡p tuyáº¿n ná»™i suy (Ä‘Æ°á»ng lá»‡ch liÃªn tá»¥c), y theo profile.
  function lanePoint(l, sl, latv, out) {
    const e = lanes.edge[l], d = lanes.dir[l], L = lanes.length[l], o = geo.off[e], n = E[e].c.length / 2;
    const sd = Math.max(0, Math.min(L, d > 0 ? sl : L - sl)), sp = sd * geo.planar[e] / L;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (geo.s[o + m] <= sp) lo = m; else hi = m; }
    const segL = Math.max(1e-6, geo.s[o + hi] - geo.s[o + lo]), t = Math.max(0, Math.min(1, (sp - geo.s[o + lo]) / segL));
    const cx = geo.x[o + lo] + (geo.x[o + hi] - geo.x[o + lo]) * t, cz = geo.z[o + lo] + (geo.z[o + hi] - geo.z[o + lo]) * t;
    let nx = geo.nx[o + lo] + (geo.nx[o + hi] - geo.nx[o + lo]) * t, nz = geo.nz[o + lo] + (geo.nz[o + hi] - geo.nz[o + lo]) * t; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const ld = latv * d;   // lá»‡ch pháº£i theo chiá»u Ä‘i = lá»‡ch theo phÃ¡p tuyáº¿n pháº£i cá»§a chiá»u váº½ Ã— dir
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
  // Äiá»ƒm trÃªn quá»¹ Ä‘áº¡o xe: trong vÃ¹ng nÃºt dÃ¹ng Bezier báº­c ba ná»‘i lÃ n vÃ o/ra (tiáº¿p tuyáº¿n liÃªn tá»¥c).
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
  // Äiá»ƒm quá»¹ Ä‘áº¡o táº¡i quÃ£ng s cÃ³ thá»ƒ vÆ°á»£t Ä‘áº§u/cuá»‘i lÃ n (sang lÃ n trÆ°á»›c/lÃ n káº¿), ngoÃ i cÃ¹ng thÃ¬ ngoáº¡i suy theo tiáº¿p tuyáº¿n.
  function pointAlong(i, l, sl, nl, pl, out) {
    const L = lanes.length[l];
    if (sl > L && nl >= 0) return pathPoint(i, nl, Math.min(sl - L, lanes.length[nl]), -1, l, out);
    if (sl < 0 && pl >= 0) return pathPoint(i, pl, Math.max(0, lanes.length[pl] + sl), l, -1, out);
    const c = Math.max(0, Math.min(L, sl)); pathPoint(i, l, c, nl, pl, out);
    if (c !== sl) { out.x += out.tx * (sl - c); out.z += out.tz * (sl - c); }
    return out;
  }
  const F = {}, R = {};
  // Pose thÃ¢n xe: hai trá»¥c (Â±0,4 chiá»u dÃ i) Ä‘á»u náº±m trÃªn quá»¹ Ä‘áº¡o, tÃ¢m á»Ÿ giá»¯a, hÆ°á»›ng theo dÃ¢y cung â†’ Ä‘uÃ´i xe dÃ i khÃ´ng vÄƒng ra ngoÃ i lÃ n khi ráº½.
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
