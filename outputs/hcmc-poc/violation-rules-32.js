// M5b-1 — luật và hành vi xe phạm lỗi (thuần JS, không THREE). Sim (city-traffic-sim-31.js) và perception
// (violation-perception-32.js) dùng chung các hàm ở đây nên hai bên luôn khớp: cùng (seed, xe, thế hệ) → cùng mã lỗi.
//   - Lỗi HÀNH VI (sim tác động): LANE, SPEED, PARK, WRONG-TURN. Sim chỉ tác động khi được truyền `behavior`.
//   - Lỗi TRẠNG THÁI (thuộc tính xe/người, không đổi chuyển động): NO-HELMET, OVERLOAD, PHONE, NO-SEATBELT.
//   - Lỗi TÁC NHÂN (M5b-1b): WRONG-WAY — xe máy riêng chạy ngược chiều đường một chiều theo hình học cạnh
//     (wrong-way-32.js), không thuộc mô hình làn; perception ghi khi nó nằm trong khung camera.
//   - RED-LIGHT: xe "chủ động vượt" theo chu kỳ đèn (spec §7.2), sim cho đi tiếp khi đèn vừa đỏ (0–3 s).
// Tỉ lệ (M5b-1b): đo trên 8 phút sim cao điểm ×10 để RED-LIGHT và LANE nổi bật; NO-HELMET/OVERLOAD/PHONE ít hơn.
export const VIOLATION_RULES_32_VERSION = 'violation-rules-32b';

export const RED_RATE_32 = 0.8;             // xác suất chủ động vượt đỏ trong một chu kỳ (spec §7.2)
export const RED_WINDOW_S_32 = 3;           // s: chỉ vượt trong 0–3 s đầu của đỏ
export const SPEED_MUL_32 = 1.5;            // hệ số tốc độ mong muốn của xe chạy quá tốc độ
export const SPEED_OVER_KMH_32 = 5;         // ngưỡng vượt (km/h) so với giới hạn đoạn (điểm đo tốc độ ghi khi vượt)
export const PARK_S_32 = 70;                // s xe đỗ sai trong sim (> 60 s để perception ghi)
export const PARK_STILL_S_32 = 60;          // s đứng yên tối thiểu để ghi PARK
export const LEFT_TURN_RAD_32 = 0.6;        // rad: góc rẽ tối thiểu để tính là rẽ trái (sim: turn < 0 = trái)
export const WRONG_TURN_BOOST_32 = 60;      // trọng số rẽ trái của xe vi phạm tại nút cấm
// Nút có biển cấm rẽ trái (đánh dấu trong dữ liệu, theo node_id của node_map.json). HX-04 có lối rẽ trái và lối đi thẳng
// nên xe thường vẫn có đường đi. Camera registry hiện tại (HX-01, HX-06) không nhìn thấy lối rẽ trái nào: lỗi này chưa có ảnh 3D.
export const RESTRICTED_NODE_IDS_32 = Object.freeze(['HX-04']);

export const BEHAVIOR_CODES_32 = Object.freeze(['LANE', 'SPEED', 'PARK', 'WRONG-TURN']);
export const TRAIT_CODES_32 = Object.freeze(['NO-HELMET', 'OVERLOAD', 'PHONE', 'NO-SEATBELT']);
export const AGENT_CODES_32 = Object.freeze(['WRONG-WAY']);
export const ALL_CODES_32 = Object.freeze(['RED-LIGHT', ...AGENT_CODES_32, ...BEHAVIOR_CODES_32, ...TRAIT_CODES_32]);
// Chỉ số mã hành vi trong mảng sim (0 = không vi phạm).
export const BEHAVIOR_IDX_32 = Object.freeze({ LANE: 1, SPEED: 2, PARK: 3, 'WRONG-TURN': 4 });

export const CODE_LABEL_32 = Object.freeze({
  'RED-LIGHT': 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông',
  'WRONG-WAY': 'Đi ngược chiều đường một chiều',
  LANE: 'Đi không đúng phần đường, làn đường',
  SPEED: 'Chạy quá tốc độ quy định',
  PARK: 'Dừng, đỗ xe trái quy định',
  'WRONG-TURN': 'Rẽ, quay đầu nơi có biển cấm',
  'NO-HELMET': 'Không đội mũ bảo hiểm khi điều khiển xe máy',
  OVERLOAD: 'Chở quá số người quy định',
  PHONE: 'Sử dụng điện thoại khi đang lái xe',
  'NO-SEATBELT': 'Không thắt dây đai an toàn khi lái xe'
});

// Hàm băm 32 bit (cùng công thức hashU32 của sim, sao chép để tránh vòng import).
export const hash32_32 = n => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
const unitOf = (seed, slot, gen, salt) =>
  hash32_32((seed ^ Math.imul(slot, 0x9e3779b1) ^ Math.imul(gen + 1, 0x85ebca77) ^ salt) >>> 0) / 4294967296;

// Bảng lỗi theo loại xe: [mã, xác suất] — cộng dồn, một xe tối đa một lỗi trạng thái/hành vi trong một thế hệ.
// M5b-1b so với M5b-1: LANE ô tô 1,5 % → 30 %; RED_RATE 3 % → 80 %; NO-HELMET xe máy 4 % → 2 %; OVERLOAD 2 % → 1,2 %;
// PHONE ô tô 1,5 % → 1,2 %, xe máy 1 % → 0,6 %; OVERLOAD xe máy 2 % → 1,8 %; SPEED/PARK xe máy 3 %/0,8 % → 12 %/12 % (đoạn đo và vùng cấm đỗ nằm trên làn xe máy).
const TABLE_CAR = [['LANE', 0.3], ['SPEED', 0.03], ['PARK', 0.008], ['WRONG-TURN', 0.015], ['PHONE', 0.012], ['NO-SEATBELT', 0.05]];
const TABLE_MOTO = [['SPEED', 0.12], ['PARK', 0.12], ['WRONG-TURN', 0.015], ['NO-HELMET', 0.02], ['OVERLOAD', 0.018], ['PHONE', 0.006]];
const TABLE_HEAVY = [['SPEED', 0.02]];

// Mã lỗi (hành vi hoặc trạng thái) gắn với xe (slot = chỉ số xe + 1, gen = thế hệ sau respawn), hoặc null.
// kindName: 'car' | 'motorbike' | 'bus' | 'truck' (tên trong TRAFFIC_KINDS).
export function violatorOf32(slot, gen, kindName, seed) {
  const table = kindName === 'car' ? TABLE_CAR : kindName === 'motorbike' ? TABLE_MOTO : TABLE_HEAVY;
  const u = unitOf(seed, slot, gen, 0x51ed27);
  let acc = 0;
  for (const [code, p] of table) { acc += p; if (u < acc) return code; }
  return null;
}

// Xe chủ động vượt đèn trong chu kỳ `cycleId` (spec §7.2: hash(seed ⊕ vehicle_id ⊕ cycle_id) < rate).
export function redViolatorOf32(slot, cycleId, seed) {
  return hash32_32((seed ^ Math.imul(slot, 0x9e3779b1) ^ Math.imul(cycleId + 1, 0x85ebca77) ^ 0x7e11) >>> 0) / 4294967296 < RED_RATE_32;
}

// Phạt theo NĐ 168/2024/NĐ-CP (bảng mục 13 của spec). verified=false → backend/web hiện "cần xác minh", không hiện số tiền.
// excessKmh: vượt bao nhiêu km/h (chỉ dùng cho SPEED).
export function penaltyOf32(code, vehicleClass, excessKmh = 0) {
  const car = vehicleClass !== 'motorbike';
  const P = (vnd_min, vnd_max, license_deduction_points, source, verified = true) =>
    ({ vnd_min, vnd_max, license_deduction_points, source, verified });
  const UNVERIFIED = 'chưa đối chiếu điều, khoản, điểm (cần xác minh)';
  switch (code) {
    case 'RED-LIGHT':
      return car ? P(18e6, 20e6, 4, 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm b')
        : P(4e6, 6e6, 4, 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm c');
    case 'WRONG-WAY':
      return car ? P(18e6, 20e6, 4, 'NĐ 168/2024 · Điều 6 · khoản 9 · điểm d')
        : P(4e6, 6e6, 2, 'NĐ 168/2024 · Điều 7 · khoản 7 · điểm a; khoản 13 · điểm a');
    case 'LANE':
      return car ? P(null, null, null, UNVERIFIED, false) : P(6e5, 8e5, 0, 'NĐ 168/2024 · Điều 7 · khoản 3 · điểm d');
    case 'SPEED':
      if (!car) {
        if (excessKmh > 20) return P(6e6, 8e6, null, 'NĐ 168/2024 · Điều 7 · khoản 8 · điểm a', false);
        return P(8e5, 1e6, null, 'NĐ 168/2024 · Điều 7 · khoản 4 · điểm a', false);
      }
      if (excessKmh > 35) return P(12e6, 14e6, 6, 'NĐ 168/2024 · Điều 6 · khoản 7 · điểm a');
      if (excessKmh > 20) return P(6e6, 8e6, 4, 'NĐ 168/2024 · Điều 6 · khoản 6 · điểm a');
      if (excessKmh >= 10) return P(4e6, 6e6, 2, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm đ');
      return P(8e5, 1e6, 0, 'NĐ 168/2024 · Điều 6 · khoản 3 · điểm a');
    case 'PARK':
      return car ? P(4e6, 6e6, 2, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm k')
        : P(4e5, 6e5, null, 'NĐ 168/2024 · Điều 7 · khoản 3 (chưa chốt điểm)', false);
    case 'WRONG-TURN':
      return car ? P(2e6, 3e6, 2, 'NĐ 168/2024 · Điều 6 · khoản 4 · điểm i, điểm k')
        : P(2e5, 4e5, 0, 'NĐ 168/2024 · Điều 7 · khoản 1 · điểm k');
    case 'NO-HELMET':
      return P(4e5, 6e5, 0, 'NĐ 168/2024 · Điều 7 · khoản 2 · điểm h, điểm i');
    case 'OVERLOAD':
      return P(null, null, null, UNVERIFIED, false);
    case 'PHONE':
      return car ? P(4e6, 6e6, 4, 'NĐ 168/2024 · Điều 6 · khoản 5 · điểm h; khoản 16 · điểm b')
        : P(8e5, 1e6, 4, 'NĐ 168/2024 · Điều 7 · khoản 4 · điểm đ; khoản 13 · điểm b');
    case 'NO-SEATBELT':
      return P(8e5, 1e6, 0, 'NĐ 168/2024 · Điều 6 · khoản 3 · điểm k');
    default:
      return P(null, null, null, UNVERIFIED, false);
  }
}

// Chỉ số nút (chỉ số trong G.nodes) của các nút cấm rẽ trái, từ node_id ↔ osm_id của node_map.
export function restrictedNodeIndices32(G, nodeMap, ids = RESTRICTED_NODE_IDS_32) {
  const osmOf = new Map(nodeMap.map(m => [m.node_id, m.osm_id]));
  const out = [];
  for (const id of ids) {
    const osm = osmOf.get(id);
    const idx = G.nodes.findIndex(n => n.id === osm);
    if (idx >= 0) out.push(idx);
  }
  return out;
}
