// DEMAND-2: kiểm phần SINH XE / TÁI SINH theo kịch bản nhu cầu.
// Giả thuyết G3 (DEMAND-1 kết luận "đúng"): xe kẹt ở làn biên khu (spawnList) và cầu Sài Gòn —
// respawn chọn làn ĐỀU nên dồn xe vào các làn đang kẹt rồi kẹt lan ngược vào khu.
// Khi có `demand`, respawn phải chọn làn CÒN CHỖ TRỐNG (trọng số = tỉ lệ độ dài còn trống trên spawnList).
// Không truyền `demand` thì hành vi y nguyên (3 test hash cổ điển c05ce91e giữ nguyên).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, STEP } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import { regionPolygon } from '../city-region-31.js?v=31a';
import { NORTH_DEMAND_32, lockNorthRegion32 } from '../smart-app-32.js?v=32a';
import { DEMAND_BY_HOUR_32 } from '../clock-32.js?v=32a';

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

// Chạy sim đúng cấu hình app-1730, đo chỗ trống trung bình của làn được respawn chọn
// so với chỗ trống trung bình của cả spawnList (kỳ vọng khi chọn đều).
function respawnFreeShare(demand, seed, seconds) {
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed, demand });
  lockNorthRegion32(sim, regionPolygon('bac'));
  sim.setLightFactor(1);
  sim.setFraction(DEMAND_BY_HOUR_32[17]);
  const spawnList = sim.exportState().spawnList;
  const NL = net.NL, laneLen = net.lanes.length;
  const prevGen = sim.gen.slice();
  const used = new Float64Array(NL);
  let pickSum = 0, allSum = 0, n = 0;
  const steps = Math.round(seconds / STEP);
  for (let k = 0; k < steps; k++) {
    sim.step();
    used.fill(0);
    for (let i = 0; i < sim.N; i++) if (sim.active[i]) used[sim.lane[i]] += sim.len[i] + .55;
    // Xe vừa tái sinh trong bước này (tính sau bước → phải tự trừ chính nó khỏi làn đã nhận).
    const picked = [];
    for (let i = 0; i < sim.N; i++) {
      if (sim.gen[i] === prevGen[i]) continue;
      prevGen[i] = sim.gen[i];
      if (!sim.active[i]) continue;                 // tái sinh thất bại (đang chờ chỗ) không tính
      picked.push(i);
    }
    const sub = new Float64Array(NL);
    for (const i of picked) sub[sim.lane[i]] += sim.len[i] + .55;
    let all = 0;
    const free = new Float64Array(NL);
    for (const l of spawnList) { free[l] = Math.max(.05, 1 - (used[l] - sub[l]) / laneLen[l]); all += free[l]; }
    allSum += all / spawnList.length;
    for (const i of picked) { pickSum += free[sim.lane[i]]; n++; }
  }
  return { n, pickMean: n ? pickSum / n : 0, allMean: allSum / steps };
}

test('G3: khi có demand, respawn ưu tiên làn còn chỗ trống (không chọn đều)', () => {
  const r = respawnFreeShare({ ...NORTH_DEMAND_32 }, 31031, 420);
  assert.ok(r.n >= 40, `cần đủ mẫu tái sinh, chỉ có ${r.n}`);
  assert.ok(r.pickMean > r.allMean,
    `làn được chọn phải trống hơn mức trung bình: chọn ${r.pickMean.toFixed(4)} so với TB ${r.allMean.toFixed(4)}`);
});