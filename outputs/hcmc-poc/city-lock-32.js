/*
 * City Lock 32 · M2a — "khóa khu" cho chế độ app=smart.
 *
 * Khi chạy ?app=smart chỉ khu Bắc (bac) là khu tham quan; ba khu còn lại
 * (trung-tam, ven-song, nam) là KHU KHÓA: không còn nhà/cây/chi tiết/đèn/đồ
 * đường phố/tàu, mặt đất và mặt nước chuyển xám nhạt, trên đường chỉ giữ
 * đường ≥ secondary. Trong khu Bắc:
 *   - nhà thường chỉ giữ nếu tâm cách tim đường trunk/primary/secondary ≤ 40 m
 *     (signature luôn giữ 100 % theo bất biến F); phần giữ được vẽ đơn giản để
 *     nhẹ tải,
 *   - đường residential/service/living_street/unclassified/footway ẩn, trừ khi
 *     đoạn đường nằm trong 80 m của một nút có đèn,
 *   - mô phỏng xe chỉ chạy trên cạnh ≥ tertiary.
 *
 * Module này chỉ chứa hàm THUẦN (không DOM, không THREE) để test được bằng
 * `node --test`; phần gắn vào cảnh nằm ở installRegionLock32 (gọi từ
 * webgpu-materials-24.js và chỉ chạy khi document tồn tại).
 */

export const CITY_LOCK_32_VERSION = 'city-lock-32a';
export const NORTH_REGION_ID_32 = 'bac';
export const LOCKED_REGION_IDS_32 = Object.freeze(['trung-tam', 'ven-song', 'nam']);
export const LOCK_LABEL_32 = '🔒 Khu vực đang khóa';
export const NORTH_KEEP_BUILDING_MAX_M_32 = 40;
export const NORTH_SIGNAL_RADIUS_M_32 = 80;
export const NORTH_MIN_SIM_RANK_32 = 2;      // tertiary
export const LOCKED_MIN_RENDER_RANK_32 = 3;  // secondary
export const CAMERA_MARGIN_M_32 = 400;
export const CAMERA_MIN_DISTANCE_32 = 150;
export const CAMERA_MAX_DISTANCE_32 = 5600;  // đủ thấy trọn khu Bắc (preset "Toàn khu Bắc" = 5000)

// Xếp hạng cấp đường; khớp DRIVE_RANK của city-traffic-sim-31.js để camera ẩn/hiện và sim nhất quán.
const RANK = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1, living_street: 1, service: 1, road: 1 };
const MINOR = new Set(['residential', 'service', 'living_street', 'unclassified', 'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track', 'platform', 'bridleway', 'corridor']);
const MAJOR_RANKS = [3, 4, 5];

export function normalizeRoadClass32(type) {
  return String(type ?? '').trim().toLowerCase().replace(/_link$/, '');
}
export function roadClassRank32(type) {
  return RANK[normalizeRoadClass32(type)] ?? 0;
}
export function isMinorRoadClass32(type) {
  return MINOR.has(normalizeRoadClass32(type));
}
// Cạnh sim được dùng khi khóa khu Bắc: ≥ tertiary.
export function simKeepsRoad32(type) {
  return roadClassRank32(type) >= NORTH_MIN_SIM_RANK_32;
}
// Đường được vẽ ở khu khóa: ≥ secondary.
export function lockedKeepsRoad32(type) {
  return roadClassRank32(type) >= LOCKED_MIN_RENDER_RANK_32;
}

// Điểm đường [[x,z],…]; chấp nhận cả mảng phẳng [x,z,x,z,…].
export function roadPoints32(road) {
  const c = road?.c || road?.centerline || [];
  const points = [];
  if (c.length && Array.isArray(c[0])) for (const p of c) points.push([+p[0], +p[1]]);
  else for (let i = 0; i + 1 < c.length; i += 2) points.push([+c[i], +c[i + 1]]);
  return points;
}
// Điểm đường → đoạn [[ax,az,bx,bz],…].
export function roadSegments32(road) {
  const points = roadPoints32(road);
  const segments = [];
  for (let i = 0; i + 1 < points.length; i++) segments.push([points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]]);
  return segments;
}
export function segmentDistance32(px, pz, [ax, az, bx, bz]) {
  const sx = bx - ax, sz = bz - az, l = sx * sx + sz * sz;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / l)) : 0;
  return Math.hypot(ax + sx * t - px, az + sz * t - pz);
}
// Điểm dùng để xét khu/khoảng cách: đỉnh đường + trung điểm đoạn (đủ dày cho đoạn cong dài).
function roadSamples32(road) {
  const out = [];
  for (const [ax, az, bx, bz] of roadSegments32(road)) { out.push([ax, az], [(ax + bx) / 2, (az + bz) / 2], [bx, bz]); }
  return out;
}
export function roadTouchesSignal32(road, signalPoints, radiusM = NORTH_SIGNAL_RADIUS_M_32) {
  if (!signalPoints?.length) return false;
  const r2 = radiusM * radiusM;
  for (const [x, z] of roadSamples32(road))
    for (const [sx, sz] of signalPoints)
      if ((x - sx) ** 2 + (z - sz) ** 2 <= r2) return true;
  return false;
}
// Nút có đèn (signal plan trả chỉ số nút đồ thị) → toạ độ [x,z] để lọc đường nhỏ quanh ngã tư.
export function signalPointsFromNodes32(nodes, signalNodes) {
  const out = [];
  for (const index of signalNodes || []) {
    const node = nodes?.[index];
    if (node && Number.isFinite(node.x) && Number.isFinite(node.z)) out.push([node.x, node.z]);
  }
  return out;
}

// Lưới đoạn đường theo ô vuông cạnh maxM: điểm chỉ cần so 3×3 ô quanh nó.
function buildSegmentGrid32(roads, ranks, cellM) {
  const cells = new Map();
  const key = (i, j) => i + ':' + j;
  for (const road of roads) {
    if (!ranks.includes(roadClassRank32(road.type))) continue;
    for (const seg of roadSegments32(road)) {
      const i0 = Math.floor(Math.min(seg[0], seg[2]) / cellM), i1 = Math.floor(Math.max(seg[0], seg[2]) / cellM);
      const j0 = Math.floor(Math.min(seg[1], seg[3]) / cellM), j1 = Math.floor(Math.max(seg[1], seg[3]) / cellM);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j); let list = cells.get(k); if (!list) cells.set(k, list = []); list.push(seg);
      }
    }
  }
  return {
    nearest(x, z) {
      const ci = Math.floor(x / cellM), cj = Math.floor(z / cellM);
      let best = Infinity;
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const list = cells.get(key(i, j));
        if (!list) continue;
        for (const seg of list) { const d = segmentDistance32(x, z, seg); if (d < best) best = d; }
      }
      return best;
    }
  };
}

/*
 * Lọc công trình khu Bắc (M2a · A3/B4):
 *   - tâm NGOÀI khu Bắc: không tính (đã bị mặt nạ khu ẩn),
 *   - signature: luôn giữ (bất biến F),
 *   - nhà thường: giữ nếu tâm cách tim trunk/primary/secondary ≤ maxM, còn lại bỏ.
 * Trả về `indices` (chỉ số mảng) để nơi gọi ẩn chi tiết, `ids` để đối chiếu dữ liệu.
 */
export function selectNorthBuildings32({ buildings, roads, regionOf, isSignature = () => false, maxM = NORTH_KEEP_BUILDING_MAX_M_32, northId = NORTH_REGION_ID_32, ranks = MAJOR_RANKS }) {
  const grid = buildSegmentGrid32(roads, ranks, Math.max(8, maxM));
  const ids = new Set(), indices = new Set(), ordinaryIndices = new Set(), ordinaryIds = new Set();
  const stats = { before: 0, ordinary: 0, kept: 0, dropped: 0, signature: 0, outside: 0 };
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i], center = building?.center || building?.c;
    if (!center) continue;
    const x = center[0], z = center[1];
    if (regionOf(x, z) !== northId) { stats.outside++; continue; }
    stats.before++;
    const id = building.id ?? i;
    if (isSignature(id)) { stats.signature++; ids.add(id); continue; }
    stats.ordinary++; ordinaryIndices.add(i); ordinaryIds.add(id);
    if (grid.nearest(x, z) <= maxM) { stats.kept++; ids.add(id); indices.add(i); }
    else stats.dropped++;
  }
  return {
    ids, indices, ordinaryIndices, ordinaryIds, grid,
    before: stats.before, ordinary: stats.ordinary, signature: stats.signature,
    kept: stats.kept + stats.signature, keptOrdinary: stats.kept, dropped: stats.dropped,
    ratio: stats.ordinary ? stats.kept / stats.ordinary : 0
  };
}

/*
 * Ẩn đường theo khóa khu (M2a · A1/C5):
 *   - mọi điểm dò của đường thuộc khu Bắc: ẩn đường nhỏ (MINOR) TRỪ khi có điểm
 *     dò trong bán kính 80 m của nút có đèn; đường từ tertiary trở lên luôn giữ,
 *   - còn lại (đường thuộc khu khóa): chỉ giữ ≥ secondary,
 *   - way signature không bao giờ bị ẩn.
 * Trả về Set chỉ số mảng `roads` cần ẩn + số liệu đối chiếu.
 */
export function lockRoadFilter32({ roads, regionOf, signalPoints = [], isSignatureWay = () => false, northId = NORTH_REGION_ID_32, signalRadiusM = NORTH_SIGNAL_RADIUS_M_32, lockedMinRank = LOCKED_MIN_RENDER_RANK_32 }) {
  const hidden = new Set();
  const keptMinor = new Set();
  const stats = { total: roads.length, northMinorHidden: 0, northMinorKept: 0, northMajorKept: 0, lockedHidden: 0, lockedKept: 0, signatureKept: 0 };
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    if (isSignatureWay(road?.id ?? i)) { stats.signatureKept++; continue; }
    const inNorth = roadSamples32(road).some(([x, z]) => regionOf(x, z) === northId);
    if (inNorth) {
      if (!isMinorRoadClass32(road.type)) { stats.northMajorKept++; continue; }
      if (roadTouchesSignal32(road, signalPoints, signalRadiusM)) { stats.northMinorKept++; keptMinor.add(i); continue; }
      else { hidden.add(i); stats.northMinorHidden++; }
    } else if (roadClassRank32(road.type) >= lockedMinRank) stats.lockedKept++;
    else { hidden.add(i); stats.lockedHidden++; }
  }
  return { hidden, keptMinor, stats };
}

// Giới hạn camera khu Bắc (M2a · A3): tâm quay trong bbox khu + 400 m, khoảng cách trong [min,max].
export function northCameraLimits32(bbox, { marginM = CAMERA_MARGIN_M_32, minDistance = CAMERA_MIN_DISTANCE_32, maxDistance = CAMERA_MAX_DISTANCE_32 } = {}) {
  const [minX, minZ, maxX, maxZ] = bbox;
  return {
    minX: minX - marginM, minZ: minZ - marginM, maxX: maxX + marginM, maxZ: maxZ + marginM,
    marginM, minDistance, maxDistance, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2
  };
}
export function clampNorthCamera32({ x, z, distance }, limits) {
  const cx = Math.min(limits.maxX, Math.max(limits.minX, x));
  const cz = Math.min(limits.maxZ, Math.max(limits.minZ, z));
  const d = Math.min(limits.maxDistance, Math.max(limits.minDistance, distance));
  return { x: cx, z: cz, distance: d, clamped: cx !== x || cz !== z || d !== distance };
}

function boundsOfPolygon32(polygon) {
  if (!polygon?.length) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) { if (x < minX) minX = x; if (z < minZ) minZ = z; if (x > maxX) maxX = x; if (z > maxZ) maxZ = z; }
  return [minX, minZ, maxX, maxZ];
}
// Nhãn "🔒 Khu vực đang khóa · <tên khu>" đặt ở tâm bbox từng khu khóa (M2a · A2).
export function lockRegionLabels32(regions, lockedIds = LOCKED_REGION_IDS_32) {
  const wanted = new Set(lockedIds);
  const out = [];
  for (const region of regions) {
    if (!wanted.has(region?.id)) continue;
    const bbox = region.bbox || boundsOfPolygon32(region.polygon || region.ring);
    if (!bbox) continue;
    const label = region.label ?? region.short ?? region.id;
    out.push({ id: region.id, label, text: `${LOCK_LABEL_32} · ${label}`, x: (bbox[0] + bbox[2]) / 2, z: (bbox[1] + bbox[3]) / 2, bbox });
  }
  return out;
}
/*
 * M2c — hoàn thiện khóa khu (chỉ app smart):
 *   - signature (công trình, nhãn, module, cầu) có tâm NGOÀI khu Bắc: không vẽ; cầu vắt ranh (có điểm trong khu Bắc) giữ trọn;
 *   - đất, công viên và mặt nước khu khóa tô xám trầm bằng mặt nạ 1024² (không còn tấm phủ polygon đè lên sông).
 */
// Albedo TSL của khu khóa, đã hiệu chỉnh để SAU ánh sáng/tone-mapping ngày hiển thị ≈ #9aa0a6 (đất) và ≈ #7f97a6 (nước)
// (đo ảnh QA: đất hiện #b7bdc6 khi albedo #9aa0a6, nước hiện #b4bfca khi albedo #7f97a6 do phản xạ Fresnel).
export const LOCK_TINT_32 = Object.freeze({ land: '#7a7e81', water: '#455d6d' });
export const LOCK_RENDER_TARGET_32 = Object.freeze({ land: '#9aa0a6', water: '#7f97a6' });
export const LOCK_MASK_32 = Object.freeze({ x0: -3400, z0: -3400, size: 6800, n: 1024 });

// Signature có tâm ngoài khu northId: ẩn (true).
export function signatureHidden32(x, z, regionOf, northId = NORTH_REGION_ID_32) {
  return regionOf(x, z) !== northId;
}
// Cầu signature: ẩn khi KHÔNG có điểm nào trong khu northId; cầu vắt ranh (có điểm trong khu) giữ.
export function bridgeHidden32(points, regionOf, northId = NORTH_REGION_ID_32) {
  return !points.some(([x, z]) => regionOf(x, z) === northId);
}
// Mặt nạ khu khóa: byte 255 = ngoài khu northId, 0 = trong khu; mỗi ô lấy mẫu tại tâm ô (hàng j theo z, cột i theo x).
export function lockMaskGrid32(regionOf, { x0 = LOCK_MASK_32.x0, z0 = LOCK_MASK_32.z0, size = LOCK_MASK_32.size, n = LOCK_MASK_32.n } = {}, northId = NORTH_REGION_ID_32) {
  const data = new Uint8Array(n * n), cell = size / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    data[j * n + i] = regionOf(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) === northId ? 0 : 255;
  }
  return data;
}

export const CITY_LOCK_PURE_32 = Object.freeze({
  version: CITY_LOCK_32_VERSION,
  selectNorthBuildings32, lockRoadFilter32, northCameraLimits32, clampNorthCamera32, lockRegionLabels32,
  signatureHidden32, bridgeHidden32, lockMaskGrid32, roadPoints32
});
