// Perception M1 — mô phỏng có quy luật (không train model). Thuần JS, chạy được trong Node.
import { hashU32, TRAFFIC_KINDS, SEED } from './city-traffic-sim-31.js?v=32a';

export const PERCEPTION_32_VERSION = 'perception-32a';
export const GRACE_S = 0.8;
export const VIOLATION_RATE = 0.03;

const SERIES = 'ABCDEFGHKLMNPRSTUVWXYZ';   // bỏ I, J, O, Q theo lệ đặt biển (cần xác minh tập ký tự thực tế)
const COLORS = ['trắng', 'đen', 'xám', 'bạc', 'đỏ', 'xanh dương', 'xanh lá', 'vàng', 'nâu', 'cam', 'hồng', 'tím'];
const OWNERS = [];   // điền từ backend/app/seed/owners.json khi chạy trên Node; mặc định 200 tên trong seed.

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

export function createPerception32({ net, sim, controller, nodeMap, cameras, seed = SEED }) {
  const { lanes, Rz, arriveGroup, G, E } = net;
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
  const states = new Map();     // key `${i}|${gen}|${camera_id}` → {phase, tRed, inFovS, distanceM}
  const seen = new Set();       // `${vehicle_id}|${node_id}|${cycle_id}` đã sinh
  const out = [];
  const detections = new Map();
  const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const yawRad = c => c.yaw_deg * Math.PI / 180;
  const rec0Of = i => plateFor32(i + 1, sim.gen[i], TRAFFIC_KINDS[sim.kind[i]].name);

  const scan = tSim => {
    for (const cam of cameras) {
      const frameDetections = [];
      for (let i = 0; i < sim.N; i++) {
        if (!sim.active[i]) continue;
        const l = sim.lane[i];
        const node = lanes.to[l];
        const stopPos = lanes.length[l] - (Rz[node] || 0) - sim.len[i] / 2;
        // Vị trí xe theo pose-lite: nội suy dọc polyline cạnh (đủ cho kiểm FOV mặt phẳng XZ).
        const e = lanes.edge[l], c = E[e].c, n = c.length / 2;
        const x = c[0] + (c[n * 2 - 2] - c[0]) * (sim.s[i] / Math.max(0.01, lanes.length[l]));
        const z = c[1] + (c[n * 2 - 1] - c[1]) * (sim.s[i] / Math.max(0.01, lanes.length[l]));
        const dx = cam.x - x, dz = cam.z - z;
        const distance = Math.hypot(dx, dz);
        const toCam = Math.atan2(dz, dx);
        const off = Math.abs(angleDiff(yawRad(cam), toCam));
        const inFov = distance <= cam.range_m && off <= (cam.fov_deg * Math.PI / 180) / 2;
        const key = `${i}|${sim.gen[i]}|${cam.camera_id}`;
        let st = states.get(key);
        if (!st) { st = { phase: 'idle', tRed: 0, inFovS: 0, distanceM: distance }; states.set(key, st); }
        if (inFov) st.inFovS += 0.5; else { st.phase = 'idle'; continue; }
        const group = arriveGroup[lanes.st[l]];
        const green = controller.isGreen(node, lanes.st[l], tSim);
        const crossed = sim.s[i] > stopPos;
        if (!green && !crossed) {
          if (st.phase === 'idle') { st.phase = 'grace'; st.tRed = tSim; }
        } else if (green) st.phase = 'idle';
        const rec0 = rec0Of(i);
        if (st.phase === 'grace' && crossed && tSim - st.tRed > GRACE_S) {
          st.phase = 'idle';
          const meta = metaByNode.get(node);
          const kindName = TRAFFIC_KINDS[sim.kind[i]].name;
          const slot = i + 1, gen = sim.gen[i];
          const ocr = ocrNoise32(rec0.plate, distance, cam.range_m, tSim, slot, gen);
          const cycle_id = controller.cycleIdOf(node, tSim);
          const dedupe = `${slot}|${meta?.node_id ?? node}|${cycle_id}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          const confidence = Math.max(0, Math.min(1,
            0.5 * ocr.ocr_confidence + 0.3 * (1 - distance / cam.range_m) + 0.2 * (st.inFovS >= 1 ? 1 : 0)));
          const phaseFor = controller.stateOf(node, tSim).phases.find(p => p.group === group);
          const carLike = kindName !== 'motorbike';
          out.push({
            violation_code: 'RED-LIGHT',
            violation_label: 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
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
        frameDetections.push({ vehicle_id: `V-${String(i + 1).padStart(6, '0')}`, kind: rec0.vehicle_class, color: rec0.color, distance_m: +distance.toFixed(1), in_fov_s: +st.inFovS.toFixed(1) });
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
