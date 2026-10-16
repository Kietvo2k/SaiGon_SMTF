// Perception M1/M5b-1 — mô phỏng có quy luật (không train model). Thuần JS, chạy được trong Node.
// RED-LIGHT: máy trạng thái watch → grace → violation (spec §7.2). M5b-1 thêm: LANE, SPEED, PARK, WRONG-TURN (hành vi do
// sim tác động) và NO-HELMET, OVERLOAD, PHONE, NO-SEATBELT (thuộc tính xe/người). Chỉ bật các mã trong `codes`;
// mặc định ['RED-LIGHT'] như trước M5b-1. Mã hành vi chỉ được ghi khi sim có `behavior` (sim.behaviorOn).
import { hashU32, TRAFFIC_KINDS, SEED, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { violatorOf32, penaltyOf32, CODE_LABEL_32, PARK_STILL_S_32, PARK_MIN_M_32, PARK_MAX_M_32,
  SPEED_OVER_KMH_32, SPEED_OVER_S_32, LEFT_TURN_RAD_32, BEHAVIOR_CODES_32, TRAIT_CODES_32 } from './violation-rules-32.js?v=32a';
import { projectToPixel32, EVIDENCE_W, EVIDENCE_H, VEHICLE_Y_32 } from './camera-capture-32.js?v=32a';

// Xe có nằm trong khung hình bằng chứng của camera không (cùng phép chiếu với ảnh chụp): phía trước camera và trong khung.
export function inFrame32(x, z, cam) {
  const yaw = cam.yaw_deg * Math.PI / 180, pitch = (cam.pitch_deg || 0) * Math.PI / 180;
  const f = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
  const d = [x - cam.x, VEHICLE_Y_32 - cam.height_m, z - cam.z];
  if (d[0] * f[0] + d[1] * f[1] + d[2] * f[2] <= 0) return false;
  const { px, py } = projectToPixel32(x, z, cam, EVIDENCE_W, EVIDENCE_H);
  // Chừa lề 8 %: xe nằm sát mép khung thì ảnh chỉ thấy một phần, không ghi.
  return px >= 0.08 * EVIDENCE_W && px <= 0.92 * EVIDENCE_W && py >= 0.08 * EVIDENCE_H && py <= 0.92 * EVIDENCE_H;
}

export const PERCEPTION_32_VERSION = 'perception-32b';
export const GRACE_S = 0.8;
export const VIOLATION_RATE = 0.03;

const SERIES = 'ABCDEFGHKLMNPRSTUVWXYZ';   // bỏ I, J, O, Q theo lệ đặt biển (cần xác minh tập ký tự thực tế)
const COLORS = ['trắng', 'đen', 'xám', 'bạc', 'đỏ', 'xanh dương', 'xanh lá', 'vàng', 'nâu', 'cam', 'hồng', 'tím'];
const OWNERS = [];   // điền từ backend/app/seed/owners.json khi chạy trên Node; mặc định 200 tên trong seed.
// Độ tin cậy nhân theo loại lỗi: thuộc tính khó nhìn (điện thoại, dây an toàn) thấp hơn → thường `needs_review`.
const CONF_FACTOR = { PHONE: 0.8, 'NO-SEATBELT': 0.8, OVERLOAD: 0.9 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashWord = rnd => Math.floor(rnd() * 4294967296) >>> 0;

export const SCENARIO_PLATES_32 = [
  { slot: 1, gen: 0, plate: '51K-888.88', vehicle_class: 'car' },
  { slot: 2, gen: 0, plate: '59-X9 999.99', vehicle_class: 'motorbike' },
  { slot: 3, gen: 0, plate: '51K-111.11', vehicle_class: 'car' },
  { slot: 4, gen: 0, plate: '59-A1 222.22', vehicle_class: 'motorbike' },
  { slot: 5, gen: 0, plate: '51G-333.33', vehicle_class: 'car' },
  { slot: 6, gen: 0, plate: '59-B2 444.44', vehicle_class: 'motorbike' }
];

export function loadOwners32(names) { OWNERS.length = 0; OWNERS.push(...names); }

const fmtOf = cls => cls === 'motorbike' ? 'motorbike' : 'car';

export function plateFor32(slot, gen, vehicleClass, salt = 0) {
  const r0 = hashU32((SEED ^ slot ^ (gen << 16) ^ Math.imul(salt, 0x9E3779B9)) >>> 0);
  const rnd = mulberry32(r0);
  // 1) biển — đúng 4 lần rút cho (biển, màu, chủ, điện thoại)
  let b = hashWord(rnd);
  const letter = SERIES[b % 21]; b = Math.floor(b / 21);
  let plate;
  const plate_format = fmtOf(vehicleClass);
  if (plate_format === 'motorbike') {
    const d = b % 10; b = Math.floor(b / 10);
    const n = b % 1000; b = Math.floor(b / 1000);
    const p = b % 100;
    plate = `59-${letter}${d} ${String(n).padStart(3, '0')}.${String(p).padStart(2, '0')}`;
  } else {
    const withDigit = b % 2; b = Math.floor(b / 2);
    let mid = '';
    if (withDigit) { mid = String(b % 10); b = Math.floor(b / 10); }
    const n = b % 1000; b = Math.floor(b / 1000);
    const p = b % 100;
    plate = `51${letter}${mid}-${String(n).padStart(3, '0')}.${String(p).padStart(2, '0')}`;
  }
  const k2 = hashWord(rnd);
  const color = COLORS[Math.floor(k2 / 4294967296 * 12)];   // = (k2 * 12) >> 32
  const k3 = hashWord(rnd);
  const owner_name = OWNERS.length ? OWNERS[Math.floor(k3 / 4294967296 * OWNERS.length)] : `Chủ xe ${slot}`;   // = (k3 * n) >> 32
  const k4 = hashWord(rnd);
  const owner_phone = '09' + String(k4 % 100000000).padStart(8, '0');
  const sc = SCENARIO_PLATES_32.find(s => s.slot === slot && s.gen === gen && fmtOf(s.vehicle_class) === plate_format);
  return sc
    ? { slot, gen, salt, plate: sc.plate, plate_format, vehicle_class: vehicleClass, color, owner_name, owner_phone, is_scenario: true }
    : { slot, gen, salt, plate, plate_format, vehicle_class: vehicleClass, color, owner_name, owner_phone, is_scenario: false };
}

const CONFUSE = { '0': '8', '8': '0', '1': '7', '7': '1', '5': 'S', 'S': '5', 'B': '8', 'D': '0', 'I': '1' };

export function ocrNoise32(plateTrue, distanceM, rangeM, tSim, slot, gen) {
  const rnd = mulberry32(hashU32((SEED ^ slot ^ (gen << 16) ^ Math.floor(tSim)) >>> 0));
  let swaps = 0;
  const chars = [];
  for (const ch of plateTrue) {
    const uMiss = rnd(), uSwap = rnd();
    if (uMiss < 0.02) continue;                    // p_miss = 0,02: mất 1 ký tự
    if (uSwap < 0.06 && CONFUSE[ch]) { chars.push(CONFUSE[ch]); swaps++; }
    else chars.push(ch);
  }
  const plate_read = chars.join('');
  const ocr_confidence = Math.max(0, Math.min(1, 0.98 - 0.12 * (distanceM / rangeM) - 0.25 * swaps));
  return { plate_read, ocr_confidence, swaps };
}

// codes: mã được bật (mặc định chỉ RED-LIGHT). restrictedNodes: chỉ số nút có biển cấm rẽ trái (WRONG-TURN).
export function createPerception32({ net, sim, controller, nodeMap, cameras, seed = SEED, codes = ['RED-LIGHT'], restrictedNodes = [] }) {
  const { lanes, Rz, arriveGroup, G, E } = net;
  const enabled = new Set(codes);
  const restricted = new Set(restrictedNodes);
  const behaviorOn = !!(sim.behaviorOn);
  const idxByOsm = new Map(G.nodes.map((n, i) => [n.id, i]));
  const metaByNode = new Map(nodeMap.map(m => [idxByOsm.get(m.osm_id), m]));
  const speedLimitOf = l => {
    const road = G.roads[E[lanes.edge[l]].road];
    const max = road && road.maxspeed ? Number(road.maxspeed) : NaN;
    if (Number.isFinite(max)) return max;
    const t = String(road?.type || '').replace(/_link$/, '');
    return { trunk: 60, primary: 50, secondary: 40, tertiary: 30, residential: 30 }[t] ?? 30;
  };
  // Máy trạng thái theo (xe, camera): watch → grace → violation/idle.
  const states = new Map();     // key `${i}|${gen}|${camera_id}` → {phase, tRed, inFovS, distanceM, lastT, overS, stillS, emitted}
  const seen = new Set();       // `${vehicle_id}|${node_id}|${cycle_id}` đã sinh (RED-LIGHT)
  const seenB = new Set();      // `${slot}|${gen}|${node_id}|${code}` đã sinh (hành vi và thuộc tính)
  const out = [];
  const detections = new Map();
  // Biển/chủ xe theo (xe, thế hệ): nhớ lại để không băm lại mỗi lần quét (xe trong FOV được quét 2 lần/s).
  const recCache = new Map();
  const rec0Of = i => {
    const g = sim.gen[i], c = recCache.get(i);
    if (c && c.gen === g) return c.rec;
    const rec = plateFor32(i + 1, g, TRAFFIC_KINDS[sim.kind[i]].name);
    recCache.set(i, { gen: g, rec });
    return rec;
  };
  const cycleOf = (node, t) => (controller && controller.cycleIdOf ? controller.cycleIdOf(node, t) : Math.floor(t / 48));
  // Vị trí (x, z) của xe trên polyline cạnh của làn l tại s (đủ cho FOV mặt phẳng XZ).
  // Vị trí theo ĐÚNG hình học 3D (poseAt: có lệch làn + độ cong), để khung/bằng chứng khớp hình xe trong cảnh.
  // Mạng không có geo (test tổng hợp) → dùng tâm cạnh như trước.
  const geo3d = net.geo ? createTrafficGeometry31(net, sim) : null;
  const PA = {};
  const poseOf = (i, l) => {
    if (geo3d) {
      geo3d.poseAt(i, l, sim.s[i], sim.next[i], sim.prevLane ? sim.prevLane[i] : -1, PA);
      return { x: PA.x, z: PA.z, tx: PA.tx, tz: PA.tz };
    }
    const e = lanes.edge[l], c = E[e].c, n = c.length / 2;
    const k = sim.s[i] / Math.max(0.01, lanes.length[l]);
    return { x: c[0] + (c[n * 2 - 2] - c[0]) * k, z: c[1] + (c[n * 2 - 1] - c[1]) * k };
  };
  // Xe đứng yên có xe đứng yên ngay phía trước (≤ 10 m) trên cùng làn: không phải đầu hàng → không ghi PARK.
  const hasStoppedLeader = (i, l) => {
    for (let j = 0; j < sim.N; j++) {
      if (j === i || !sim.active[j] || sim.lane[j] !== l) continue;
      const gap = sim.s[j] - sim.s[i];
      if (gap > 0 && gap < 10 && sim.v[j] < 0.15) return true;
    }
    return false;
  };
  const leftTurnAt = (l, nextLane) => {
    if (nextLane < 0) return false;
    const c = net.nextSt[lanes.st[l]]?.find(x => x.st === lanes.st[nextLane]);
    return !!c && c.turn < -LEFT_TURN_RAD_32;
  };

  // Ghi một bản ghi hành vi/thuộc tính (dùng chung cho mọi mã trừ RED-LIGHT).
  // Nút ghi trong bản ghi: nút của camera (nơi xe được quan sát) cho lỗi quan sát tại camera; PARK/WRONG-TURN ghi theo nút xe đang tới.
  const camNodeIdx = new Map();
  for (const m of nodeMap) if (m.node_id && idxByOsm.has(m.osm_id)) camNodeIdx.set(m.node_id, idxByOsm.get(m.osm_id));
  const pushRecord = ({ code, i, cam, node: node0, l, tSim, distance, st, excessKmh = 0, extra = {} }) => {
    const node = (code === 'PARK' || code === 'WRONG-TURN') ? node0 : (camNodeIdx.get(cam.node_id) ?? node0);
    const kindName = TRAFFIC_KINDS[sim.kind[i]].name;
    const rec0 = rec0Of(i);
    const slot = i + 1, gen = sim.gen[i];
    const ocr = ocrNoise32(rec0.plate, distance, cam.range_m, tSim, slot, gen);
    const cycle_id = cycleOf(node, tSim);
    const key = `${slot}|${gen}|${node}|${code}`;
    if (seenB.has(key)) return;
    seenB.add(key);
    const factor = CONF_FACTOR[code] ?? 1;
    const confidence = Math.max(0, Math.min(1, factor * (0.5 * ocr.ocr_confidence + 0.3 * (1 - distance / cam.range_m) + 0.2 * (st.inFovS >= 1 ? 1 : 0))));
    const stat = controller && controller.stateOf ? controller.stateOf(node, tSim) : null;
    const metaN = metaByNode.get(node);
    out.push({
      violation_code: code,
      violation_label: CODE_LABEL_32[code],
      status: confidence >= 0.85 && ocr.ocr_confidence >= 0.75 ? 'new' : 'needs_review',
      priority_flag: false, priority_reason: null,
      plate: ocr.plate_read, plate_format: rec0.plate_format, vehicle_class: kindName,
      vehicle_color: rec0.color, vehicle_id: `V-${String(slot).padStart(6, '0')}`,
      owner_name: rec0.owner_name, owner_phone: rec0.owner_phone, is_scenario_plate: rec0.is_scenario,
      occurred_at: null, node_id: metaN?.node_id ?? String(G.nodes[node].id),
      node_osm_id: G.nodes[node].id, node_label: metaN?.label ?? '',
      camera_id: cam.camera_id, road_index: lanes.edge[l], lane_index: l,
      signal: {
        mode: controller ? controller.getMode() : 'fixed', cluster_id: stat ? stat.cluster_id : null,
        cycle_id, phase_for_vehicle: null, group: arriveGroup[lanes.st[l]],
        elapsed_in_phase_s: null, cycle_s: stat ? stat.cycle_s : null,
        speed_kmh: +(sim.v[i] * 3.6).toFixed(1), speed_limit_kmh: speedLimitOf(l)
      },
      confidence: +confidence.toFixed(3), ocr_confidence: +ocr.ocr_confidence.toFixed(3),
      detection: { in_fov_s: +st.inFovS.toFixed(1), distance_m: +distance.toFixed(1), grace_s: null, crossed_stop_line_at_s: null, observed_at_s: +tSim.toFixed(1),
        ...(code === 'OVERLOAD' ? { persons: 3 } : {}), ...extra },
      evidence: [],
      penalty: penaltyOf32(code, kindName, excessKmh),
      sim: { t_sim: +tSim.toFixed(1), seed, scenario: 'peak-hang-xanh', station_id: 'STATION-3D-01', station_time: new Date().toISOString() },
      review: { by: null, at: null, note: null }, complaint_ids: []
    });
  };

  // Pha (green/yellow/red) của một nhóm tại nút; nhớ kết quả trong cùng một thời điểm quét.
  let phaseT = NaN; const phaseMemo = new Map();
  const phaseOfGroup = (node, group, t) => {
    if (t !== phaseT) { phaseT = t; phaseMemo.clear(); }
    const key = node * 2 + group;
    if (!phaseMemo.has(key)) phaseMemo.set(key, controller.stateOf(node, t).phases.find(p => p.group === group)?.phase ?? null);
    return phaseMemo.get(key);
  };

  const scan = tSim => {
    for (const cam of cameras) {
      const frameDetections = [];
      for (let i = 0; i < sim.N; i++) {
        if (!sim.active[i]) continue;
        const l = sim.lane[i];
        const node = lanes.to[l];
        const stopPos = lanes.length[l] - (Rz[node] || 0) - sim.len[i] / 2;
        // Vị trí xe theo pose-lite: nội suy dọc polyline cạnh (đủ cho kiểm FOV mặt phẳng XZ).
        const { x, z } = poseOf(i, l);
        const dx = cam.x - x, dz = cam.z - z;
        const distance = Math.hypot(dx, dz);
        // M5b-1: FOV theo đúng khung ảnh bằng chứng (trước camera + trong khung 1280×720); trước đây kiểm ngược hướng nhìn.
        const inFov = distance <= cam.range_m && inFrame32(x, z, cam);
        const key = `${i}|${sim.gen[i]}|${cam.camera_id}`;
        let st = states.get(key);
        if (!st) { st = { phase: 'idle', tRed: 0, inFovS: 0, distanceM: distance, lastT: tSim, overS: 0, stillS: 0, emitted: new Set() }; states.set(key, st); }
        const dt = Math.min(1, Math.max(0, tSim - st.lastT)); st.lastT = tSim;
        if (inFov) st.inFovS += 0.5; else { st.phase = 'idle'; st.overS = 0; st.stillS = 0; continue; }
        const kindName = TRAFFIC_KINDS[sim.kind[i]].name;
        const slot = i + 1, gen = sim.gen[i];
        // ---- RED-LIGHT (luật cũ, không đổi).
        if (enabled.has('RED-LIGHT')) {
          const group = arriveGroup[lanes.st[l]];
          const green = controller.isGreen(node, lanes.st[l], tSim);
          const crossed = sim.s[i] > stopPos;
          // Ân hạn tính từ lúc nhóm xe CHUYỂN ĐỎ (spec §7.2), không tính pha vàng: xe đã vào nút khi xanh thì đi tiếp.
          const isRed = phaseOfGroup(node, group, tSim) === 'red';
          if (isRed && !crossed) {
            if (st.phase === 'idle') { st.phase = 'grace'; st.tRed = tSim; }
          } else if (green) st.phase = 'idle';
          // Spec §7.2: đèn đỏ ∧ xe vượt vạch sau t_red + grace. Chốt tại lần quét xe vượt vạch: nhóm xe còn đỏ (không ghi khi pha vàng).
          if (st.phase === 'grace' && crossed && !isRed) st.phase = 'idle';   // vượt vạch lúc không đỏ: bỏ theo dõi, không ghi lại sau này
          if (st.phase === 'grace' && crossed && isRed && tSim - st.tRed > GRACE_S) {
            st.phase = 'idle';
            const meta = metaByNode.get(node);
            const ocr = ocrNoise32(rec0Of(i).plate, distance, cam.range_m, tSim, slot, gen);
            const cycle_id = controller.cycleIdOf(node, tSim);
            const dedupe = `${slot}|${meta?.node_id ?? node}|${cycle_id}`;
            if (!seen.has(dedupe)) {
              seen.add(dedupe);
              const confidence = Math.max(0, Math.min(1,
                0.5 * ocr.ocr_confidence + 0.3 * (1 - distance / cam.range_m) + 0.2 * (st.inFovS >= 1 ? 1 : 0)));
              const rec0 = rec0Of(i);
              const phaseFor = controller.stateOf(node, tSim).phases.find(p => p.group === group);
              const carLike = kindName !== 'motorbike';
              out.push({
                violation_code: 'RED-LIGHT',
                violation_label: CODE_LABEL_32['RED-LIGHT'],
                status: confidence >= 0.85 && ocr.ocr_confidence >= 0.75 ? 'new' : 'needs_review',
                priority_flag: false, priority_reason: null,
                plate: ocr.plate_read, plate_format: rec0.plate_format, vehicle_class: kindName,
                vehicle_color: rec0.color, vehicle_id: `V-${String(slot).padStart(6, '0')}`,
                owner_name: rec0.owner_name, owner_phone: rec0.owner_phone, is_scenario_plate: rec0.is_scenario,
                occurred_at: null, node_id: meta?.node_id ?? String(G.nodes[node].id),
                node_osm_id: G.nodes[node].id, node_label: meta?.label ?? '',
                camera_id: cam.camera_id, road_index: lanes.edge[l], lane_index: l,
                signal: {
                  mode: controller.getMode(), cluster_id: controller.stateOf(node, tSim).cluster_id,
                  cycle_id, phase_for_vehicle: phaseFor ? phaseFor.phase : 'red', group,
                  elapsed_in_phase_s: +(tSim - st.tRed).toFixed(1), cycle_s: controller.stateOf(node, tSim).cycle_s,
                  speed_kmh: +(sim.v[i] * 3.6).toFixed(1), speed_limit_kmh: speedLimitOf(l)
                },
                confidence: +confidence.toFixed(3), ocr_confidence: +ocr.ocr_confidence.toFixed(3),
                detection: { in_fov_s: +st.inFovS.toFixed(1), distance_m: +distance.toFixed(1), grace_s: GRACE_S, crossed_stop_line_at_s: +tSim.toFixed(1) },
                evidence: [],
                penalty: carLike
                  ? { vnd_min: 18000000, vnd_max: 20000000, license_deduction_points: 4, source: 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', verified: true }
                  : { vnd_min: 4000000, vnd_max: 6000000, license_deduction_points: 4, source: 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm c', verified: true },
                sim: { t_sim: +tSim.toFixed(1), seed, scenario: 'peak-hang-xanh', station_id: 'STATION-3D-01', station_time: new Date().toISOString() },
                review: { by: null, at: null, note: null }, complaint_ids: []
              });
            }
          }
        }
        // ---- M5b-1: lỗi hành vi (sim tác động) và thuộc tính xe/người (theo seed).
        const code = violatorOf32(slot, gen, kindName, seed);
        if (code && !st.emitted.has(code)) {
          const isBehavior = BEHAVIOR_CODES_32.includes(code);
          const wanted = enabled.has(code) && (!isBehavior || behaviorOn);
          if (wanted) {
            const speedKmh = sim.v[i] * 3.6, limit = speedLimitOf(l);
            if (code === 'LANE') {
              // Ô tô đi làn 0 của trục ≥ 2 làn (làn xe máy).
              if (kindName === 'car' && lanes.n[l] >= 2 && lanes.k[l] === 0) {
                st.emitted.add(code);
                pushRecord({ code, i, cam, node, l, tSim, distance, st, extra: { lane_k: lanes.k[l], lanes_in_state: lanes.n[l] } });
              }
            } else if (code === 'SPEED') {
              st.overS = speedKmh > limit + SPEED_OVER_KMH_32 ? st.overS + dt : 0;
              if (st.overS >= SPEED_OVER_S_32) {
                st.emitted.add(code);
                pushRecord({ code, i, cam, node, l, tSim, distance, st, excessKmh: +(speedKmh - limit).toFixed(1), extra: { speed_limit_kmh: limit, over_s: +st.overS.toFixed(1) } });
              }
            } else if (code === 'PARK') {
              st.stillS = sim.v[i] < 0.15 ? st.stillS + dt : 0;
              const toStop = lanes.length[l] - Rz[node] - sim.s[i];
              if (st.stillS >= PARK_STILL_S_32 && toStop >= PARK_MIN_M_32 && toStop <= PARK_MAX_M_32 && !hasStoppedLeader(i, l)) {
                st.emitted.add(code);
                pushRecord({ code, i, cam, node, l, tSim, distance, st, extra: { still_s: +st.stillS.toFixed(1), stop_line_m: +toStop.toFixed(1) } });
              }
            } else if (code === 'WRONG-TURN') {
              const laneLen = lanes.length[l];
              if (restricted.has(node) && laneLen - sim.s[i] <= 30 && leftTurnAt(l, sim.next[i])) {
                st.emitted.add(code);
                pushRecord({ code, i, cam, node, l, tSim, distance, st, extra: { maneuver: 'rẽ trái' } });
              }
            } else if (TRAIT_CODES_32.includes(code) && enabled.has(code)) {
              st.emitted.add(code);
              pushRecord({ code, i, cam, node, l, tSim, distance, st });
            }
          }
        }
        frameDetections.push({ vehicle_id: `V-${String(slot).padStart(6, '0')}`, kind: rec0Of(i).vehicle_class, color: rec0Of(i).color, distance_m: +distance.toFixed(1), in_fov_s: +st.inFovS.toFixed(1) });
      }
      detections.set(cam.camera_id, frameDetections);
    }
  };
  return {
    scan,
    drainViolations: () => { const list = out.slice(); out.length = 0; return list; },
    detectionsOf: cameraId => detections.get(cameraId) || [],
    stateHash: () => {
      // Hash theo NỘI DUNG: biển/chủ/mã lỗi/cycle của từng bản ghi + khoá đã sinh.
      let acc = (seen.size * 131 ^ (sim.counters.step | 0)) >>> 0;
      for (const v of out) {
        const s = `${v.vehicle_id}|${v.plate}|${v.node_id}|${v.signal.cycle_id}|${v.confidence}`;
        acc = hashU32((acc ^ s.split('').reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 0)) >>> 0);
      }
      return acc.toString(16).padStart(8, '0');
    }
  };
}
