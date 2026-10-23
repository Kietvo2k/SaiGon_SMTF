import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficGeometry31 } from '../city-traffic-sim-31.js';
import { buildSignalPlan32 } from '../signal-plan-32.js';
import { buildJunctionLayout32, junctionPlacements32, junctionType32 } from '../junction-layout-32.js';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const indexed = nodeMap.map(m => ({ ...m, index: G.nodes.findIndex(n => n.id === m.osm_id) }));
const geo = createTrafficGeometry31(net, { jit: [] });
const layout = buildJunctionLayout32({ net, nodeMap: indexed, geo });

test('gom 6 mã nút thành 5 giao lộ logic 3–4 hướng, có tên và loại rõ ràng', () => {
  assert.equal(layout.length, 5);
  assert.deepEqual(layout.map(j => j.armCount), [4, 3, 4, 3, 3]);
  assert.deepEqual(layout.map(j => j.typeLabel), ['Ngã tư', 'Ngã ba', 'Ngã tư', 'Ngã ba', 'Ngã ba']);
  assert.ok(layout.every(j => j.name && !/HX-\d{2} \+/.test(j.name)), 'tên giao lộ không còn là danh sách mã nút');
  assert.equal(layout.find(j => j.id === 'HX-C1').name, 'Ngã tư Hàng Xanh');
});

test('mỗi nhánh tối đa một đầu đèn; nhánh hẻm không sinh đầu đèn', () => {
  const all = junctionPlacements32(layout);
  assert.equal(all.length, 12);
  assert.ok(all.every(p => p.node_id && p.lane >= 0 && Number.isFinite(p.x) && Number.isFinite(p.yaw)));
  // HX-C4 có Hẻm 328: hẻm bị gộp/loại, không có đầu đèn riêng cho hẻm.
  const c4 = layout.find(j => j.id === 'HX-C4');
  assert.equal(c4.arms.length, 3);
  assert.equal(c4.arms.filter(a => a.head).length, 2);
  assert.ok(!c4.arms.some(a => a.names.some(n => /Hẻm/i.test(n)) && a.head && a.names.length === 1), 'không cắm đèn riêng cho hẻm');
  for (const j of layout) assert.equal(j.arms.filter(a => a.head).length, j.headCount);
});

test('đầu đèn đặt tại vạch dừng và quay về phía xe đang tới', () => {
  for (const p of junctionPlacements32(layout)) {
    const l = p.lane, stop = net.lanes.length[l] - (net.Rz[p.nodeIndex] || 0);
    assert.ok(Number.isFinite(stop));
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    // Mặt đèn có pháp tuyến ngược chiều xe chạy tại vạch.
    const q = geo.lanePoint(l, Math.max(0, stop), net.lanes.offset[l], {});
    const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw);
    assert.ok(nx * q.tx + nz * q.tz < -0.2, `đầu đèn làn ${l} phải quay về xe tới`);
  }
});

test('phân loại 3/4/5/6 hướng', () => {
  assert.equal(junctionType32(3).typeLabel, 'Ngã ba');
  assert.equal(junctionType32(4).typeLabel, 'Ngã tư');
  assert.equal(junctionType32(5).typeLabel, 'Ngã năm');
  assert.equal(junctionType32(6).typeLabel, 'Ngã sáu');
});
