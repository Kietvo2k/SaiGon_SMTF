// M5b-1b — WRONG-WAY: xe máy riêng đi NGƯỢC chiều đường một chiều. Tác nhân không thuộc mô hình làn/mô phỏng xe:
// nó chạy ngược theo hình học cạnh (s giảm dần trên làn đúng của cạnh) và lệch sang lề trái để không chồng lên xe đi đúng.
// Chỉ perception (ghi bản ghi + bằng chứng) và vẽ 3D đọc tác nhân này. Thuần JS, chạy được trong Node.
export const WRONG_WAY_32_VERSION = 'wrong-way-32a';
export const WRONG_SLOT_BASE_32 = 990000;   // slot ảo (ngoài dải xe của sim): V-990000, V-990001, …
export const WRONG_FIRST_S_32 = 90;         // s sim: chuyến đầu tiên
export const WRONG_PERIOD_S_32 = 240;       // s: khoảng cách giữa hai chuyến (hiếm)
export const WRONG_SPEED_MPS_32 = 5.5;      // m/s (≈ 20 km/h)
export const WRONG_LAT_EXTRA_M_32 = 1.2;    // m: lệch thêm ra ngoài mép trái của làn (lề trái)

// zone: { camera_id, l (làn tham chiếu), latv (lệch ngang tuyệt đối, m), L (chiều dài làn, m) } hoặc null (không có chuyến).
// geo: { lanePoint(l, sl, latv, out), laneY(l, sl) } từ createTrafficGeometry31; liftY tùy chọn (như poseAt của xe).
export function createWrongWayAgents32({ zone, geo, liftY = null, firstS = WRONG_FIRST_S_32, periodS = WRONG_PERIOD_S_32,
  speedMps = WRONG_SPEED_MPS_32, horizonS = 3600 }) {
  const trips = [];
  if (zone && geo) {
    for (let k = 0; firstS + k * periodS < horizonS; k++) {
      trips.push({ slot: WRONG_SLOT_BASE_32 + k, t0: firstS + k * periodS, dur: zone.L / speedMps });
    }
  }
  const Q = {}, Qa = {}, Qb = {};
  // Tư thế của tác nhân tại thời điểm t (s); null khi chưa xuất hiện hoặc đã đi hết tuyến.
  const poseOf = (trip, t) => {
    const age = t - trip.t0;
    if (age < 0 || age > trip.dur) return null;
    const s = Math.max(0, zone.L - age * speedMps);
    geo.lanePoint(zone.l, s, zone.latv, Q);
    const x = Q.x, z = Q.z;
    const base = geo.laneY(zone.l, s);
    const y = liftY ? liftY(zone.l, s, x, z, base) : base;
    // Hướng đi = ngược với hướng vẽ của cạnh (tiếp tuyến theo s, lấy đối dấu).
    geo.lanePoint(zone.l, Math.min(zone.L, s + 0.5), zone.latv, Qa);
    geo.lanePoint(zone.l, Math.max(0, s - 0.5), zone.latv, Qb);
    let hx = -(Qa.x - Qb.x), hz = -(Qa.z - Qb.z);
    const len = Math.hypot(hx, hz) || 1;
    hx /= len; hz /= len;
    return { slot: trip.slot, gen: 0, camera_id: zone.camera_id, kind: 0, lane: zone.l, x, y, z, hx, hz, s, v: speedMps,
      len: 1.9, wid: 0.7, h: 1.62 };
  };
  return {
    version: WRONG_WAY_32_VERSION,
    trips: () => trips.map(t => ({ slot: t.slot, t0: t.t0, dur: t.dur })),
    // Các tác nhân đang trên tuyến ở thời điểm t (sim s).
    activeAt(t) {
      const out = [];
      for (const trip of trips) { const p = poseOf(trip, t); if (p) out.push(p); }
      return out;
    }
  };
}
