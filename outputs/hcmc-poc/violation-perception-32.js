// Perception M1/M5b-1/M5b-1b — mô phỏng có quy luật (không train model). Thuần JS, chạy được trong Node.
// RED-LIGHT: máy trạng thái watch → grace → violation (spec §7.2). M5b-1: LANE, SPEED, PARK, WRONG-TURN (hành vi do sim
// tác động) và NO-HELMET, OVERLOAD, PHONE, NO-SEATBELT (thuộc tính xe/người). M5b-1b: SPEED đo tại điểm đo (zones.speed*),
// PARK trong vùng cấm đỗ (zones.park*), WRONG-WAY từ tác nhân ngược chiều (ghosts). Chỉ bật các mã trong `codes`;
// mặc định ['RED-LIGHT'] như trước M5b-1. Mã hành vi chỉ được ghi khi sim có `behavior` (sim.behaviorOn).
import { hashU32, TRAFFIC_KINDS, SEED, createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { violatorOf32, penaltyOf32, CODE_LABEL_32, PARK_STILL_S_32, SPEED_OVER_KMH_32,
  LEFT_TURN_RAD_32, BEHAVIOR_CODES_32, TRAIT_CODES_32 } from './violation-rules-32.js?v=32a';
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

export const PERCEPTION_32_VERSION = 'perception-32d';
export const GRACE_S = 0.8;
export const VIOLATION_RATE = 0.03;
// Biển đọc (OCR) phải đúng định dạng đặc tả §4.3 (cùng regex backend PLATE_PATTERN). Không khớp (mất ký tự,…) → needs_review.
const PLATE_RE_32 = {
  car: /^[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}$/,
  motorbike: /^[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2}$/
};
// Độ tin cậy trần khi biển đọc sai định dạng: dưới ngưỡng 0,85 của trạm/backend → backend ghi `needs_review`.
export const PLATE_MISREAD_CONF_CAP_32 = 0.84;
export const plateFormatOk32 = (plate, plateFormat) => !!(PLATE_RE_32[plateFormat] && PLATE_RE_32[plateFormat].test(String(plate || '')));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashWord = rnd => Math.floor(rnd() * 4294967296) >>> 0;

const SERIES = 'ABCDEFGHKLMNPRSTUVWXYZ';   // bỏ I, J, O, Q theo lệ đặt biển (cần xác minh tập ký tự thực tế)
const COLORS = ['trắng', 'đen', 'xám', 'bạc', 'đỏ', 'xanh dương', 'xanh lá', 'vàng', 'nâu', 'cam', 'hồng', 'tím'];
const OWNERS = [];   // điền từ backend/app/seed/owners.json khi chạy trên Node; mặc định 200 tên trong seed.
// Độ tin cậy nhân theo loại lỗi: thuộc tính khó nhìn (điện thoại, dây an toàn) thấp hơn → thường `needs_review`.
const CONF_FACTOR = { PHONE: 0.8, 'NO-SEATBELT': 0.8, OVERLOAD: 0.9 };
const KIND_HEIGHT_32 = new Map(TRAFFIC_KINDS.map(k => [k.name, k.height]));

// STATION-b — độ tin cậy tổng hợp phản ánh 4 yếu tố hình học quan sát được (ngoài OCR):
// (1) khoảng cách xe–camera: gần cao hơn; (2) góc nhìn: gần giữa khung cao hơn;
// (3) xe bị che bởi xe khác đứng giữa camera và xe: thấp hơn; (4) kích thước xe trong khung (pixel): lớn = rõ hơn.
// Ngưỡng trạng thái (spec §4.4): confidence ≥ 0,85 VÀ OCR ≥ 0,75 → `new`; ngược lại (hoặc biển sai định dạng) → `needs_review`.
export const CONF_STATUS_MIN_32 = 0.85;
export const OCR_STATUS_MIN_32 = 0.75;
export const SIZE_IDEAL_PX_32 = 18;       // chiều cao xe trong khung coi là đủ rõ (px, khung 1280×720)
export const DIST_FALLOFF_POW_32 = 2.2;   // độ dốc hạ tin cậy theo khoảng cách (so với tầm camera)
export const OCCL_PENALTY_32 = 0.3;       // mức hạ tin cậy mỗi xe khác che giữa camera và xe
export const CONF_WEIGHTS_32 = { ocr: 0.42, distance: 0.08, angle: 0.10, size: 0.32, visibility: 0.08 };

const clamp01_32 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// Góc nhìn: cos góc giữa trục quang camera (chiếu xuống mặt phẳng XZ) và hướng camera→xe; 1 = chính giữa khung.
export function viewCosAngle32(x, z, cam) {
  const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz) || 1;
  const yaw = cam.yaw_deg * Math.PI / 180;
  return clamp01_32((dx * Math.cos(yaw) + dz * Math.sin(yaw)) / d);
}
// Chiều cao xe trong khung (px) theo phép chiếu camera (FOV dọc, cùng khung bằng chứng 1280×720).
export function vehicleHeightPx32(kindHeightM, distanceM, cam, frameH = EVIDENCE_H) {
  const th = Math.tan((cam.fov_deg || 60) * Math.PI / 360);
  return kindHeightM * frameH / (2 * Math.max(0.5, distanceM) * th);
}
// Độ tin cậy tổng hợp của một bản ghi; `occluders` = số xe khác nằm giữa camera và xe này.
export function confidenceOf32({ ocr, distance, cam, vehPx, viewCos, occluders = 0, code = null }) {
  const w = CONF_WEIGHTS_32;
  const dScore = clamp01_32(1 - Math.pow(Math.min(1, distance / cam.range_m), DIST_FALLOFF_POW_32));
  const aScore = clamp01_32(viewCos);
  const sScore = clamp01_32(vehPx / SIZE_IDEAL_PX_32);
  const vScore = clamp01_32(1 - OCCL_PENALTY_32 * occluders);
  const raw = w.ocr * ocr + w.distance * dScore + w.angle * aScore + w.size * sScore + w.visibility * vScore;
  return clamp01_32(raw * (CONF_FACTOR[code] ?? 1));
}

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
// zones (M5b-1b, tùy chọn): { NL, parkS0, parkS1, speedS0, speedS1 } theo làn (−1 = không có vùng) — xem zones-32.js.
// ghosts (tùy chọn): { activeAt(t) } — tác nhân WRONG-WAY đang trên tuyến (wrong-way-32.js).
export function createPerception32({ net, sim, controller, nodeMap, cameras, seed = SEED, codes = ['RED-LIGHT'], restrictedNodes = [],
  zones = null, ghosts = null }) {
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
  const seenB = new Set();      // `${slot}|${gen}|${node_id}|${code}` đã sinh (hành vi, thuộc tính, tác nhân)
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
  // Số xe khác đang che giữa camera và xe i: hình chiếu xuống mặt phẳng XZ, xe j nằm trên tia camera→xe
  // (0,8 m < t < L−0,8 m) và lệch ngang < 1,4 m thì coi là che khuất.
  const occludersOf = (i, x, z, cam) => {
    const ux = x - cam.x, uz = z - cam.z, L = Math.hypot(ux, uz) || 1;
    const ax = ux / L, az = uz / L;
    let n = 0;
    for (let j = 0; j < sim.N; j++) {
      if (j === i || !sim.active[j]) continue;
      const p = poseOf(j, sim.lane[j]);
      const vx = p.x - cam.x, vz = p.z - cam.z;
      const t = vx * ax + vz * az;
      if (t <= 0.8 || t >= L - 0.8) continue;
      if (Math.abs(-az * vx + ax * vz) < 1.4) { n++; if (n >= 3) break; }
    }
    return n;
  };
  // Điểm đo tốc độ / vùng cấm đỗ theo làn (zones, −1 = không có).
  const inSpeedTrap = (l, s) => !!zones && zones.speedS0 && zones.speedS0[l] >= 0 && s >= zones.speedS0[l] && s <= zones.speedS1[l];
  const inParkZone = (l, s) => !!zones && zones.parkS0 && zones.parkS0[l] >= 0 && s >= zones.parkS0[l] && s <= zones.parkS1[l];

  // Ghi một bản ghi (dùng chung cho mọi mã trừ RED-LIGHT, vốn có nhánh riêng vì ân hạn và pha đèn).
  // veh = { slot, gen, kindName, rec0, speedKmh, speedLimit? }; pose (tùy chọn) = tư thế thật của tác nhân ghi bằng chứng.
  const camNodeIdx = new Map();
  for (const m of nodeMap) if (m.node_id && idxByOsm.has(m.osm_id)) camNodeIdx.set(m.node_id, idxByOsm.get(m.osm_id));
  const pushRecord = ({ code, veh, cam, node: node0, l, tSim, distance, st, excessKmh = 0, extra = {}, pose = null, vi = -1 }) => {
    const node = (code === 'PARK' || code === 'WRONG-TURN') ? node0 : (camNodeIdx.get(cam.node_id) ?? node0);
    const { slot, gen, kindName, rec0 } = veh;
    const ocr = ocrNoise32(rec0.plate, distance, cam.range_m, tSim, slot, gen);
    const cycle_id = cycleOf(node, tSim);
    const key = `${slot}|${gen}|${node}|${code}`;
    if (seenB.has(key)) return;
    seenB.add(key);
    const plateOk = plateFormatOk32(ocr.plate_read, rec0.plate_format);
    // Độ tin cậy: OCR + khoảng cách + góc nhìn + kích thước xe trong khung + che khuất (confidenceOf32).
    const vehPx = vehicleHeightPx32(KIND_HEIGHT_32.get(kindName) ?? 1.5, distance, cam);
    const viewCos = pose ? viewCosAngle32(pose.x, pose.z, cam) : 1;
    const occluders = pose ? occludersOf(vi, pose.x, pose.z, cam) : 0;
    let confidence = confidenceOf32({ ocr: ocr.ocr_confidence, distance, cam, vehPx, viewCos, occluders, code });
    if (!plateOk) confidence = Math.min(confidence, PLATE_MISREAD_CONF_CAP_32);
    const stat = controller && controller.stateOf ? controller.stateOf(node, tSim) : null;
    const metaN = metaByNode.get(node);
    out.push({
      violation_code: code,
      violation_label: CODE_LABEL_32[code],
      status: confidence >= CONF_STATUS_MIN_32 && ocr.ocr_confidence >= OCR_STATUS_MIN_32 && plateOk ? 'new' : 'needs_review',
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
        speed_kmh: +veh.speedKmh.toFixed(1), speed_limit_kmh: veh.speedLimit ?? speedLimitOf(l)
      },
      confidence: +confidence.toFixed(3), ocr_confidence: +ocr.ocr_confidence.toFixed(3),
      detection: { in_fov_s: +st.inFovS.toFixed(1), distance_m: +distance.toFixed(1), grace_s: null, crossed_stop_line_at_s: null, observed_at_s: +tSim.toFixed(1),
        ...(code === 'OVERLOAD' ? { persons: 3 } : {}), ...extra },
      evidence: [],
      penalty: penaltyOf32(code, kindName, excessKmh),
      sim: { t_sim: +tSim.toFixed(1), seed, scenario: 'peak-hang-xanh', station_id: 'STATION-3D-01', station_time: new Date().toISOString() },
      review: { by: null, at: null, note: null }, complaint_ids: [],
      _pose: pose   // không gửi lên backend (không thuộc VIOLATION_FIELDS_32): tư thế dùng cho bằng chứng tác nhân
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

  // Bản ghi RED-LIGHT (dùng cho cả đường quan sát thường và đường nội suy khi quét thưa).
  const emitRed = ({ i, slot, gen, kindName, cam, node: node0, l, group, tc, tr, distance, st, interpolated }) => {
    const node = node0;   // nút mà làn đi tới (vạch dừng), như trước M5b-1b
    const meta = metaByNode.get(node);
    const cycle_id = controller.cycleIdOf(node, tc);
    const dedupe = `${slot}|${meta?.node_id ?? node}|${cycle_id}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const ocr = ocrNoise32(rec0Of(i).plate, distance, cam.range_m, tc, slot, gen);
    const rec0 = rec0Of(i);
    const plateOk = plateFormatOk32(ocr.plate_read, rec0.plate_format);
    // STATION-b: tin cậy theo OCR + khoảng cách + góc nhìn + kích thước xe (px) + bị che (như pushRecord).
    const p = poseOf(i, l);
    const vehPx = vehicleHeightPx32(KIND_HEIGHT_32.get(kindName) ?? 1.5, distance, cam);
    let confidence = confidenceOf32({ ocr: ocr.ocr_confidence, distance, cam, vehPx,
      viewCos: viewCosAngle32(p.x, p.z, cam), occluders: occludersOf(i, p.x, p.z, cam), code: 'RED-LIGHT' });
    if (!plateOk) confidence = Math.min(confidence, PLATE_MISREAD_CONF_CAP_32);
    const stNow = controller.stateOf(node, tc);
    const carLike = kindName !== 'motorbike';
    out.push({
      violation_code: 'RED-LIGHT',
      violation_label: CODE_LABEL_32['RED-LIGHT'],
      status: confidence >= CONF_STATUS_MIN_32 && ocr.ocr_confidence >= OCR_STATUS_MIN_32 && plateOk ? 'new' : 'needs_review',
      priority_flag: false, priority_reason: null,
      plate: ocr.plate_read, plate_format: rec0.plate_format, vehicle_class: kindName,
      vehicle_color: rec0.color, vehicle_id: `V-${String(slot).padStart(6, '0')}`,
      owner_name: rec0.owner_name, owner_phone: rec0.owner_phone, is_scenario_plate: rec0.is_scenario,
      occurred_at: null, node_id: meta?.node_id ?? String(G.nodes[node].id),
      node_osm_id: G.nodes[node].id, node_label: meta?.label ?? '',
      camera_id: cam.camera_id, road_index: lanes.edge[l], lane_index: l,
      signal: {
        mode: controller.getMode(), cluster_id: stNow.cluster_id,
        cycle_id, phase_for_vehicle: 'red', group,
        elapsed_in_phase_s: +(tc - tr).toFixed(1), cycle_s: stNow.cycle_s,
        speed_kmh: +(sim.v[i] * 3.6).toFixed(1), speed_limit_kmh: speedLimitOf(l)
      },
      confidence: +confidence.toFixed(3), ocr_confidence: +ocr.ocr_confidence.toFixed(3),
      detection: { in_fov_s: +st.inFovS.toFixed(1), distance_m: +distance.toFixed(1), grace_s: GRACE_S, crossed_stop_line_at_s: +tc.toFixed(1),
        ...(interpolated ? { crossing: 'nội suy giữa hai lần quét' } : {}) },
      evidence: [],
      penalty: carLike
        ? { vnd_min: 18000000, vnd_max: 20000000, license_deduction_points: 4, source: 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b', verified: true }
        : { vnd_min: 4000000, vnd_max: 6000000, license_deduction_points: 4, source: 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm c', verified: true },
      sim: { t_sim: +tc.toFixed(1), seed, scenario: 'peak-hang-xanh', station_id: 'STATION-3D-01', station_time: new Date().toISOString() },
      review: { by: null, at: null, note: null }, complaint_ids: [],
      _pose: null
    });
  };

  const lastGhostScan = new Map();   // camera_id → thời điểm sim của lần quét trước (tác nhân WRONG-WAY)
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
        // Quét có thể thưa (app ×10 quét mỗi ~5 s sim): dt là thời gian thật giữa hai lần quét (kẹp 10 s); nhớ lần quét trước.
        const prevT = st.lastT, prevS = st.lastS, prevL = st.lastL, prevInFov = st.lastInFov;
        const dt = Math.min(10, Math.max(0, tSim - st.lastT)); st.lastT = tSim;
        st.lastS = sim.s[i]; st.lastL = l;
        if (inFov) st.inFovS += Math.max(0.5, dt); else { st.phase = 'idle'; st.overS = 0; st.stillS = 0; st.lastInFov = false; continue; }
        st.lastInFov = true;
        const kindName = TRAFFIC_KINDS[sim.kind[i]].name;
        const slot = i + 1, gen = sim.gen[i];
        const veh = () => ({ slot, gen, kindName, rec0: rec0Of(i), speedKmh: sim.v[i] * 3.6 });
        // ---- RED-LIGHT (spec §7.2): ân hạn tính từ lúc nhóm CHUYỂN ĐỎ; ghi khi vượt vạch lúc đèn đỏ, sau ân hạn.
        if (enabled.has('RED-LIGHT')) {
          const group = arriveGroup[lanes.st[l]];
          const green = controller.isGreen(node, lanes.st[l], tSim);
          const crossed = sim.s[i] > stopPos;
          // Ân hạn tính từ lúc nhóm xe CHUYỂN ĐỎ (spec §7.2), không tính pha vàng: xe đã vào nút khi xanh thì đi tiếp.
          const isRed = phaseOfGroup(node, group, tSim) === 'red';
          let redDone = false;
          if (isRed && !crossed) {
            if (st.phase === 'idle') { st.phase = 'grace'; st.tRed = tSim; }
          } else if (green) st.phase = 'idle';
          // Chốt tại lần quét xe vượt vạch: nhóm xe còn đỏ (không ghi khi pha vàng).
          if (st.phase === 'grace' && crossed && !isRed) { st.phase = 'idle'; redDone = true; }
          if (st.phase === 'grace' && crossed && isRed && tSim - st.tRed > GRACE_S) {
            st.phase = 'idle'; redDone = true; st.emitted.add('RED-LIGHT');
            emitRed({ i, slot, gen, kindName, cam, node, l, group, tc: tSim, tr: st.tRed, distance, st, interpolated: false });
          }
          // M5b-1b: quét thưa (app ×10 quét mỗi ~5 s sim) thường không thấy xe hai lần quanh vạch. Khi xe đã qua vạch
          // mà chưa ghi: nội suy thời điểm vượt (giữa hai lần quét nếu thấy cả hai, không thì từ vị trí và tốc độ lúc quét),
          // rồi tra khoảng đỏ của nhóm tại thời điểm đó. Mỗi xe tối đa một lần cho RED-LIGHT trong một camera.
          if (!redDone && crossed && !st.emitted.has('RED-LIGHT')) {
            let tc;
            if (prevInFov && prevL === l && prevS !== undefined && prevS <= stopPos) {
              const v = Math.max(0.1, (sim.s[i] - prevS) / Math.max(1e-6, tSim - prevT));
              tc = prevT + (stopPos - prevS) / v;
            } else {
              tc = tSim - (sim.s[i] - stopPos) / Math.max(1, sim.v[i]);
            }
            const iv = sim.redIntervalAt ? sim.redIntervalAt(node, group, tc) : null;
            if (iv && tc - iv.on > GRACE_S) { st.emitted.add('RED-LIGHT'); emitRed({ i, slot, gen, kindName, cam, node, l, group, tc, tr: iv.on, distance, st, interpolated: true }); }
          }
        }
        // ---- M5b-1/1b: lỗi hành vi (sim tác động) và thuộc tính xe/người (theo seed).
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
                pushRecord({ code, veh: veh(), cam, node, l, tSim, distance, st, pose: { x, z }, vi: i, extra: { lane_k: lanes.k[l], lanes_in_state: lanes.n[l] } });
              }
            } else if (code === 'SPEED') {
              // M5b-1b: đo tại ĐIỂM ĐO TỐC ĐỘ (zones.speed*): xe trên đoạn đo mà vượt giới hạn đoạn + 5 km/h thì ghi.
              const passedTrap = prevInFov !== undefined && prevL === l && prevS !== undefined && !!zones && zones.speedS0 && zones.speedS0[l] >= 0
                && prevS < zones.speedS1[l] && sim.s[i] > zones.speedS0[l];
              if ((inSpeedTrap(l, sim.s[i]) || passedTrap) && speedKmh > limit + SPEED_OVER_KMH_32) {
                st.emitted.add(code);
                pushRecord({ code, veh: veh(), cam, node, l, tSim, distance, st, pose: { x, z }, vi: i, excessKmh: +(speedKmh - limit).toFixed(1),
                  extra: { speed_limit_kmh: limit, measured_at: 'điểm đo tốc độ' } });
              }
            } else if (code === 'PARK') {
              // M5b-1b: vùng cấm đỗ trong FOV camera (zones.park*): đứng yên ≥ 60 s trong vùng, không có xe đứng ngay trước.
              st.stillS = sim.v[i] < 0.15 ? st.stillS + dt : 0;
              if (st.stillS >= PARK_STILL_S_32 && inParkZone(l, sim.s[i]) && !hasStoppedLeader(i, l)) {
                st.emitted.add(code);
                pushRecord({ code, veh: veh(), cam, node, l, tSim, distance, st, pose: { x, z }, vi: i, extra: { still_s: +st.stillS.toFixed(1), zone: 'vùng cấm đỗ' } });
              }
            } else if (code === 'WRONG-TURN') {
              const laneLen = lanes.length[l];
              if (restricted.has(node) && laneLen - sim.s[i] <= 30 && leftTurnAt(l, sim.next[i])) {
                st.emitted.add(code);
                pushRecord({ code, veh: veh(), cam, node, l, tSim, distance, st, pose: { x, z }, vi: i, extra: { maneuver: 'rẽ trái' } });
              }
            } else if (TRAIT_CODES_32.includes(code) && enabled.has(code)) {
              st.emitted.add(code);
              pushRecord({ code, veh: veh(), cam, node, l, tSim, distance, st, pose: { x, z }, vi: i });
            }
          }
        }
        frameDetections.push({ vehicle_id: `V-${String(slot).padStart(6, '0')}`, kind: rec0Of(i).vehicle_class, color: rec0Of(i).color, distance_m: +distance.toFixed(1), in_fov_s: +st.inFovS.toFixed(1) });
      }
      // ---- M5b-1b: tác nhân WRONG-WAY (xe máy ngược chiều đường một chiều, ngoài mô hình làn). Quét thưa (×10): xét mọi
      // mốc 0,5 s từ lần quét trước tới nay, nên tác nhân đi qua khung giữa hai lần quét vẫn được ghi (đúng một lần).
      if (ghosts && enabled.has('WRONG-WAY')) {
        const from = lastGhostScan.has(cam.camera_id) ? lastGhostScan.get(cam.camera_id) : tSim;
        lastGhostScan.set(cam.camera_id, tSim);
        const times = [];
        for (let t = from; t < tSim - 1e-9; t += 0.5) times.push(t);
        times.push(tSim);
        const hit = new Map();   // slot → {g, distance, t} tại lần đầu tác nhân nằm trong khung
        for (const t of times) {
          for (const g of ghosts.activeAt(t)) {
            if (g.camera_id !== cam.camera_id || hit.has(g.slot)) continue;
            const distance = Math.hypot(cam.x - g.x, cam.z - g.z);
            if (distance <= cam.range_m && inFrame32(g.x, g.z, cam)) hit.set(g.slot, { g, distance, t });
          }
        }
        for (const [slot, h] of hit) {
          const key = `G${slot}|${cam.camera_id}`;
          let st = states.get(key);
          if (!st) { st = { phase: 'idle', tRed: 0, inFovS: 0, distanceM: h.distance, lastT: tSim, overS: 0, stillS: 0, emitted: new Set() }; states.set(key, st); }
          if (st.emitted.has('WRONG-WAY')) continue;
          st.emitted.add('WRONG-WAY');
          st.inFovS += Math.max(0.5, tSim - h.t);
          const g = h.g, rec0 = plateFor32(g.slot, g.gen, 'motorbike');
          pushRecord({ code: 'WRONG-WAY', veh: { slot: g.slot, gen: g.gen, kindName: 'motorbike', rec0, speedKmh: g.v * 3.6 },
            cam, node: camNodeIdx.get(cam.node_id) ?? lanes.to[g.lane], l: g.lane, tSim, distance: h.distance, st, pose: g,
            extra: { maneuver: 'đi ngược chiều', heading_deg: +(Math.atan2(g.hz, g.hx) * 180 / Math.PI).toFixed(1) } });
        }
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
