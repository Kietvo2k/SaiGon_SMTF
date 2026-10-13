import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildSignalPlan32, SIGNAL_PLAN_32, SIGNAL_PLAN_32_VERSION } from '../signal-plan-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
const G = globalThis.ROAD_GRAPH_31;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const plan = buildSignalPlan32({ graph: G, nodeMap });

test('đủ 6 nút Hàng Xanh, chỉ số nút khớp osm_id', () => {
  assert.equal(SIGNAL_PLAN_32_VERSION, 'signal-plan-32a');
  assert.equal(plan.signalNodes.length, 6);
  const index = new Map(G.nodes.map((n, i) => [n.id, i]));
  for (const row of SIGNAL_PLAN_32) assert.ok(plan.signalNodes.includes(index.get(row.osm_id)), row.node_id);
});

test('HX-01 và HX-05 cùng cụm HX-C1, chung offset; cụm khác nhau offset', () => {
  const byId = Object.fromEntries(nodeMap.map(n => [n.node_id, n]));
  const idx = osm => G.nodes.findIndex(n => n.id === osm);
  assert.equal(byId['HX-01'].cluster_id, byId['HX-05'].cluster_id);
  assert.equal(plan.offset.get(idx(366390689)), plan.offset.get(idx(701671562)));
  assert.notEqual(plan.offset.get(idx(366390689)), plan.offset.get(idx(366440827)));
  assert.equal(plan.clusters.length, 5);
});

test('arriveGroup: trạng thái vào HX-01 song song trục Điện Biên Phủ (160.4°) vào nhóm 0, còn lại nhóm 1', () => {
  const idx = G.nodes.findIndex(n => n.id === 366390689);
  const e = G.edges;
  let checked = 0;
  for (let st = 0; st < plan.arriveGroup.length; st++) {
    const edge = st >> 1, dir = st & 1 ? -1 : 1;
    const toNode = dir > 0 ? e[edge].to : e[edge].from;
    if (toNode !== G.nodes[idx].id) continue;
    const c = e[edge].c, n = c.length / 2;
    const head = dir > 0
      ? Math.atan2(c[n * 2 - 1] - c[n * 2 - 3], c[n * 2 - 2] - c[n * 2 - 4])
      : Math.atan2(c[3] - c[1], c[2] - c[0]);
    const axis = 160.4 * Math.PI / 180;
    const want = Math.abs(Math.cos(head - axis)) > 0.5 ? 0 : 1;
    assert.equal(plan.arriveGroup[st], want, `st=${st}`);
    checked++;
  }
  assert.ok(checked >= 3, `chỉ ${checked} trạng thái vào HX-01`);
});

test('tất định: gọi hai lần cùng kết quả', () => {
  const again = buildSignalPlan32({ graph: G, nodeMap });
  assert.deepEqual([...again.signalNodes], [...plan.signalNodes]);
  assert.deepEqual([...again.offset.entries()], [...plan.offset.entries()]);
});
