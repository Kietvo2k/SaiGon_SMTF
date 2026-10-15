// Test M2a — hàm lọc thuần của khóa khu (nhà theo khoảng cách đường, cấp đường, cạnh sim, camera, nhãn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionOf } from '../city-region-31.js?v=31a';
import {
  CITY_LOCK_32_VERSION, LOCKED_REGION_IDS_32, LOCK_LABEL_32,
  normalizeRoadClass32, roadClassRank32, isMinorRoadClass32, segmentDistance32,
  selectNorthBuildings32, lockRoadFilter32, northCameraLimits32, clampNorthCamera32, lockRegionLabels32,
  NORTH_KEEP_BUILDING_MAX_M_32, NORTH_SIGNAL_RADIUS_M_32, NORTH_MIN_SIM_RANK_32, LOCKED_MIN_RENDER_RANK_32
} from '../city-lock-32.js?v=32a';

const road = (id, type, ...pts) => ({ id, type, c: pts });

test('hằng số hợp đồng M2a', () => {
  assert.equal(CITY_LOCK_32_VERSION, 'city-lock-32a');
  assert.deepEqual(LOCKED_REGION_IDS_32, ['trung-tam', 'ven-song', 'nam']);
  assert.equal(LOCK_LABEL_32, '🔒 Khu vực đang khóa');
  assert.equal(NORTH_KEEP_BUILDING_MAX_M_32, 40);
  assert.equal(NORTH_SIGNAL_RADIUS_M_32, 80);
  assert.equal(NORTH_MIN_SIM_RANK_32, 2);      // tertiary
  assert.equal(LOCKED_MIN_RENDER_RANK_32, 3);  // secondary
});

test('chuẩn hóa cấp đường: bỏ _link, xếp hạng, nhận diện đường nhỏ', () => {
  assert.equal(normalizeRoadClass32('trunk_link'), 'trunk');
  assert.equal(normalizeRoadClass32('Residential'), 'residential');
  assert.ok(roadClassRank32('trunk') > roadClassRank32('primary'));
  assert.ok(roadClassRank32('primary') > roadClassRank32('secondary'));
  assert.ok(roadClassRank32('secondary') > roadClassRank32('tertiary'));
  assert.ok(roadClassRank32('tertiary') > roadClassRank32('residential'));
  for (const type of ['residential', 'service', 'living_street', 'unclassified', 'footway', 'path', 'pedestrian', 'cycleway', 'track'])
    assert.equal(isMinorRoadClass32(type), true, type);
  for (const type of ['trunk', 'trunk_link', 'primary', 'secondary', 'tertiary'])
    assert.equal(isMinorRoadClass32(type), false, type);
});

test('segmentDistance32 = khoảng cách điểm tới đoạn', () => {
  assert.equal(Math.round(segmentDistance32(0, 5, [0, 0, 10, 0])), 5);
  assert.equal(Math.round(segmentDistance32(-3, 0, [0, 0, 10, 0])), 3);
  assert.equal(Math.round(segmentDistance32(5, 0, [0, 0, 10, 0])), 0);
});

test('selectNorthBuildings32: giữ nhà khu Bắc ≤ 40 m tới tim đường lớn, giữ 100 % signature, bỏ nhà khu khác', () => {
  const roads = [road(1, 'primary', [-900, -1950], [-700, -1950])];
  const buildings = [
    { id: 11, center: [-800, -1940] },   // gần tim đường (10 m) → giữ
    { id: 12, center: [-800, -1800] },   // 150 m → bỏ
    { id: 13, center: [-1650, 420] },    // khu trung-tâm → bỏ (ngoài khu Bắc)
    { id: 14, center: [-3000, -2400] },  // signature trong khu Bắc (bắc rạch Thị Nghè), xa đường → giữ
    { id: 15, center: [-1000, -1960], }  // 100 m → bỏ
  ];
  const result = selectNorthBuildings32({
    buildings, roads, regionOf, isSignature: id => id === 14
  });
  assert.deepEqual([...result.ids].sort((a, b) => a - b), [11, 14]);
  assert.deepEqual([...result.ordinaryIndices].sort((a, b) => a - b), [0, 1, 4]);
  assert.deepEqual([...result.ordinaryIds].sort((a, b) => a - b), [11, 12, 15]);
  assert.deepEqual([...result.indices].sort((a, b) => a - b), [0]);
  assert.equal(result.kept, 2);
  assert.equal(result.before, 4);          // 4 công trình khu Bắc (11,12,14,15)
  assert.equal(result.dropped, 2);         // 12, 15
  assert.ok(result.kept / result.before <= 0.25 || result.signature === 1);
  assert.equal(result.signature, 1);
});

test('lockRoadFilter32: khu Bắc ẩn đường nhỏ TRỪ 80 m quanh nút có đèn; ngoài khu Bắc chỉ giữ ≥ secondary; signature way luôn giữ', () => {
  const signalPoints = [[0, -2480]];
  const roads = [
    road(100, 'residential', [-800, -1950], [-700, -1950]),   // khu Bắc, xa đèn → ẩn
    road(101, 'service', [0, -2450], [60, -2480]),            // khu Bắc, trong 80 m đèn → giữ
    road(102, 'trunk', [-900, -2200], [-400, -2200]),         // khu Bắc, cấp lớn → giữ
    road(103, 'residential', [-1650, 420], [-1500, 500]),     // trung-tâm → ẩn
    road(104, 'trunk', [-1650, 400], [-1500, 480]),           // trung-tâm, trunk → giữ
    road(105, 'tertiary', [-1700, 500], [-1600, 560]),        // trung-tâm, tertiary < secondary → ẩn
    road(106, 'footway', [-1900, 300], [-1800, 360]),         // trung-tâm, footway, nhưng signature → giữ
    road(107, 'footway', [-1760, 500], [-1660, 560])          // trung-tâm, footway → ẩn
  ];
  const { hidden, stats } = lockRoadFilter32({
    roads, regionOf, signalPoints, isSignatureWay: id => id === 106
  });
  assert.deepEqual([...hidden].sort((a, b) => a - b), [0, 3, 5, 7]);
  assert.equal(stats.northMinorHidden, 1);
  assert.equal(stats.northMinorKept, 1);
  assert.equal(stats.lockedHidden, 3);
  assert.equal(stats.signatureKept, 1);
});

test('northCameraLimits32 + clampNorthCamera32: tâm quay trong bbox + 400 m, khoảng cách ≤ mức thấy toàn khu Bắc', () => {
  const bbox = [-3600, -3700, 1710, -960];
  const limits = northCameraLimits32(bbox);
  assert.equal(limits.minX, -4000);
  assert.equal(limits.maxZ, -560);
  assert.equal(limits.marginM, 400);
  assert.ok(limits.maxDistance >= 5000, `maxDistance ${limits.maxDistance}`);
  const inside = clampNorthCamera32({ x: -800, z: -1950, distance: 900 }, limits);
  assert.deepEqual([inside.x, inside.z, inside.distance], [-800, -1950, 900]);
  assert.equal(inside.clamped, false);
  const far = clampNorthCamera32({ x: -9999, z: 5000, distance: 30000 }, limits);
  assert.deepEqual([far.x, far.z, far.distance], [limits.minX, limits.maxZ, limits.maxDistance]);
  assert.equal(far.clamped, true);
  const tooClose = clampNorthCamera32({ x: 0, z: 0, distance: 1 }, limits);
  assert.equal(tooClose.distance, limits.minDistance);
});

test('lockRegionLabels32: nhãn khóa + tên khu, tâm nhãn trong bbox khu đó', () => {
  const regions = [{ id: 'trung-tam', label: 'Lõi Quận 1 · Bến Nghé', bbox: [-3600, -2060, -230, 1200] }, { id: 'nam', label: 'Phía nam · Quận 4', bbox: [-530, 1170, 3700, 3700] }];
  const labels = lockRegionLabels32(regions, ['trung-tam', 'nam']);
  assert.equal(labels.length, 2);
  for (const item of labels) {
    assert.equal(item.text, `🔒 Khu vực đang khóa · ${item.label}`);
    const region = regions.find(r => r.id === item.id);
    assert.ok(item.x >= region.bbox[0] && item.x <= region.bbox[2]);
    assert.ok(item.z >= region.bbox[1] && item.z <= region.bbox[3]);
  }
  assert.equal(lockRegionLabels32(regions, []).length, 0);
});

// M2c — ẩn signature ngoài khu Bắc, cầu vắt ranh giữ, mặt nạ nền/nước khớp regionOf.
import {
  signatureHidden32, bridgeHidden32, lockMaskGrid32, roadPoints32, LOCK_MASK_32, LOCK_TINT_32, LOCK_RENDER_TARGET_32
} from '../city-lock-32.js?v=32a';

test('M2c: signature có tâm ngoài khu Bắc bị ẩn; trong khu Bắc giữ', () => {
  assert.equal(signatureHidden32(1124, -1768, regionOf), false);   // Landmark 81 (bac)
  assert.equal(signatureHidden32(-907, 254, regionOf), true);      // Nhà hát Thành phố (trung-tam)
  assert.equal(signatureHidden32(-399, -351, regionOf), true);     // Marina Central (ven-song)
});

test('M2c: cầu vắt ranh (có điểm trong bac) giữ trọn; cầu nằm hẳn ngoài khu Bắc bị ẩn', () => {
  assert.equal(bridgeHidden32([[-900, 254], [1124, -1768]], regionOf), false);
  assert.equal(bridgeHidden32([[-900, 254], [-800, 300]], regionOf), true);
  assert.equal(bridgeHidden32([], regionOf), true);
});

test('M2c: mặt nạ khu khóa đúng 1024² và khớp regionOf tại tâm từng ô', () => {
  const cfg = LOCK_MASK_32, cell = cfg.size / cfg.n;
  const mask = lockMaskGrid32(regionOf, cfg);
  assert.equal(mask.length, cfg.n * cfg.n);
  for (let k = 0; k < 400; k++) {
    const i = (k * 97) % cfg.n, j = (k * 53 + 11) % cfg.n;
    const want = regionOf(cfg.x0 + (i + 0.5) * cell, cfg.z0 + (j + 0.5) * cell) === 'bac' ? 0 : 255;
    assert.equal(mask[j * cfg.n + i], want, `ô ${i},${j}`);
  }
  const at = (x, z) => mask[Math.floor((z - cfg.z0) / cell) * cfg.n + Math.floor((x - cfg.x0) / cell)];
  assert.equal(at(1124, -1768), 0);
  assert.equal(at(-907, 254), 255);
});

test('M2c: albedo khu khóa đã hiệu chỉnh; mục tiêu hiển thị là xám trầm và xám-xanh bão hòa thấp', () => {
  assert.equal(LOCK_RENDER_TARGET_32.land, '#9aa0a6');
  assert.equal(LOCK_RENDER_TARGET_32.water, '#7f97a6');
  assert.equal(LOCK_TINT_32.land, '#7a7e81');
  assert.equal(LOCK_TINT_32.water, '#455d6d');
});

test('M2c: roadPoints32 nhận cả mảng cặp và mảng phẳng', () => {
  assert.deepEqual(roadPoints32({ c: [[1, 2], [3, 4]] }), [[1, 2], [3, 4]]);
  assert.deepEqual(roadPoints32({ c: [1, 2, 3, 4] }), [[1, 2], [3, 4]]);
  assert.deepEqual(roadPoints32({}), []);
});
