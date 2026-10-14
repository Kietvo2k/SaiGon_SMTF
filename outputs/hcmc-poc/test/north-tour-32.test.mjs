import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NORTH_TOUR_32, buildNorthViews32 } from '../smart-app-32.js?v=32a';
import { regionContains } from '../city-region-31.js?v=31a';

const graph = {
  nodes: [
    { id: 1, x: 100, z: -2500 },
    { id: 2, x: 300, z: -2400 },
    { id: 3, x: 1000, z: -2300 },
    { id: 4, x: 1200, z: -2200 },
    { id: 5, x: -700, z: -400 },
    { id: 6, x: -900, z: -300 }
  ],
  roads: [
    { id: 32581944, name: 'Cầu Sài Gòn', nodes: [1, 2] },
    { id: 192289478, name: 'Cầu Sài Gòn', nodes: [2, 3] },
    { id: 1012023452, name: 'Cầu Sài Gòn', nodes: [3, 4] },
    { id: 35113104, name: 'Cầu Thị Nghè 1', nodes: [5, 6] }
  ]
};

const registry = {
  entries: [
    { key: 'place-landmark-81', label: 'LANDMARK 81', anchor: [1137.3, -1758.13], ids: [622296615] },
    { key: 'river-bridge-cau-sai-gon', label: 'Cầu Sài Gòn', kind: 'bridge', ids: [32581944, 192289478, 1012023452] }
  ]
};

const nodeMap = [
  { node_id: 'HX-01', x: 0, z: -2480 },
  { node_id: 'HX-06', x: -20, z: -2420 }
];

test('NORTH_TOUR_32 đúng 5 góc khu Bắc, đúng thứ tự', () => {
  assert.deepEqual(NORTH_TOUR_32.map(t => t.key), ['hx', 'l81', 'csg', 'ctn', 'bac']);
  assert.deepEqual(NORTH_TOUR_32.map(t => t.label), ['Ngã tư Hàng Xanh', 'Landmark 81', 'Cầu Sài Gòn', 'Cầu Thị Nghè', 'Toàn khu Bắc']);
});

test('buildNorthViews32 sinh 5 góc, tọa độ lấy từ dữ liệu và nằm trong khu bắc', () => {
  const { views, tour } = buildNorthViews32({ graph, nodeMap, registry });
  assert.equal(tour.length, 5);
  for (const t of tour) {
    const v = views[t.key];
    assert.ok(v, `thiếu view ${t.key}`);
    assert.equal(v.target.length, 3);
    for (const c of v.target) assert.ok(Number.isFinite(c), `target ${t.key} không hữu hạn`);
    assert.ok(v.distance > 0);
    const [x, y, z] = v.target;
    assert.equal(y, 0);
    // hx và l81 nằm trọn trong khu bắc; csg/ctn là cầu ở ven ranh khu nên chỉ cần hữu hạn.
    if (t.key === 'hx' || t.key === 'l81') assert.ok(regionContains('bac', x, z), `${t.key} không nằm trong khu bắc`);
  }
  // Hàng Xanh = trung bình cộng node map.
  assert.equal(views.hx.target[0], -10);
  assert.equal(views.hx.target[2], -2450);
  // Landmark 81 lấy đúng neo registry.
  assert.deepEqual(views.l81.target, [1137.3, 0, -1758.13]);
  // Cầu Sài Gòn = tâm các node của way theo registry.
  assert.equal(views.csg.target[0], 650);
  assert.equal(views.csg.target[2], -2350);
  // Cầu Thị Nghè tìm theo tên trong road graph.
  assert.equal(views.ctn.target[0], -800);
  assert.equal(views.ctn.target[2], -350);
});
