// Batch 31A · bước D — vẽ giao thông minh họa (illustrative): 4 InstancedMesh theo loại xe (xe máy, ô tô, buýt, tải), tự cull theo cạnh nhìn thấy,
// nội suy giữa hai bước mô phỏng. Lõi mô phỏng tất định ở city-traffic-sim-31.js.
import * as THREE from 'three/webgpu';
import { attribute, mix, vec3 } from 'three/tsl';
import { TRAFFIC_31_VERSION, TRAFFIC_KINDS, LIGHT_FACTOR, STEP, MAX_STEPS_PER_FRAME, SEED, hashU32, buildTrafficNetwork31, createTrafficSim31, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { createSignalController32 } from './traffic-controller-32.js?v=32a';

// ---------------------------------------------------------------- hình xe: khối đa diện có vát + bánh lăng trụ, màu đỉnh + mặt nạ sơn + phát sáng
// Mỗi khối là tập mặt lồi; pháp tuyến hướng ra ngoài theo tâm khối nên không phụ thuộc thứ tự đỉnh. Bỏ mặt đáy và mặt khuất.
// Mặt nạ sơn pm: 1 = nhân màu sơn riêng từng xe, 0 = giữ màu cố định (lốp, kính, quần áo) để xe đọc rõ ở 30–60 m;
// mỗi loại xe vẫn là đúng một InstancedMesh (một draw call).
const TYRE = [.04, .04, .045], TRIM = [.09, .09, .1], GLASS = [.08, .12, .16], SEAT = [.12, .11, .11], PAINT = [1, 1, 1], HUB = [.5, .52, .55];
const SHIRT = [.34, .38, .46], PANTS = [.16, .17, .2], ROOFBOX = [.78, .8, .8], CARGO = [.86, .86, .83], MIRROR = [.12, .12, .13];
const HEADC = [.95, .95, .9], TAILC = [.55, .05, .04], HEAD = [1, .9, .72], TAIL = [.42, .004, .002], NONE = [0, 0, 0], WINDOW_GLOW = [.16, .14, .1], SIGN = [.9, .55, .1];
const pick = (spec, face) => Array.isArray(spec) || typeof spec === 'number' ? spec : spec[face] ?? spec.side ?? spec.all;
function createModel() {
  const pos = [], nor = [], col = [], emi = [], pm = [];
  // Một mặt lồi: pháp tuyến Newell, lật thứ tự đỉnh nếu hướng vào trong (so với tâm khối), quạt tam giác.
  function poly(verts, centre, c, e, m) {
    let nx = 0, ny = 0, nz = 0; const n = verts.length;
    for (let i = 0; i < n; i++) { const a = verts[i], b = verts[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    let fx = 0, fy = 0, fz = 0; for (const v of verts) { fx += v[0] / n; fy += v[1] / n; fz += v[2] / n; }
    let vs = verts;
    if ((fx - centre[0]) * nx + (fy - centre[1]) * ny + (fz - centre[2]) * nz < 0) { vs = verts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    for (let k = 1; k + 1 < n; k++) for (const v of [vs[0], vs[k], vs[k + 1]]) { pos.push(v[0], v[1], v[2]); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); emi.push(e[0], e[1], e[2]); pm.push(m); }
  }
  // Hình chóp cụt chữ nhật: đáy l0×w0 ở y0, đỉnh l1×w1 ở y0+h, lệch (sx, sz). faces chọn mặt phát ra (mặc định trừ đáy).
  function frustum({ x = 0, y0, z = 0, l0, w0, l1 = l0, w1 = w0, h, sx = 0, sz = 0, c, e = NONE, m = 0, faces = ['front', 'back', 'left', 'right', 'top'] }) {
    const S = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    const B = S.map(([a, b]) => [x + a * l0 / 2, y0, z + b * w0 / 2]), T = S.map(([a, b]) => [x + sx + a * l1 / 2, y0 + h, z + sz + b * w1 / 2]);
    const centre = [0, 1, 2].map(i => (B.reduce((s, v) => s + v[i], 0) + T.reduce((s, v) => s + v[i], 0)) / 8);
    const face = { front: [B[0], B[1], T[1], T[0]], back: [B[2], B[3], T[3], T[2]], left: [B[3], B[0], T[0], T[3]], right: [B[1], B[2], T[2], T[1]], top: T, bottom: B };
    for (const f of faces) poly(face[f], centre, pick(c, f), pick(e, f), pick(m, f));
  }
  const box = ({ l, w, ...o }) => frustum({ ...o, l0: l, w0: w, y0: o.y - o.h / 2 });
  // Bánh lăng trụ trục z (n cạnh): mặt bên lốp, nắp lốp + nắp hub xám nhỏ ở phía ngoài (caps '+', '-' hoặc 'both').
  function wheel({ x, y, z = 0, r, w, sides = 8, caps = 'both', tyre = TYRE, hub = HUB }) {
    const ring = zz => Array.from({ length: sides }, (_, k) => [x + r * Math.cos(2 * Math.PI * (k + .5) / sides), y + r * Math.sin(2 * Math.PI * (k + .5) / sides), zz]);
    const a = ring(z + w / 2), b = ring(z - w / 2), centre = [x, y, z];
    for (let k = 0; k < sides; k++) poly([a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]], centre, tyre, NONE, 0);
    for (const s of caps === 'both' ? [1, -1] : [caps === '+' ? 1 : -1]) {
      poly(s > 0 ? a : b, centre, tyre, NONE, 0);
      const zz = z + s * (w / 2 + .006);
      poly(Array.from({ length: 6 }, (_, k) => [x + r * .55 * Math.cos(Math.PI * k / 3), y + r * .55 * Math.sin(Math.PI * k / 3), zz]), centre, hub, NONE, 0);
    }
  }
  // Mũ bảo hiểm: lăng trụ đứng n cạnh, bán kính đổi dần r0 → r1, có nắp trên.
  function cylinder({ x, y0, z = 0, r0, r1 = r0, h, sides = 8, c, m = 0 }) {
    const ring = (r, y) => Array.from({ length: sides }, (_, k) => [x + r * Math.cos(2 * Math.PI * (k + .5) / sides), y, z + r * Math.sin(2 * Math.PI * (k + .5) / sides)]);
    const a = ring(r0, y0), b = ring(r1, y0 + h), centre = [x, y0 + h / 2, z];
    for (let k = 0; k < sides; k++) poly([a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]], centre, pick(c, 'side'), NONE, m);
    poly(b, centre, pick(c, 'top'), NONE, m);
  }
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('emit', new THREE.Float32BufferAttribute(emi, 3)); g.setAttribute('pm', new THREE.Float32BufferAttribute(pm, 1));
    g.computeBoundingSphere(); return g;
  };
  return { frustum, box, wheel, cylinder, geometry };
}
const FRONT = ['front'], BACK = ['back'], SIDES = ['left', 'right'], ALL4 = ['front', 'back', 'left', 'right'], NOBOTTOM = ['front', 'back', 'left', 'right', 'top'];
const MODELS = [
  // xe máy tay ga ~1,9 × 0,7 m: 2 bánh có hub, yếm + thân sau + yên, tay lái, đèn; người lái (chân, thân, hai tay, mũ sơn có kính)
  S => {
    S.wheel({ x: .62, y: .29, r: .29, w: .09 }); S.wheel({ x: -.62, y: .29, r: .29, w: .12 });
    S.frustum({ x: .6, y0: .3, l0: .07, w0: .07, h: .7, sx: -.1, c: TRIM, faces: ALL4 });                                  // càng trước nghiêng
    S.box({ x: .63, y: .62, l: .5, h: .05, w: .13, c: PAINT, m: 1 });                                                       // chắn bùn
    S.frustum({ x: .5, y0: .36, l0: .2, w0: .4, l1: .1, w1: .36, h: .62, sx: -.06, c: PAINT, m: 1 });                      // yếm
    S.box({ x: .1, y: .335, l: .62, h: .05, w: .34, c: TRIM });                                                             // sàn để chân
    S.frustum({ x: -.42, y0: .34, l0: .8, w0: .32, l1: .5, w1: .28, h: .46, sx: -.1, c: PAINT, m: 1 });                    // thân sau
    S.box({ x: -.3, y: .845, l: .6, h: .09, w: .28, c: SEAT });                                                             // yên
    S.box({ x: .45, y: 1.0, l: .07, h: .05, w: .64, c: TRIM });                                                             // tay lái
    S.box({ x: .62, y: .9, l: .06, h: .12, w: .2, c: HEADC, e: HEAD, faces: FRONT.concat(SIDES, ['top']) });                // đèn pha
    S.box({ x: -.9, y: .72, l: .05, h: .07, w: .22, c: TAILC, e: TAIL, faces: BACK.concat(SIDES, ['top']) });               // đèn hậu
    for (const z of [.14, -.14]) {
      S.box({ x: -.1, y: .95, z, l: .5, h: .14, w: .13, c: PANTS });                                                        // đùi
      S.frustum({ x: .3, y0: .38, z: z * 1.15, l0: .12, w0: .12, h: .55, sx: -.14, c: PANTS, faces: ALL4 });               // cẳng chân
    }
    S.frustum({ x: -.28, y0: .98, l0: .26, w0: .36, l1: .22, w1: .42, h: .5, sx: .05, c: SHIRT, m: .4 });                  // thân
    for (const z of [.25, -.25]) S.frustum({ x: .44, y0: 1.02, z, l0: .09, w0: .09, l1: .1, w1: .1, h: .38, sx: -.6, c: SHIRT, m: .4 });   // tay
    S.cylinder({ x: -.2, y0: 1.47, r0: .135, r1: .115, h: .17, c: PAINT, m: 1 });                                          // mũ bảo hiểm
    S.box({ x: -.08, y: 1.56, l: .02, h: .07, w: .16, c: GLASS, faces: FRONT });                                            // kính mũ
  },
  // ô tô ~4,5 × 1,8 m: thân dưới sơn, cabin kính vát (kính trước/sau dốc), nóc sơn, cột B/C, cản, đèn, 4 bánh
  S => {
    S.frustum({ x: 0, y0: .36, l0: 4.46, w0: 1.72, l1: 4.34, w1: 1.68, h: .5, c: PAINT, m: 1 });                            // thân dưới
    S.frustum({ x: -.2, y0: .86, l0: 2.5, w0: 1.62, l1: 1.62, w1: 1.52, h: .56, sx: -.22, c: { all: GLASS, top: PAINT }, m: { all: 0, top: 1 } });   // cabin kính
    for (const x of [-.12, -.95]) S.box({ x, y: 1.14, l: .09, h: .56, w: 1.64, c: PAINT, m: 1, faces: SIDES });             // cột B, C (dải sơn hai bên)
    for (const s of [1, -1]) S.box({ x: s * 2.24, y: .5, l: .1, h: .22, w: 1.72, c: TRIM });                                // cản
    for (const z of [.62, -.62]) {
      S.box({ x: 2.221, y: .72, z, l: .02, h: .13, w: .38, c: HEADC, e: HEAD, faces: FRONT });
      S.box({ x: -2.221, y: .76, z, l: .02, h: .14, w: .4, c: TAILC, e: TAIL, faces: BACK });
    }
    for (const [x, z] of [[1.42, .8], [1.42, -.8], [-1.4, .8], [-1.4, -.8]]) S.wheel({ x, y: .34, z, r: .34, w: .24, caps: z > 0 ? '+' : '-' });
  },
  // xe buýt ~12 × 2,5 m: thân sơn, 7 ô cửa sổ mỗi bên (ban đêm sáng nhẹ), cửa, kính lái + bảng tuyến, máy lạnh nóc, gương, 4 bánh
  S => {
    S.frustum({ x: 0, y0: .55, l0: 12, w0: 2.5, l1: 11.9, w1: 2.46, h: 2.55, c: PAINT, m: 1 });                            // thân
    S.box({ x: 0, y: .42, l: 11.7, h: .3, w: 2.3, c: TRIM });                                                               // gầm
    for (const s of [1, -1]) {
      for (let k = 0; k < 7; k++) S.box({ x: -4.9 + k * 1.55, y: 2.25, z: s * 1.243, l: 1.3, h: .95, w: .03, c: GLASS, e: WINDOW_GLOW, faces: [s > 0 ? 'left' : 'right'] });   // cửa sổ
      S.box({ x: 4.2, y: 1.55, z: s * 1.243, l: 1.0, h: 1.85, w: .03, c: TRIM, faces: [s > 0 ? 'left' : 'right'] });         // cửa
      S.box({ x: 5.55, y: 1.95, z: s * 1.4, l: .12, h: .26, w: .12, c: MIRROR });                                           // gương
    }
    S.box({ x: 6.004, y: 2.15, l: .02, h: 1.1, w: 2.3, c: GLASS, e: WINDOW_GLOW, faces: FRONT });                           // kính lái
    S.box({ x: 6.004, y: 3.0, l: .02, h: .22, w: 1.6, c: SIGN, e: SIGN, faces: FRONT });                                    // bảng tuyến
    S.box({ x: -6.004, y: 2.3, l: .02, h: .9, w: 2.0, c: GLASS, faces: BACK });                                             // kính sau
    S.box({ x: -1, y: 3.27, l: 3, h: .2, w: 1.6, c: ROOFBOX });                                                              // máy lạnh
    for (const s of [1, -1]) {
      S.box({ x: 6.006, y: .96, z: s * .85, l: .02, h: .18, w: .5, c: HEADC, e: HEAD, faces: FRONT });
      S.box({ x: -6.006, y: .95, z: s * .95, l: .02, h: .3, w: .35, c: TAILC, e: TAIL, faces: BACK });
    }
    S.box({ x: 6.02, y: .5, l: .1, h: .3, w: 2.5, c: TRIM }); S.box({ x: -6.02, y: .5, l: .1, h: .3, w: 2.5, c: TRIM });  // cản
    for (const [x, w] of [[3.9, .3], [-3.6, .4]]) for (const s of [1, -1]) S.wheel({ x, y: .5, z: s * 1.1, r: .5, w, sides: 10, caps: s > 0 ? '+' : '-' });
  },
  // xe tải ~7,4 × 2,3 m: khung gầm, cabin sơn + kính vát, thùng hàng sáng với dải sơn, gương, 3 trục (6 bánh), đèn
  S => {
    S.box({ x: 0, y: .65, l: 7.2, h: .3, w: 1.9, c: TRIM });                                                                // khung gầm
    S.box({ x: 2.95, y: 1.22, l: 1.5, h: .75, w: 2.3, c: PAINT, m: 1 });                                                    // cabin dưới
    S.frustum({ x: 2.95, y0: 1.6, l0: 1.5, w0: 2.3, l1: 1.1, w1: 2.2, h: 1.0, sx: -.17, c: { all: GLASS, top: PAINT }, m: { all: 0, top: 1 } });   // cabin kính vát
    S.box({ x: -.85, y: 1.95, l: 5.4, h: 2.2, w: 2.3, c: CARGO, m: .25 });                                                  // thùng hàng
    for (const s of [1, -1]) {
      S.box({ x: -.85, y: 1.35, z: s * 1.153, l: 5.3, h: .22, w: .01, c: PAINT, m: 1, faces: [s > 0 ? 'left' : 'right'] });   // dải sơn bên thùng
      S.box({ x: 3.7, y: 1.95, z: s * 1.28, l: .12, h: .3, w: .14, c: MIRROR });                                            // gương
    }
    for (const z of [.85, -.85]) {
      S.box({ x: 3.71, y: .98, z, l: .02, h: .2, w: .45, c: HEADC, e: HEAD, faces: FRONT });
      S.box({ x: -3.705, y: .95, z, l: .02, h: .26, w: .3, c: TAILC, e: TAIL, faces: BACK });
    }
    S.box({ x: 3.74, y: .72, l: .1, h: .25, w: 2.2, c: TRIM }); S.box({ x: -3.7, y: .72, l: .1, h: .25, w: 2.0, c: TRIM });  // cản
    for (const x of [2.9, -1.5, -2.6]) for (const s of [1, -1]) S.wheel({ x, y: .5, z: s * 1.05, r: .5, w: .34, sides: 10, caps: s > 0 ? '+' : '-' });
  }
];
function vehicleGeometry(kind) { const S = createModel(); MODELS[kind](S); return S.geometry(); }

// Màu sơn chọn theo hash(id, SEED): xác định, đa dạng (xe máy nhiều màu; ô tô thiên trắng/bạc/đen; buýt xanh lá; tải xanh/trắng/đỏ).
const PALETTES = [
  ['#b3262a', '#1f4f9a', '#1d1f22', '#e8e6e0', '#9aa1a6', '#c8862a', '#2f6b3f', '#7a2f6b', '#d8c23a', '#3a8fb7'],
  ['#f0efea', '#c2c6c9', '#202326', '#6b7075', '#9e2b25', '#2d4f7c', '#f2f1ec', '#3e8f4f', '#d9b92e', '#b8bcc0'],
  ['#2f8a4c', '#2a7f47', '#f0eee6', '#d24b2c', '#2c6fb0'],
  ['#2d5fa0', '#e9e7e0', '#b63a2a', '#3f7d4a', '#d9a227']
];
const paintOf = (kind, i) => { const p = PALETTES[kind]; return p[hashU32((i * 31 + 7) ^ SEED) % p.length]; };

// ---------------------------------------------------------------- pose (hình học) + vẽ
export function createTraffic31({ scene, graph, roads, widthOf, drawn, roadNetwork, nightLevel, camera, getLight = () => 'day', status = {}, motionStatus = null, signalPlan = null, controller = null, breakerS = undefined, seed = undefined, routeBias = null, demand = null, behavior = null }) {
  const t0 = performance.now();
  const net = buildTrafficNetwork31({ graph, roads, widthOf, drawn, signalPlan });
  // M5a: demand (tùy chọn) = nhu cầu khu cao điểm/khu Bắc, đặt lúc dựng pool; không truyền = hành vi cũ.
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS, seed, routeBias, demand, behavior });
  const { lanes } = net;
  // ---- Nâng y theo mặt đường vẽ: mặt cao nhất trong 0,5 m trên profile làn (dốc/mảnh đoạn chồng nhau, như baseline 30B).
  // Tính tại đúng vị trí xe (không bảng nội suy) nên không tụt dưới đỉnh giữa hai mẫu.
  const rawLift = (x, z, y) => { let top = y; for (const v of roadNetwork.surfaceYs(x, z)) if (v > top && v - y < .5) top = v; return top - y > .004 ? top + .01 : y; };
  // Quét trước mỗi làn ở bước 1 m (lệch ngang ±1,5 m): chỉ làn có mặt chồng mới tra mặt đường mỗi khung, làn còn lại dùng profile.
  const liftLane = new Uint8Array(lanes.edge.length), probe = createTrafficGeometry31(net, sim), Q = {};
  for (let l = 0; l < lanes.edge.length; l++) {
    const n = Math.max(1, Math.ceil(lanes.length[l]));
    for (let k = 0; k <= n && !liftLane[l]; k++) {
      const sl = lanes.length[l] * k / n, y = probe.laneY(l, sl);
      for (const d of [-1.5, 0, 1.5]) { probe.lanePoint(l, sl, lanes.offset[l] + d, Q); if (rawLift(Q.x, Q.z, y) !== y) { liftLane[l] = 1; break; } }
    }
  }
  // Đường cong trong nút đi qua vùng của các làn chung nút: nút có làn cần nâng thì mọi làn chạm nút đều tra.
  const liftNode = new Uint8Array(net.Rz.length);
  for (let l = 0; l < liftLane.length; l++) if (liftLane[l] === 1) liftNode[lanes.from[l]] = liftNode[lanes.to[l]] = 1;
  for (let l = 0; l < liftLane.length; l++) if (liftNode[lanes.from[l]] || liftNode[lanes.to[l]]) liftLane[l] = 1;
  const liftY = (l, sl, x, z, y) => liftLane[l] ? rawLift(x, z, y) : y;
  const { poseAt, lanePoint, laneY } = createTrafficGeometry31(net, sim, liftY);
  // ---- Trạng thái hiển thị: vẽ nội suy giữa hai bước đã chốt D0 → D1 trong khi bước kế đang được tính dần theo lát
  // (trễ một bước 0,1 s), để CPU một bước trải qua nhiều khung thay vì dồn vào một khung.
  const N = sim.N;
  const D0 = { lane: new Int32Array(N), s: new Float64Array(N), gen: new Uint32Array(N) };
  const D1 = { lane: new Int32Array(N), s: new Float64Array(N), gen: new Uint32Array(N), next: new Int32Array(N), prevLane: new Int32Array(N), jit: new Float32Array(N), active: new Uint8Array(N) };
  const drawPose = createTrafficGeometry31(net, { jit: D1.jit, len: sim.len }, liftY).poseAt;
  const SLICE = Math.ceil(N / 3);
  let committedT = 0;
  function commit() {
    D0.lane.set(D1.lane); D0.s.set(D1.s); D0.gen.set(D1.gen);
    D1.lane.set(sim.lane); D1.s.set(sim.s); D1.gen.set(sim.gen); D1.next.set(sim.next); D1.prevLane.set(sim.prevLane); D1.jit.set(sim.jit); D1.active.set(sim.active);
    committedT = sim.counters.t;
  }
  // Sau thao tác ngoài (reset/advance/mật độ/ánh sáng): hoàn tất bước dở, hiển thị đúng trạng thái mới, không nội suy.
  // Đã có bước sau trạng thái chốt (đang tính dở hoặc tính xong chờ chốt)?
  const pendingStep = () => sim.inStep || sim.counters.t > committedT + 1e-9;
  function rebase() { sim.finishStep(); commit(); commit(); }
  rebase();
  // ---- Mesh: 1 InstancedMesh / loại xe; ma trận chỉ ghi cho xe trên cạnh nhìn thấy.
  const group = new THREE.Group(); group.name = 'Traffic 31D · graph-driven vehicles · illustrative';
  scene.add(group);
  const emitScale = nightLevel.mul(2.6).add(.12);
  const capacity = TRAFFIC_KINDS.map(() => 0); for (let i = 0; i < sim.N; i++) capacity[sim.kind[i]]++;
  const meshes = TRAFFIC_KINDS.map((k, ki) => {
    const geometry = vehicleGeometry(ki), cap = Math.max(1, capacity[ki]);
    // Màu sơn theo instance: thuộc tính instanced riêng (instanceColor sẽ nhân lên mọi phần, kể cả lốp/kính/người lái).
    const paint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); paint.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('paint', paint);
    const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: ki === 0 ? .5 : .36, metalness: ki === 0 ? .2 : .38 });
    material.colorNode = mix(vec3(1), attribute('paint', 'vec3'), attribute('pm', 'float'));
    material.emissiveNode = attribute('emit', 'vec3').mul(emitScale);
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.name = `Traffic 31D · ${k.name}`; mesh.frustumCulled = false; mesh.castShadow = ki > 0; mesh.receiveShadow = false; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    k.triangles = geometry.attributes.position.count / 3;
    return mesh;
  });
  // Màu gắn theo xe (không theo vị trí instance trong frame): chép lại màu theo id khi ghi ma trận.
  const carColor = new Float32Array(sim.N * 3);
  { const c = new THREE.Color(); for (let i = 0; i < sim.N; i++) { c.set(paintOf(sim.kind[i], i)); carColor[i * 3] = c.r; carColor[i * 3 + 1] = c.g; carColor[i * 3 + 2] = c.b; } }
  const drawnIds = meshes.map(m => new Int32Array(m.instanceMatrix.count));
  const drawnCount = TRAFFIC_KINDS.map(() => 0);
  const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), sphereTmp = new THREE.Sphere(), camPos = new THREE.Vector3();
  const edgeStamp = new Int32Array(net.NE).fill(-1), edgeVis = new Uint8Array(net.NE), edgeNear = new Float32Array(net.NE);
  // LOD theo kích thước trên màn hình: xe dài < MIN_PX điểm ảnh (ở điểm gần nhất của cạnh) không vẽ — vô hình, chỉ gây nhấp nháy.
  const MIN_PX = .6, kindLen = TRAFFIC_KINDS.map(k => k.length);
  let pxPerM = 0;
  let frame = 0, acc = 0, lastNow = null, drawRadius = 4500;
  // M4b2: tốc độ chạy (×1/×5/×10: nhân dt, vẫn bị giới hạn MAX_STEPS_PER_FRAME mỗi khung) và tua nhanh theo ngân sách ms/khung.
  let timeScale = 1, ffTarget = null;
  const FF_BUDGET_MS = 10;
  const P = {};
  function edgeVisible(e) {
    if (edgeStamp[e] === frame) return edgeVis[e];
    edgeStamp[e] = frame;
    const sp = net.sphere; sphereTmp.center.set(sp[e * 4], sp[e * 4 + 1], sp[e * 4 + 2]); sphereTmp.radius = sp[e * 4 + 3];
    const near = sphereTmp.center.distanceTo(camPos) - sphereTmp.radius, ok = near < drawRadius && frustum.intersectsSphere(sphereTmp);
    edgeNear[e] = Math.max(1, near); edgeVis[e] = ok ? 1 : 0; return edgeVis[e];
  }
  function interpPose(i, alpha, out) {
    const l = D1.lane[i], s = D1.s[i], nx = D1.next[i], pv = D1.prevLane[i];
    if (D0.gen[i] !== D1.gen[i] || alpha >= 1) return drawPose(i, l, s, nx, pv, out);
    const pl = D0.lane[i], ps = D0.s[i];
    if (pl === l) return drawPose(i, l, ps + (s - ps) * alpha, nx, pv, out);
    if (pv === pl) {
      const rest = lanes.length[pl] - ps, d = (rest + s) * alpha;
      return d < rest ? drawPose(i, pl, ps + d, l, -1, out) : drawPose(i, l, d - rest, nx, pl, out);
    }
    return drawPose(i, l, s, nx, pv, out);
  }
  function writeMatrix(m, o, p) {
    const fx = p.tx, fz = p.tz, pitch = Math.atan(p.grade || 0), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const X0 = fx * cp, X1 = sp, X2 = fz * cp, Y0 = -fx * sp, Y1 = cp, Y2 = -fz * sp;
    const Z0 = X1 * Y2 - X2 * Y1, Z1 = X2 * Y0 - X0 * Y2, Z2 = X0 * Y1 - X1 * Y0;
    m[o] = X0; m[o + 1] = X1; m[o + 2] = X2; m[o + 3] = 0; m[o + 4] = Y0; m[o + 5] = Y1; m[o + 6] = Y2; m[o + 7] = 0;
    m[o + 8] = Z0; m[o + 9] = Z1; m[o + 10] = Z2; m[o + 11] = 0; m[o + 12] = p.x; m[o + 13] = p.y; m[o + 14] = p.z; m[o + 15] = 1;
  }
  // cam: camera vẽ (mặc định camera chính). M5b-1: camera chụp bằng chứng cũng cần xe của nó (cull theo chính camera đó).
  function draw(alpha, cameraDistance, cam = camera) {
    frame++;
    cam.updateMatrixWorld(); projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(projScreen); camPos.setFromMatrixPosition(cam.matrixWorld);
    drawRadius = Math.max(1800, Math.min(9000, cameraDistance * 1.6));
    drawnCount.fill(0);
    const arrays = meshes.map(m => m.instanceMatrix.array), colors = meshes.map(m => m.geometry.attributes.paint.array);
    pxPerM = (globalThis.innerHeight || 900) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 45) / 2));
    for (let i = 0; i < N; i++) {
      if (!D1.active[i]) continue;
      const e = lanes.edge[D1.lane[i]], k = sim.kind[i];
      if (!edgeVisible(e) || kindLen[k] * pxPerM < MIN_PX * edgeNear[e]) continue;
      const c = drawnCount[k]++;
      interpPose(i, alpha, P); writeMatrix(arrays[k], c * 16, P);
      drawnIds[k][c] = i; colors[k][c * 3] = carColor[i * 3]; colors[k][c * 3 + 1] = carColor[i * 3 + 1]; colors[k][c * 3 + 2] = carColor[i * 3 + 2];
    }
    meshes.forEach((m, k) => { m.count = drawnCount[k]; if (drawnCount[k]) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.paint.needsUpdate = true; } });
  }
  // ---- CPU (đo bởi app quanh toàn bộ advanceUrbanMotion, cùng cách đo baseline 30B).
  const cpu = []; const recordCpu = ms => { cpu.push(ms); if (cpu.length > 6000) cpu.shift(); };
  const pct = (list, p) => { if (!list.length) return 0; const a = list.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
  // ---- Kiểm xe không chìm: y bánh xe (profile + nâng) so với mọi mặt đường cùng cấp (±0,5 m quanh profile) tại vị trí làn.
  let surfaceChecked = 0, belowRoad = 0; const belowSamples = [];
  for (let l = 0; l < lanes.edge.length && surfaceChecked < 4800; l += 7) {
    for (const f of [.29, .53, .81]) {
      const sl = lanes.length[l] * f, raw = laneY(l, sl); lanePoint(l, sl, lanes.offset[l], P); const y = liftY(l, sl, P.x, P.z, raw);
      const near = roadNetwork.surfaceYs(P.x, P.z).filter(v => Math.abs(v - raw) < .5); if (!near.length) continue;
      surfaceChecked++; const top = Math.max(...near); if (y < top - .02) { belowRoad++; if (belowSamples.length < 8) belowSamples.push({ lane: l, edge: lanes.edge[l], x: +P.x.toFixed(1), z: +P.z.toFixed(1), y: +y.toFixed(3), surface: +top.toFixed(3) }); }
    }
  }
  const lightLevel = () => nightLevel.value * 2.6 + .12;
  let lastStatus = -1e9;
  function publish(now) {
    const st = sim.stats(), drawnTotal = drawnCount.reduce((a, b) => a + b, 0);
    const recent = cpu.slice(-600);
    const fields = {
      active: st.active, total: st.total, drawn: drawnTotal, edgeTransitions: st.edgeTransitions, edgeTransitionsLast30s: st.edgeTransitionsLast30s,
      gapViolations: st.gapViolations, onewayViolations: st.onewayViolations, teleports: st.teleports, onBridge: st.onBridge, respawns: st.respawns, breakerRespawns: st.breakerRespawns,
      waitingNow: st.waitingNow, maxStopS: st.maxStopS, signals: st.signals, controlledNodes: st.controlledNodes, simTime: st.t,
      cpuMsP50: +pct(recent, .5).toFixed(3), cpuMsP95: +pct(recent, .95).toFixed(3), lightFactor: sim.lightFactor, fraction: sim.fraction, region: { id: sim.region.id, active: sim.region.active }, regionEligible: sim.eligibleCount()
    };
    Object.assign(status, fields);
    if (motionStatus) Object.assign(motionStatus, fields);
    const ds = document.body.dataset;
    ds.motionTraffic = String(st.total); ds.motionActive = String(st.active); ds.motionEdgeTransitions = String(st.edgeTransitions);
    ds.motionGapViolations = String(st.gapViolations); ds.motionOnewayViolations = String(st.onewayViolations); ds.motionTeleports = String(st.teleports);
    ds.motionRegion = sim.region.id || ''; ds.motionRegionActive = sim.region.active ? '1' : '0'; ds.motionOnBridge = String(st.onBridge); ds.motionCpuP95 = String(fields.cpuMsP95);
    lastStatus = now;
  }
  let lastDistance = 2000;
  // drawFrame = false: chỉ chạy mô phỏng, không ghi lại ma trận (camera xa cập nhật thưa như vòng chuyển động của app).
  function update(now, cameraDistance = lastDistance, drawFrame = true) {
    lastDistance = cameraDistance;
    const light = getLight(), lf = LIGHT_FACTOR[light] ?? 1;
    if (Math.abs(lf - sim.lightFactor) > 1e-9) { sim.setLightFactor(lf); rebase(); }
    const dt = lastNow === null ? 0 : Math.min(.25, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    if (ffTarget !== null) {
      // Tua nhanh: chạy bước theo ngân sách mỗi khung, không vẽ giữa chừng; xong mới chốt trạng thái hiển thị.
      const t0 = performance.now();
      while (sim.counters.t < ffTarget - 1e-9 && performance.now() - t0 < FF_BUDGET_MS) { sim.finishStep(); sim.step(); }
      if (sim.counters.t < ffTarget - 1e-9) { if (now - lastStatus > 500) publish(now); return; }
      ffTarget = null; rebase(); acc = 0;
    }
    acc += dt * timeScale; let steps = 0;
    // Đến hạn bước: hoàn tất bước đang tính dở (thường đã xong từ các khung trước) rồi chốt làm trạng thái hiển thị mới.
    while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) { if (!pendingStep()) sim.beginStep(); sim.finishStep(); commit(); acc -= STEP; steps++; }
    if (acc > STEP) acc = STEP;   // bị tụt khung: bỏ thời gian thừa thay vì dồn bước
    // Khung không chốt: tính tiếp một lát của bước kế (≈ 1/3 số xe), xong trước hạn ở ≥ 30 khung/s.
    if (!steps) { if (!pendingStep()) sim.beginStep(); if (sim.inStep) sim.workStep(SLICE); }
    group.visible = cameraDistance < 9500;
    if (group.visible && drawFrame) draw(acc / STEP, cameraDistance);
    if (now - lastStatus > 500) publish(now);
  }
  const counts = () => { const c = TRAFFIC_KINDS.map(() => 0); for (let i = 0; i < sim.N; i++) if (sim.active[i]) c[sim.kind[i]]++; return c; };
  const api = {
    // M5b-1: ghi lại ma trận xe theo camera chụp bằng chứng (trước khi render góc đó); không đổi trạng thái mô phỏng.
    drawFor(cam) { const was = group.visible; group.visible = true; draw(1, 1800, cam); group.visible = was; },
    version: TRAFFIC_31_VERSION, group, meshes, kinds: TRAFFIC_KINDS, total: sim.N, sim, net,
    update, recordCpu, lightLevel,
    cpuSamples: () => cpu.slice(),
    drawn: () => meshes.map((mesh, k) => ({ mesh, ids: drawnIds[k], count: drawnCount[k] })),
    // t = thời điểm bước đã chốt gần nhất; mảng là trạng thái sống (có thể đang giữa bước, vẫn là trạng thái tuần tự hợp lệ).
    // Trạng thái mô phỏng nhất quán: hoàn tất bước đang tính dở (kết quả như bước liền), không đụng trạng thái hiển thị D0/D1.
    snapshot: () => (sim.finishStep(), { t: sim.counters.t, lane: sim.lane, next: sim.next, s: sim.s, v: sim.v, lat: sim.lat, gen: sim.gen, active: sim.active, kind: sim.kind, len: sim.len, wid: sim.wid }),
    lanes: () => ({ edge: lanes.edge, dir: lanes.dir, from: lanes.from, to: lanes.to, length: lanes.length, offset: lanes.offset }),
    poses: () => { const out = new Float32Array(sim.N * 5), p = {}; for (let i = 0; i < sim.N; i++) { if (!sim.active[i]) continue; poseAt(i, sim.lane[i], sim.s[i], sim.next[i], sim.prevLane[i], p); out[i * 5] = p.x; out[i * 5 + 1] = p.y; out[i * 5 + 2] = p.z; out[i * 5 + 3] = Math.atan2(p.tz, p.tx); out[i * 5 + 4] = Math.atan(p.grade || 0); } return out; },
    // Mặt đường vẽ cao nhất trong 0,5 m trên y tham chiếu (profile) tại (x, z) — cùng quy tắc nâng xe, cho QA cầu.
    surfaceAbove: (x, z, ref) => { let top = ref; for (const v of roadNetwork.surfaceYs(x, z)) if (v > top && v - ref < .5) top = v; return top; },
    instances: () => Array.from({ length: sim.N }, (_, i) => ({ id: i, kind: TRAFFIC_KINDS[sim.kind[i]].name, signature: sim.isSignature(i) })),
    stats: () => sim.stats(), stateHash: () => sim.stateHash(),
    reset: () => { sim.reset(); rebase(); acc = 0; publish(performance.now()); },
    advance: seconds => { sim.finishStep(); const n = Math.round(seconds / STEP); for (let k = 0; k < n; k++) sim.step(); rebase(); acc = 0; return sim.stats(); },
    // Mật độ (bước E/F): giảm đều theo ô 200 m, tất định; trả về số xe đang hoạt động.
    setVisibleFraction: f => { const n = sim.setFraction(Number(f)); rebase(); publish(performance.now()); return n; },
    // Khu mô phỏng (bước H): null = toàn thành phố; {id: string, polygon: [[x, z], …]} tọa độ cảnh (cùng hệ ROAD_GRAPH_31/CITY_DATA).
    // Xe ngoài đa giác tắt; sinh/tái sinh chỉ ở nút trong khu; setVisibleFraction áp lên tập xe trong khu. Trả về số xe đang hoạt động.
    setRegion: region => { const n = sim.setRegion(region); rebase(); publish(performance.now()); return n; },
    // M5a: hạn chế làn (xe hỏng chắn làn, làn đóng, giảm tốc). {} = bình thường. Trả về số làn/độ dài đã đặt.
    setRestrictions: r => { const out = sim.setRestrictions(r || {}); rebase(); publish(performance.now()); return out; },
    restrictionCounts: () => sim.restrictionCounts(),
    getRegion: () => ({ ...sim.region, eligible: sim.eligibleCount() }),
    // M4b2: tốc độ chạy và tua nhanh (giây sim). Mặc định 1 và không tua: hành vi cũ không đổi.
    setTimeScale: k => { const v = Number(k); timeScale = Number.isFinite(v) ? Math.max(0, Math.min(20, v)) : 1; return timeScale; },
    getTimeScale: () => timeScale,
    fastForward: seconds => { sim.finishStep(); ffTarget = sim.counters.t + Math.max(0, Number(seconds) || 0); return ffTarget; },
    ffRemaining: () => (ffTarget === null ? 0 : Math.max(0, ffTarget - sim.counters.t)),
    setDensity: level => {
      const named = { full: 1, high: 1, balanced: .6, light: .35, minimal: .15 };
      const f = typeof level === 'number' ? level : named[level] ?? 1;
      return api.setVisibleFraction(f);
    },
    get controller() { return sim.controller; },
    // Trạng thái đèn cho UI: gọi thẳng controller.stateOf(nodeId) (nhận cả node_id HX-xx lẫn chỉ số/OSM);
    // nút 31A ngoài kế hoạch do controller trả trạng thái chu kỳ 44 s riêng.
    signalState: nodeId => (sim.controller ? sim.controller.stateOf(nodeId, sim.counters.t) : null),
    // Dựng controller từ net đã có (không dựng net hai lần) rồi gắn vào sim; giữ tham số khởi tạo cũ.
    attachController: (opts = {}) => {
      const c = opts.controller || createSignalController32({ net, sim, ...opts });
      sim.attachController(c);
      return c;
    },
    setSignalMode: mode => (sim.controller ? sim.controller.setMode(mode) : { ok: false, mode: null }),
    overridePhase: (node, group, duration_s, by, reason) => (sim.controller ? sim.controller.overridePhase(node, group, duration_s, by, reason) : { ok: false, until_t_sim: 0, until_at: '' }),
    counts
  };
  const c0 = counts();
  const summary = {
    version: TRAFFIC_31_VERSION, state: 'ready', classification: 'giao thông minh họa (illustrative) trên đồ thị đường OSM; không phải dữ liệu giao thông thật',
    network: net.stats, pool: sim.N, motorbikes: c0[0], cars: c0[1], buses: c0[2], trucks: c0[3], triangles: TRAFFIC_KINDS.map(k => k.triangles), drawCalls: meshes.length,
    surfaceChecked, belowRoad, belowRoadSamples: belowSamples, buildMs: +(performance.now() - t0).toFixed(1), step: STEP, seed: SEED
  };
  Object.assign(status, summary);
  if (motionStatus) Object.assign(motionStatus, { surfaceChecked, belowRoad, belowRoadSamples: belowSamples, motorbikes: c0[0], cars: c0[1], buses: c0[2], trucks: c0[3], trafficPool: sim.N, trafficNetwork: net.stats, vehicleTriangles: TRAFFIC_KINDS.map(k => k.triangles) });
  Object.defineProperty(status, 'api', { value: api, enumerable: false, configurable: true });
  if (motionStatus) Object.defineProperty(motionStatus, 'api', { value: api, enumerable: false, configurable: true });
  publish(performance.now());
  return api;
}
