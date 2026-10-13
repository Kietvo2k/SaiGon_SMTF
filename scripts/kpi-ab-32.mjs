#!/usr/bin/env node
// Đo A/B đèn cố định ↔ thông minh — headless thuần Node (không THREE, không setDensity).
// Ví dụ: node scripts/kpi-ab-32.mjs --seed 31031 --scenario peak-hang-xanh --duration 600 --mode fixed --out work/kpi-fixed.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const SEED_ARG = Number(args.seed ?? 31031);
const DURATION = Number(args.duration ?? 600);
const MODE = args.mode === 'smart' ? 'smart' : 'fixed';
const SCENARIO = args.scenario ?? 'peak-hang-xanh';
const OUT = args.out ?? `work/kpi-${MODE}-${SEED_ARG}.json`;

globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const { buildTrafficNetwork31, createTrafficSim31, STEP } = await import(new URL('../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { regionTrafficPayload } = await import(new URL('../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);

const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const controller = createSignalController32({ net, sim: null, mode: MODE });
const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: Infinity, seed: SEED_ARG });
// Hợp đồng setRegion: {id, polygon, margin} (city-traffic-sim-31.js dòng 694–702) — không truyền chuỗi 'bac'.
sim.setRegion(regionTrafficPayload('bac'));
sim.setLightFactor(1.0);   // giờ vàng = cao điểm
sim.setFraction(1);

const steps = Math.round(DURATION / STEP);
for (let k = 0; k < steps; k++) sim.step();

const m = controller.metrics(sim.counters.t);
const hxIds = nodeMap.map(n => n.node_id);
const by_node_hx = m.by_node.filter(r => hxIds.includes(r.node_id));
const avg = rows => rows.length ? rows.reduce((a, r) => a + r.wait_avg_s, 0) / rows.length : 0;
const result = {
  mode: MODE, seed: SEED_ARG, scenario: SCENARIO, duration_s: DURATION,
  wait_avg_s: m.wait_avg_s,
  wait_avg_s_hx: +avg(by_node_hx).toFixed(3),
  by_node: m.by_node, by_node_hx,
  queue_max_hx: Math.max(0, ...by_node_hx.map(r => r.queue_max)),
  flow_per_min_hx: +by_node_hx.reduce((a, r) => a + r.flow_per_min, 0).toFixed(1),
  state_hash: controller.stateHash(),
  params: controller.getParams()
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ mode: MODE, seed: SEED_ARG, wait_avg_s_hx: result.wait_avg_s_hx, out: OUT }));
