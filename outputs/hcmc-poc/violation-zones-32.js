// M5b-1b — vùng quan sát theo camera: điểm đo tốc độ (SPEED), vùng cấm đỗ (PARK) và tuyến đi ngược chiều (WRONG-WAY).
// Chọn theo ID cạnh (OSM way) và ĐOẠN LÀN NHÌN THẤY trong FOV camera (cùng phép thử với perception): đoạn s liên tục
// dài nhất nằm trong khung ảnh bằng chứng. Không suy từ toạ độ tay; cấu hình ZONE_SPEC_32 chỉ nêu cạnh và làn.
// Thuần JS, chạy được trong Node.
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
import { inFrame32 } from './violation-perception-32.js?v=32a';
import { WRONG_LAT_EXTRA_M_32 } from './wrong-way-32.js?v=32a';

export const ZONES_32_VERSION = 'zones-32a';
// Cạnh (OSM way) và làn theo camera. k: chỉ số làn trên cạnh (0 = làn ngoài cùng bên phải, số lớn = bên trái), 'left' = làn trái nhất.
// Điểm đo tốc độ và vùng cấm đỗ nằm trên làn xe máy (k=0 của trục ≥ 2 làn; ô tô không vào làn đó, trừ ô tô vi phạm LANE):
// lỗi SPEED/PARK tại đây là xe máy. Đoạn trên làn cầu Hàng Xanh (478798993) quá thưa để đo tốc độ, nên không dùng.
export const ZONE_SPEC_32 = Object.freeze({
  'CAM-HX-001': Object.freeze({
    speed: Object.freeze({ way: 326771003, k: 0 }),                   // điểm đo tốc độ: đoạn nhìn thấy của làn xe máy (đông nhất trong FOV)
    park: Object.freeze({ way: 326771003, k: 0, margin_m: 3 }),       // vùng cấm đỗ: cùng đoạn, làn xe máy trong FOV
    wrongWay: Object.freeze({ way: 326771003, k: 'left' })            // cùng cạnh, lề trái (ngược chiều)
  })
});
const MIN_RUN_M = 12;   // đoạn nhìn thấy tối thiểu để đặt vùng

// Đoạn s liên tục dài nhất của làn l nằm trong FOV của cam (lấy mẫu 0,5 m), hoặc null.
function visibleRunOf(geo, lanes, l, cam) {
  const Q = {};
  const L = lanes.length[l];
  let best = null, cur = null;
  for (let s = 0; s <= L + 1e-9; s += 0.5) {
    const sl = Math.min(L, s);
    geo.lanePoint(l, sl, lanes.offset[l], Q);
    const ok = Math.hypot(Q.x - cam.x, Q.z - cam.z) < cam.range_m && inFrame32(Q.x, Q.z, cam);
    if (ok) { if (cur === null) cur = sl; }
    else if (cur !== null) { if (!best || sl - cur > best[1] - best[0]) best = [cur, sl]; cur = null; }
  }
  if (cur !== null && (!best || L - cur > best[1] - best[0])) best = [cur, L];
  return best && best[1] - best[0] >= MIN_RUN_M ? best : null;
}

// Làn của cạnh `way` (theo k) có đoạn nhìn thấy dài nhất trong FOV cam; trả về {l, s0, s1, edge, k} hoặc null.
function pickLane(net, geo, cam, way, k) {
  const { lanes, E } = net;
  let pick = null;
  for (let l = 0; l < net.NL; l++) {
    const e = lanes.edge[l];
    if (E[e].way !== way) continue;
    const n = lanes.n[l];
    if (k === 'left' ? lanes.k[l] !== n - 1 : lanes.k[l] !== k) continue;
    const run = visibleRunOf(geo, lanes, l, cam);
    if (!run) continue;
    if (!pick || run[1] - run[0] > pick.s1 - pick.s0) pick = { l, s0: run[0], s1: run[1], edge: e, k: lanes.k[l], n };
  }
  return pick;
}

// Dựng vùng từ spec cho các camera trong registry. Trả về mảng theo làn (−1 = không có vùng) và tuyến WRONG-WAY.
//   { NL, parkS0, parkS1, speedS0, speedS1, wrongWay: {camera_id, l, latv, L} | null, describe: [...] }
export function buildZones32({ net, cameras, spec = ZONE_SPEC_32, geo = null }) {
  const g = geo || createTrafficGeometry31(net, null);
  const NL = net.NL;
  const out = { NL, parkS0: new Float32Array(NL).fill(-1), parkS1: new Float32Array(NL).fill(-1),
    speedS0: new Float32Array(NL).fill(-1), speedS1: new Float32Array(NL).fill(-1), wrongWay: null, describe: [] };
  for (const cam of cameras || []) {
    const sp = spec[cam.camera_id];
    if (!sp) continue;
    if (sp.park) {
      const p = pickLane(net, g, cam, sp.park.way, sp.park.k);
      if (p) {
        const m = sp.park.margin_m ?? 0;
        // Vùng cấm đỗ = toàn bộ đoạn nhìn thấy trừ mép (xe đỗ phải nằm gọn trong FOV suốt 60 s).
        out.parkS0[p.l] = p.s0 + m; out.parkS1[p.l] = p.s1 - m;
        out.describe.push({ kind: 'park', camera_id: cam.camera_id, lane: p.l, edge: p.edge, k: p.k, s0: +(p.s0 + m).toFixed(1), s1: +(p.s1 - m).toFixed(1) });
      }
    }
    if (sp.speed) {
      const p = pickLane(net, g, cam, sp.speed.way, sp.speed.k);
      if (p) {
        // Điểm đo tốc độ = đoạn nhìn thấy của làn (xe đo khi đi qua đoạn trong FOV).
        out.speedS0[p.l] = p.s0; out.speedS1[p.l] = p.s1;
        out.describe.push({ kind: 'speed', camera_id: cam.camera_id, lane: p.l, edge: p.edge, k: p.k, s0: +p.s0.toFixed(1), s1: +p.s1.toFixed(1) });
      }
    }
    if (sp.wrongWay && !out.wrongWay) {
      const p = pickLane(net, g, cam, sp.wrongWay.way, sp.wrongWay.k);
      if (p) {
        // Tác nhân đi ngược chiều lệch ra ngoài mép trái của làn trái nhất (lề trái, không chồng xe đi đúng).
        const { lanes } = net;
        const w = lanes.width[p.l];
        const latv = lanes.offset[p.l] - w / 2 - WRONG_LAT_EXTRA_M_32;
        out.wrongWay = { camera_id: cam.camera_id, l: p.l, latv, L: lanes.length[p.l] };
        out.describe.push({ kind: 'wrong-way', camera_id: cam.camera_id, lane: p.l, edge: p.edge, k: p.k, latv: +latv.toFixed(2) });
      }
    }
  }
  return out;
}
