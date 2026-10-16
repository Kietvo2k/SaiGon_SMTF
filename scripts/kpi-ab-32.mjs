#!/usr/bin/env node
// Đo A/B đèn cố định ↔ thông minh — headless thuần Node (không THREE, không setDensity).
// Đơn:    node scripts/kpi-ab-32.mjs --seed 31031 --scenario peak-hang-xanh --duration 600 --mode fixed --out work/kpi-fixed.json
// Nhóm:   node scripts/kpi-ab-32.mjs --seeds 31031-31035 --scenario peak-hang-xanh --duration 1800 --mode both --out work/kpi-a1/tune
// Chỉ số A1 (T2b): độ trễ tích lũy TB mỗi xe qua vạch HX trong cửa sổ [300, 1800] s, kèm thông lượng.
// Mật độ app (CTRL): --scenario app-1730 = cấu hình app smart (poolScale 5, giờ 17:30, breaker 180 s, khu Bắc biên 0 + cầu Sài Gòn).
// --algorithm: max-pressure (mặc định) | max-pressure-abs | cycle-max-pressure | actuated-gap | max-pressure-150 | max-pressure-gated (F, CTRL).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDelayTracker32, hxNodeIndices, PEAK_HANG_XANH_DEMAND, A1_WINDOW } from './a1-metric-32.mjs';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const SEED_ARG = Number(args.seed ?? 31031);
const DURATION = Number(args.duration ?? 600);
const MODE = args.mode === 'smart' ? 'smart' : args.mode === 'both' ? 'both' : 'fixed';
const SCENARIO = args.scenario ?? 'peak-hang-xanh';
const ALGORITHM = args.algorithm ?? 'max-pressure';
const EXTRA_PARAMS = {};
for (const k of ['decisionIntervalS', 'switchMargin', 'minGreenS', 'maxGreenS', 'switchAbs', 'maxRedS', 'exitCapS', 'satPerS']) if (args[k] !== undefined) EXTRA_PARAMS[k] = Number(args[k]);
const OUT = args.out ?? `work/kpi-${MODE}-${SEED_ARG}.json`;
const SEEDS = args.seeds
  ? args.seeds.split(',').flatMap(s => { const m = /^(\d+)-(\d+)$/.exec(s.trim()); return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, k) => Number(m[1]) + k) : [Number(s)]; })
  : null;

globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const { buildTrafficNetwork31, createTrafficSim31, STEP, LIGHT_FACTOR } = await import(new URL('../outputs/hcmc-poc/city-traffic-sim-31.js?v=32a', import.meta.url).href);
const { buildSignalPlan32 } = await import(new URL('../outputs/hcmc-poc/signal-plan-32.js?v=32a', import.meta.url).href);
const { createSignalController32 } = await import(new URL('../outputs/hcmc-poc/traffic-controller-32.js?v=32a', import.meta.url).href);
const { regionTrafficPayload, regionPolygon } = await import(new URL('../outputs/hcmc-poc/city-region-31.js?v=31a', import.meta.url).href);
// Mật độ app (kịch bản app-1730): đúng cấu hình app smart (smart-app-32.js, clock-32.js).
const { NORTH_DEMAND_32, lockNorthRegion32, SMART_BREAKER_S } = await import(new URL('../outputs/hcmc-poc/smart-app-32.js?v=32a', import.meta.url).href);
const { DEMAND_BY_HOUR_32 } = await import(new URL('../outputs/hcmc-poc/clock-32.js?v=32a', import.meta.url).href);
const APP_1730 = SCENARIO === 'app-1730';

const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function runOnce(mode, seed, duration) {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode, params: { algorithm: ALGORITHM, ...EXTRA_PARAMS } });
  const demand = SCENARIO === 'peak-hang-xanh' ? PEAK_HANG_XANH_DEMAND : APP_1730 ? NORTH_DEMAND_32 : null;
  // Kịch bản cao điểm cần dòng xe chảy (không kẹt cứng) để đo A1 → dùng breaker mặc định 50;
  // app-1730 dùng đúng breaker của app (SMART_BREAKER_S = 180); các kịch bản khác giữ Infinity.
  const breakerS = SCENARIO === 'peak-hang-xanh' ? 50 : APP_1730 ? SMART_BREAKER_S : Infinity;
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS, seed, demand });
  if (APP_1730) {
    // Khu Bắc như app: biên 0 + ngoại lệ cầu Sài Gòn (lockNorthRegion32 ghi đè setRegion của sim).
    lockNorthRegion32(sim, regionPolygon('bac'));
    // 17:30: tỉ lệ xe = DEMAND_BY_HOUR_32[17]; ánh sáng golden (giờ vàng).
    sim.setLightFactor(LIGHT_FACTOR.golden);
    sim.setFraction(DEMAND_BY_HOUR_32[17]);
  } else {
    // Hợp đồng setRegion: {id, polygon, margin} — không truyền chuỗi 'bac'.
    sim.setRegion(regionTrafficPayload('bac'));
    sim.setLightFactor(1.0);   // giờ vàng = cao điểm
    sim.setFraction(1);
  }
  const tracker = createDelayTracker32({ net, hxNodes: hxNodeIndices(net, nodeMap), window: A1_WINDOW });
  const steps = Math.round(duration / STEP);
  for (let k = 0; k < steps; k++) { sim.step(); tracker.tick(sim.counters.t, sim); }
  const m = controller.metrics(sim.counters.t);
  const a1 = tracker.result();
  const hxIds = nodeMap.map(n => n.node_id);
  const by_node_hx = m.by_node.filter(r => hxIds.includes(r.node_id));
  const avg = rows => rows.length ? rows.reduce((a, r) => a + r.wait_avg_s, 0) / rows.length : 0;
  const measure_s = Math.max(0, Math.min(duration, A1_WINDOW[1]) - A1_WINDOW[0]);
  return {
    mode, seed, scenario: SCENARIO, duration_s: duration,
    wait_avg_s: m.wait_avg_s,
    wait_avg_s_hx: +avg(by_node_hx).toFixed(3),
    by_node: m.by_node, by_node_hx,
    queue_max_hx: Math.max(0, ...by_node_hx.map(r => r.queue_max)),
    flow_per_min_hx: +by_node_hx.reduce((a, r) => a + r.flow_per_min, 0).toFixed(1),
    a1_delay_s_hx: a1.delay_avg_s,
    a1_crossings_hx: a1.crossings,
    a1_crossings_per_hour_hx: measure_s ? +(a1.crossings * 3600 / measure_s).toFixed(1) : 0,
    a1_window_s: [...A1_WINDOW],
    active_vehicles: sim.activeCount(),
    state_hash: controller.stateHash(),
    params: controller.getParams()
  };
}

function writeMarkdown(summary, file) {
  const lines = [];
  lines.push(`# A1 — ${summary.scenario} (cửa sổ ${A1_WINDOW[0]}–${A1_WINDOW[1]} s)`);
  lines.push('');
  lines.push(`Thời lượng: ${summary.duration_s} s/seed · tập seed: ${summary.seeds.join(', ')}`);
  lines.push('');
  lines.push('| seed | A1 fixed (s/xe) | A1 smart (s/xe) | Δdelay | qua vạch fixed | qua vạch smart | Δthông lượng |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of summary.rows) {
    lines.push(`| ${r.seed} | ${r.fixed.a1_delay_s_hx} | ${r.smart.a1_delay_s_hx} | ${r.delta_pct.toFixed(1)} % | ${r.fixed.a1_crossings_hx} | ${r.smart.a1_crossings_hx} | ${r.throughput_delta_pct.toFixed(1)} % |`);
  }
  lines.push(`| **TB** | | | **${summary.mean_delta_pct.toFixed(1)} %** | | | ${summary.throughput_delta_pct.toFixed(1)} % |`);
  lines.push('');
  lines.push(`- TB Δdelay ≥ 15 %: **${summary.pass_threshold ? 'ĐẠT' : 'CHƯA ĐẠT'}**`);
  lines.push(`- Không seed nào tệ hơn fixed: **${summary.all_seeds_not_worse ? 'ĐẠT' : 'CHƯA ĐẠT'}**`);
  lines.push(`- Thông lượng không giảm > 5 %: **${summary.throughput_ok ? 'ĐẠT' : 'CHƯA ĐẠT'}** (Δthông lượng TB ${summary.throughput_delta_pct.toFixed(1)} %; dương = smart ít xe qua hơn)`);
  lines.push('');
  lines.push(`Tham số controller: \`${JSON.stringify(summary.params)}\``);
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

const params = runOnce('fixed', SEEDS ? SEEDS[0] : SEED_ARG, 1).params;
if (SEEDS) {
  const modes = MODE === 'both' ? ['fixed', 'smart'] : [MODE];
  const rows = [];
  for (const seed of SEEDS) {
    const res = {};
    for (const mode of modes) res[mode] = runOnce(mode, seed, DURATION);
    if (!res.fixed || !res.smart) { console.log(JSON.stringify({ seed, ...res[modes[0]] })); continue; }
    const delta_pct = res.fixed.a1_delay_s_hx ? (res.fixed.a1_delay_s_hx - res.smart.a1_delay_s_hx) / res.fixed.a1_delay_s_hx * 100 : 0;
    const throughput_delta_pct = res.fixed.a1_crossings_hx ? (res.fixed.a1_crossings_hx - res.smart.a1_crossings_hx) / res.fixed.a1_crossings_hx * 100 : 0;
    rows.push({ seed, fixed: res.fixed, smart: res.smart, delta_pct, throughput_delta_pct });
  }
  const mean_delta_pct = rows.length ? rows.reduce((a, r) => a + r.delta_pct, 0) / rows.length : 0;
  const throughput_delta_pct = rows.length ? rows.reduce((a, r) => a + r.throughput_delta_pct, 0) / rows.length : 0;
  const summary = {
    scenario: SCENARIO, duration_s: DURATION, window_s: [...A1_WINDOW], seeds: SEEDS,
    mean_delta_pct, throughput_delta_pct,
    pass_threshold: mean_delta_pct >= 15,
    all_seeds_not_worse: rows.every(r => r.delta_pct >= 0),
    throughput_ok: rows.every(r => r.throughput_delta_pct <= 5),
    params,
    rows
  };
  const dir = /\.(json|md)$/i.test(OUT) ? path.dirname(OUT) : OUT;
  const base = /\.(json|md)$/i.test(OUT) ? OUT.replace(/\.(json|md)$/i, '') : path.join(OUT, `a1-${SCENARIO}`);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2));
  writeMarkdown(summary, `${base}.md`);
  console.log(JSON.stringify({ scenario: SCENARIO, seeds: SEEDS, mean_delta_pct: +mean_delta_pct.toFixed(1), throughput_delta_pct: +throughput_delta_pct.toFixed(1), pass_threshold: summary.pass_threshold, out: `${base}.json` }));
} else {
  const result = runOnce(MODE === 'both' ? 'smart' : MODE, SEED_ARG, DURATION);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ mode: MODE, seed: SEED_ARG, wait_avg_s_hx: result.wait_avg_s_hx, a1_delay_s_hx: result.a1_delay_s_hx, a1_crossings_hx: result.a1_crossings_hx, out: OUT }));
}
