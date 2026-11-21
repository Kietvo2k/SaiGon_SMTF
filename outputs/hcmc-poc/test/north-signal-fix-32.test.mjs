// Kiểm phân bố đèn public-north sau audit map-signal: gộp node tách, cầu vượt không vạch dừng,
// cụm flashing không vào signalNodes, cụm mới có đủ nhánh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicNetwork } from '../../../scripts/hardtest/north/oracle.mjs';
import { createTrafficGeometry31 } from '../city-traffic-sim-31.js';
import { buildJunctionLayout32 } from '../junction-layout-32.js';
import { stopLinesOf32 } from '../traffic-signals-32.js';

const { net, nodeMap, signalPlan } = await publicNetwork();
const osm = i => Number(net.G.nodes[i].id);
const cluster = id => signalPlan.clusters.find(c => c.cluster_id === id);

test('12 cụm, node tách đã vào cụm; signalNodes chỉ chứa nút chạy chu kỳ', () => {
  assert.equal(signalPlan.clusters.length, 12);
  assert.deepEqual(cluster('HX-C1').nodeIds.map(osm).sort((a, b) => a - b), [366390689, 676554122, 701671562, 2030639354].sort((a, b) => a - b));
  assert.deepEqual(cluster('HX-C2').nodeIds.map(osm).sort((a, b) => a - b), [366440827, 729523408]);
  assert.equal(cluster('HX-C3').nodeIds.length, 7, 'HX-C3 gộp cả hộp nút 7 node');
  assert.equal(cluster('HX-C4').nodeIds.length, 8, 'HX-C4 gộp cả hộp nút 8 node');
  assert.ok(cluster('Bac-01').nodeIds.map(osm).includes(366423565), 'Bac-01 gộp node bậc 5');
  assert.ok(cluster('Bac-04').nodeIds.map(osm).includes(9352081764), 'Bac-04 gộp nhánh tây');
  assert.ok(cluster('Bac-05').nodeIds.map(osm).includes(2028466048), 'Bac-05 giữ cụm + gộp node tách');
  // Flashing không phải nút managed.
  const flash = new Set(['HX-C3', 'HX-C4', 'Bac-03', 'Bac-05']);
  for (const id of flash) assert.ok(cluster(id).flashing, `${id} flashing`);
  const flashNodes = new Set(signalPlan.flashingNodes);
  for (const n of signalPlan.signalNodes) assert.ok(!flashNodes.has(n), 'signalNodes không lẫn nút flashing');
  for (const id of ['HX-C1', 'HX-C2', 'HX-C5', 'Bac-01', 'Bac-02', 'Bac-04', 'Bac-06', 'Bac-07']) {
    assert.ok(!cluster(id).flashing, `${id} chạy chu kỳ`);
    assert.ok(cluster(id).nodeIds.every(n => signalPlan.signalNodes.includes(n)), `${id} nằm trong signalNodes`);
  }
});

test('cầu vượt: không vạch dừng/đầu đèn trên deck và chân dốc; 4702 là no-stop', () => {
  const flying = new Set(signalPlan.noStopEdges);
  for (const e of [4702, 1341, 1705, 1706, 1707, 4700, 4703]) assert.ok(flying.has(e), `edge ${e} no-stop`);
  for (const e of flying) {
    assert.ok(signalPlan.noStopSt.has(e * 2) && signalPlan.noStopSt.has(e * 2 + 1), `state 2 chiều edge ${e}`);
    assert.ok(net.signalPlan.internalSt.has(e * 2), `internalSt edge ${e}`);
  }
  const geo = createTrafficGeometry31(net, { jit: [] });
  const indexed = nodeMap;
  const lines = stopLinesOf32(net, geo, indexed);
  assert.ok(!lines.some(l => l.lane === 1384), 'lane 1384 (edge 4702) không còn vạch dừng');
  for (const l of lines) {
    const ed = net.E[net.lanes.edge[l.lane]];
    assert.notEqual(ed.elevationClass, 'overpass', `không vạch trên overpass edge ${ed.id}`);
    assert.ok(net.lanes.length[l.lane] - (net.Rz[net.lanes.to[l.lane]] || 0) > 1, 'vạch không bị kẹp về s=0');
  }
});

test('layout Bac-04/Bac-05/HX-C3 không còn nhánh cầu vượt làm đầu đèn', () => {
  const geo = createTrafficGeometry31(net, { jit: [] });
  const layout = buildJunctionLayout32({ net, nodeMap, geo });
  assert.equal(layout.length, 12);
  for (const j of layout) {
    assert.ok(j.arms.some(a => a.incoming), `${j.id} có làn vào`);
    for (const a of j.arms) {
      if (!a.head) continue;
      const ed = net.E[net.lanes.edge[a.head.lane]];
      assert.notEqual(ed.elevationClass, 'overpass', `${j.id} head trên overpass`);
      assert.ok(!signalPlan.noStopSt.has(net.lanes.st[a.head.lane]), `${j.id} head trên nhánh no-stop`);
    }
  }
  assert.equal(layout.find(j => j.id === 'Bac-04').armCount, 4, 'Bac-04 đủ 4 nhánh sau khi gộp');
  assert.equal(layout.find(j => j.id === 'Bac-05').typeLabel, 'Ngã ba', 'Bac-05 không còn bị coi là 2 nhánh');
});
