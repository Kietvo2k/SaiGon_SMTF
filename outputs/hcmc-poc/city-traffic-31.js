// Batch 31A · bước D — vẽ giao thông minh họa (illustrative): 4 InstancedMesh theo loại xe (xe máy, ô tô, buýt, tải), tự cull theo cạnh nhìn thấy,
// nội suy giữa hai bước mô phỏng. Lõi mô phỏng tất định ở city-traffic-sim-31.js.
import * as THREE from 'three/webgpu';
import { attribute, mix, vec3 } from 'three/tsl';
import { TRAFFIC_31_VERSION, TRAFFIC_KINDS, LIGHT_FACTOR, STEP, MAX_STEPS_PER_FRAME, SEED, hashU32, buildTrafficNetwork31, createTrafficSim31, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=30b-31d';

// ---------------------------------------------------------------- hình xe: hộp ghép tỉ lệ thật, màu đỉnh + mặt nạ sơn + phát sáng
// Hộp: [x dọc xe, y, z ngang, dài, cao, rộng, màu đỉnh, phát sáng, mặt nạ sơn]. Mặt nạ 1 = nhân màu sơn riêng từng xe,
// 0 = giữ màu cố định (lốp, kính, người lái) để xe đọc rõ ở 30–60 m; mỗi loại vẫn là một InstancedMesh.
const TYRE = [.045, .045, .05], TRIM = [.09, .09, .1], GLASS = [.07, .1, .13], SEAT = [.12, .11, .11], PAINT = [1, 1, 1];
const SHIRT = [.34, .38, .46], PANTS = [.16, .17, .2], SKIN = [.62, .48, .38], ROOFBOX = [.78, .8, .8], CARGO = [.86, .86, .83];
const HEADC = [.95, .95, .9], TAILC = [.55, .05, .04], HEAD = [1, .9, .72], TAIL = [.42, .004, .002], NONE = [0, 0, 0];
const KIND_BOXES = [
  [ // xe máy ~1,9 × 0,7 m: 2 bánh tối, thân xe tay ga sơn, yếm trước, yên, tay lái; người lái (chân, thân, tay, mũ bảo hiểm sơn)
    [.66, .29, 0, .56, .56, .11, TYRE, NONE, 0], [-.66, .29, 0, .56, .56, .11, TYRE, NONE, 0],
    [0, .55, 0, 1.15, .34, .3, PAINT, NONE, 1], [.62, .8, 0, .16, .62, .34, PAINT, NONE, 1],
    [-.34, .78, 0, .66, .1, .3, SEAT, NONE, 0], [.55, 1.08, 0, .08, .05, .66, TRIM, NONE, 0],
    [-.06, .84, 0, .5, .2, .56, PANTS, NONE, 0], [-.24, 1.16, 0, .3, .52, .42, SHIRT, NONE, 0],
    [.16, 1.2, 0, .5, .1, .54, SKIN, NONE, 0], [-.2, 1.49, 0, .28, .26, .27, PAINT, NONE, 1],
    [.71, .94, 0, .05, .12, .18, HEADC, HEAD, 0], [-.93, .72, 0, .05, .08, .2, TAILC, TAIL, 0]
  ],
  [ // ô tô ~4,5 × 1,8 m: thân dưới sơn, cản trước/sau tối, cabin kính tối, nóc sơn, 4 bánh tối, đèn trước/sau
    [0, .6, 0, 4.46, .62, 1.8, PAINT, NONE, 1], [2.2, .42, 0, .12, .26, 1.76, TRIM, NONE, 0], [-2.2, .42, 0, .12, .26, 1.76, TRIM, NONE, 0],
    [-.2, 1.13, 0, 2.4, .46, 1.66, GLASS, NONE, 0], [-.28, 1.4, 0, 2.0, .08, 1.6, PAINT, NONE, 1],
    [1.42, .33, .78, .66, .66, .26, TYRE, NONE, 0], [1.42, .33, -.78, .66, .66, .26, TYRE, NONE, 0],
    [-1.4, .33, .78, .66, .66, .26, TYRE, NONE, 0], [-1.4, .33, -.78, .66, .66, .26, TYRE, NONE, 0],
    [2.255, .76, .62, .04, .14, .36, HEADC, HEAD, 0], [2.255, .76, -.62, .04, .14, .36, HEADC, HEAD, 0],
    [-2.255, .8, .64, .04, .14, .38, TAILC, TAIL, 0], [-2.255, .8, -.64, .04, .14, .38, TAILC, TAIL, 0]
  ],
  [ // xe buýt ~12 × 2,5 m: thân sơn, dải cửa sổ dài (sáng nhẹ ban đêm), cửa, kính lái, bảng tuyến, máy lạnh nóc, 2 trục bánh, đèn
    [0, 1.8, 0, 12, 2.6, 2.5, PAINT, NONE, 1], [.15, 2.25, 0, 11.5, .95, 2.54, GLASS, [.16, .14, .1], 0],
    [3.4, 1.5, 0, 1.0, 1.9, 2.56, TRIM, NONE, 0], [6.005, 2.0, 0, .04, 1.5, 2.2, GLASS, NONE, 0],
    [6.01, 2.93, 0, .05, .22, 1.6, [.9, .6, .15], [.9, .55, .1], 0], [-1, 3.19, 0, 3, .18, 1.6, ROOFBOX, NONE, 0],
    [4.1, .5, 0, 1.0, 1.0, 2.56, TYRE, NONE, 0], [-3.6, .5, 0, 1.0, 1.0, 2.56, TYRE, NONE, 0],
    [6.02, .85, .85, .05, .2, .5, HEADC, HEAD, 0], [6.02, .85, -.85, .05, .2, .5, HEADC, HEAD, 0],
    [-6.02, .95, .95, .05, .3, .35, TAILC, TAIL, 0], [-6.02, .95, -.95, .05, .3, .35, TAILC, TAIL, 0]
  ],
  [ // xe tải ~7,4 × 2,3 m: cabin sơn + kính, thùng hàng sáng (ánh nhẹ màu sơn), khung gầm tối, 3 trục bánh, đèn
    [2.95, 1.45, 0, 1.5, 1.9, 2.3, PAINT, NONE, 1], [3.705, 1.85, 0, .04, .7, 2.1, GLASS, NONE, 0], [3.1, 1.85, 0, 1.0, .6, 2.34, GLASS, NONE, 0],
    [-.85, 1.75, 0, 5.6, 2.6, 2.3, CARGO, NONE, .25], [0, .55, 0, 7.2, .3, 1.9, TRIM, NONE, 0],
    [2.9, .48, 0, .96, .96, 2.36, TYRE, NONE, 0], [-1.5, .48, 0, .96, .96, 2.36, TYRE, NONE, 0], [-2.6, .48, 0, .96, .96, 2.36, TYRE, NONE, 0],
    [3.72, .8, .85, .05, .2, .45, HEADC, HEAD, 0], [3.72, .8, -.85, .05, .2, .45, HEADC, HEAD, 0],
    [-3.67, .75, .9, .05, .25, .3, TAILC, TAIL, 0], [-3.67, .75, -.9, .05, .25, .3, TAILC, TAIL, 0]
  ]
];
// Màu sơn chọn theo hash(id, SEED): xác định, đa dạng (xe máy nhiều màu; ô tô thiên trắng/bạc/đen; buýt xanh lá; tải xanh/trắng/đỏ).
const PALETTES = [
  ['#b3262a', '#1f4f9a', '#1d1f22', '#e8e6e0', '#9aa1a6', '#c8862a', '#2f6b3f', '#7a2f6b', '#d8c23a', '#3a8fb7'],
  ['#f0efea', '#c2c6c9', '#202326', '#6b7075', '#9e2b25', '#2d4f7c', '#f2f1ec', '#3e8f4f', '#8a6a3a', '#b8bcc0'],
  ['#2f8a4c', '#2a7f47', '#f0eee6', '#d24b2c', '#2c6fb0'],
  ['#2d5fa0', '#e9e7e0', '#b63a2a', '#3f7d4a', '#d9a227']
];
const paintOf = (kind, i) => { const p = PALETTES[kind]; return p[hashU32((i * 31 + 7) ^ SEED) % p.length]; };
function boxGeometry(boxes) {
  const pos = [], nor = [], col = [], emi = [], pm = [];
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [cx, cy, cz, sx, sy, sz, c, e, m] of boxes) {
    for (const n of faces) {
      const a = n[0] ? 1 : n[1] ? 2 : 0, b = n[0] ? 2 : n[1] ? 0 : 1, half = [sx / 2, sy / 2, sz / 2], centre = [cx, cy, cz];
      const corner = (ua, ub) => { const p = centre.slice(); const ax = n.findIndex(v => v !== 0); p[ax] += n[ax] * half[ax]; p[a] += ua * half[a]; p[b] += ub * half[b]; return p; };
      // thứ tự ngược chiều kim đồng hồ nhìn từ ngoài
      const quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      const [p0, p1, p2] = quad, u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const dotN = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
      const order = dotN >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) { pos.push(...quad[k]); nor.push(...n); col.push(...c); emi.push(...e); pm.push(m); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('emit', new THREE.Float32BufferAttribute(emi, 3));
  g.setAttribute('pm', new THREE.Float32BufferAttribute(pm, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- pose (hình học) + vẽ
export function createTraffic31({ scene, graph, roads, widthOf, drawn, roadNetwork, nightLevel, camera, getLight = () => 'day', status = {}, motionStatus = null }) {
  const t0 = performance.now();
  const net = buildTrafficNetwork31({ graph, roads, widthOf, drawn });
  const sim = createTrafficSim31(net);
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
    const geometry = boxGeometry(KIND_BOXES[ki]), cap = Math.max(1, capacity[ki]);
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
  function draw(alpha, cameraDistance) {
    frame++;
    camera.updateMatrixWorld(); projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projScreen); camPos.setFromMatrixPosition(camera.matrixWorld);
    drawRadius = Math.max(1800, Math.min(9000, cameraDistance * 1.6));
    drawnCount.fill(0);
    const arrays = meshes.map(m => m.instanceMatrix.array), colors = meshes.map(m => m.geometry.attributes.paint.array);
    pxPerM = (globalThis.innerHeight || 900) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 45) / 2));
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
      cpuMsP50: +pct(recent, .5).toFixed(3), cpuMsP95: +pct(recent, .95).toFixed(3), lightFactor: sim.lightFactor, fraction: sim.fraction
    };
    Object.assign(status, fields);
    if (motionStatus) Object.assign(motionStatus, fields);
    const ds = document.body.dataset;
    ds.motionTraffic = String(st.total); ds.motionActive = String(st.active); ds.motionEdgeTransitions = String(st.edgeTransitions);
    ds.motionGapViolations = String(st.gapViolations); ds.motionOnewayViolations = String(st.onewayViolations); ds.motionTeleports = String(st.teleports);
    ds.motionOnBridge = String(st.onBridge); ds.motionCpuP95 = String(fields.cpuMsP95);
    lastStatus = now;
  }
  let lastDistance = 2000;
  // drawFrame = false: chỉ chạy mô phỏng, không ghi lại ma trận (camera xa cập nhật thưa như vòng chuyển động của app).
  function update(now, cameraDistance = lastDistance, drawFrame = true) {
    lastDistance = cameraDistance;
    const light = getLight(), lf = LIGHT_FACTOR[light] ?? 1;
    if (Math.abs(lf - sim.lightFactor) > 1e-9) { sim.setLightFactor(lf); rebase(); }
    const dt = lastNow === null ? 0 : Math.min(.25, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    acc += dt; let steps = 0;
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
    setDensity: level => {
      const named = { full: 1, high: 1, balanced: .6, light: .35, minimal: .15 };
      const f = typeof level === 'number' ? level : named[level] ?? 1;
      return api.setVisibleFraction(f);
    },
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
