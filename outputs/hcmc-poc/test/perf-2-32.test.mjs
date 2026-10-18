// PERF-2 — trần FPS, chạy sim không vẽ khi tab ẩn, công tắc tiết kiệm tài nguyên.
// Các hàm thuần nằm ở smart-app-32.js (Node-testable); vòng vẽ gọi qua smartMod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, SEED, STEP } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import {
  smartFpsCap32, smartFrameDt32, smartHiddenSteps32, smartHiddenSlices32, installHiddenTab32, installResourceSaver32,
  BANNED_STRINGS, SMART_FPS_DEFAULT_32, SMART_FPS_IDLE_32, SMART_IDLE_MS_32, SMART_DT_CLAMP_32, SMART_SAVE_KEY_32
} from '../smart-app-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function northSim(mode) {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED });
  sim.setRegion({ id: 'bac', polygon: [[-2000, -4000], [2000, -4000], [2000, -1000], [-2000, -1000]], margin: 0 });
  sim.setFraction(0.8);
  return sim;
}

test('trần FPS: mặc định 30; không thao tác ≥ 60 s → 15; bật tiết kiệm → 15', () => {
  assert.equal(SMART_FPS_DEFAULT_32, 30);
  assert.equal(SMART_FPS_IDLE_32, 15);
  assert.equal(SMART_IDLE_MS_32, 60000);
  assert.equal(smartFpsCap32({}).fps, 30);
  assert.equal(smartFpsCap32({ idleMs: 59999 }).fps, 30);
  assert.equal(smartFpsCap32({ idleMs: 60000 }).fps, 15);
  assert.equal(smartFpsCap32({ idleMs: 120000 }).fps, 15);
  assert.equal(smartFpsCap32({ savePower: true, idleMs: 0 }).fps, 15);
  assert.equal(smartFpsCap32({}).waitMs, 1000 / 30);
  assert.equal(smartFpsCap32({ idleMs: 60000 }).waitMs, 1000 / 15);
});

test('dt khung: tính dt THỰC từ lần vẽ trước, kẹp 0,25 s (giữ kẹp của city-traffic-31.js)', () => {
  assert.equal(SMART_DT_CLAMP_32, 0.25);
  // 15 FPS → mỗi khung cách 66,67 ms → dt = 0,0667 s (không bị kẹp 0,05 như cũ).
  const a = smartFrameDt32(0, null);
  assert.equal(a.dt, 0);
  const b = smartFrameDt32(66.67, 0);
  assert.ok(Math.abs(b.dt - 0.06667) < 1e-3, `dt=${b.dt}`);
  // 30 FPS → dt = 0,0333 s.
  const c = smartFrameDt32(1000 / 30, 0);
  assert.ok(Math.abs(c.dt - 0.03333) < 1e-3, `dt=${c.dt}`);
  // Kẹp 0,25 s: khoảng cách 1 s giữa hai khung → dt = 0,25 (không phải 1).
  const d = smartFrameDt32(1000, 0);
  assert.equal(d.dt, 0.25);
  // Thời gian lùi (now < lastTime) → dt = 0.
  const e = smartFrameDt32(0, 1000);
  assert.equal(e.dt, 0);
});

test('15 FPS mô phỏng 60 s thực: sim.t tăng 60 ± 1 s (dt thực, không bị kẹp 0,05)', () => {
  const sim = northSim('fixed');
  // Mô phỏng vòng vẽ 15 FPS: mỗi khung cách 66,67 ms, dt thực kẹp 0,25.
  // city-traffic-31.js: acc += dt*timeScale; bước cố định 0,1 s, tối đa 5 bước/khung.
  let last = 0, acc = 0;
  const frameMs = 1000 / 15;
  for (let now = 0; now <= 60000; now += frameMs) {
    const { dt } = smartFrameDt32(now, last); last = now;
    acc += dt * 1; let steps = 0;
    while (acc >= STEP && steps < 5) { sim.beginStep(); sim.finishStep(); acc -= STEP; steps++; }
    if (acc > STEP) acc = STEP;
  }
  assert.ok(Math.abs(sim.counters.t - 60) <= 1, `sim.t=${sim.counters.t}`);
});

test('cách Cũ (kẹp dt 0,05) ở 15 FPS làm sim chậm: sim.t chỉ ~45 s sau 60 s thực', () => {
  const sim = northSim('fixed');
  let last = 0, acc = 0;
  const frameMs = 1000 / 15;
  for (let now = 0; now <= 60000; now += frameMs) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;   // kẹp cũ
    acc += dt * 1; let steps = 0;
    while (acc >= STEP && steps < 5) { sim.beginStep(); sim.finishStep(); acc -= STEP; steps++; }
    if (acc > STEP) acc = STEP;
  }
  assert.ok(sim.counters.t < 50, `kẹp cũ làm sim chậm: sim.t=${sim.counters.t}`);
});

test('tab ẩn: setInterval 1 s chạy đúng số bước sim theo đồng hồ — 60 s ẩn (×1) → sim.t +60 ± 1 s', () => {
  const sim = northSim('fixed');
  // Mô phỏng setInterval 1 s: mỗi lần chạy số bước = 1 s × timeScale / STEP.
  const stepsPerTick = smartHiddenSteps32(1, 1);
  assert.equal(stepsPerTick, 10);   // 1 s / 0,1 s
  for (let k = 0; k < 60; k++) {
    sim.finishStep();
    for (let s = 0; s < stepsPerTick; s++) sim.step();
  }
  assert.ok(Math.abs(sim.counters.t - 60) <= 1, `sim.t=${sim.counters.t}`);
});

test('tab ẩn ở ×10: 6 s thực → sim.t +60 ± 1 s (mỗi giây chạy 10 s sim)', () => {
  const sim = northSim('fixed');
  const stepsPerTick = smartHiddenSteps32(1, 10);
  assert.equal(stepsPerTick, 100);  // 10 s / 0,1 s
  for (let k = 0; k < 6; k++) {
    sim.finishStep();
    for (let s = 0; s < stepsPerTick; s++) sim.step();
  }
  assert.ok(Math.abs(sim.counters.t - 60) <= 1, `sim.t=${sim.counters.t}`);
});

test('installHiddenTab32: lắng nghe visibilitychange, chạy sim khi ẩn, dừng khi hiện lại (fake doc)', () => {
  let lastNow = null, acc = 0; const draws = [];
  const STEP = 0.1;
  const traffic = { getTimeScale: () => 1,
    update(now, distance, drawFrame) {
      const dt = lastNow === null ? 0 : Math.min(.25, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
      acc += dt; let steps = 0;
      while (acc >= STEP && steps < 5) { acc -= STEP; steps++; }
      if (acc > STEP) acc = STEP;
      draws.push(drawFrame);
    } };
  const listeners = {};
  const doc = { hidden: false, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: () => {} };
  const mod = installHiddenTab32({ traffic }, { traffic, doc, intervalMs: 1000 });
  assert.equal(mod.isHidden(), false);
  // giả lập 60 lần tick 1 s khi ẩn (mỗi lần chạy đúng như installHiddenTab32.advance)
  doc.hidden = true; listeners.visibilitychange();
  assert.equal(mod.isHidden(), true);
  for (let k = 0; k < 60; k++) { lastNow = null; traffic.update((k + 1) * 1000, 2000, false); }
  assert.ok(draws.every(d => d === false), 'không lần nào vẽ khi ẩn');
  // hiện lại: cờ về false
  doc.hidden = false; listeners.visibilitychange();
  assert.equal(mod.isHidden(), false);
  mod.dispose(); assert.equal(mod.isHidden(), false);
});

test('installResourceSaver32: bật thì setSave(true), lưu localStorage, gọi onApply', () => {
  const store = { v: null, getItem(k) { return this.v; }, setItem(k, val) { this.v = val; } };
  const host = { style: {}, setAttribute() {}, append() {}, addEventListener() {}, removeEventListener() {}, remove() {}, classList: { add() {}, remove() {} } };
  const doc = { querySelector: sel => (sel === '#smartHud32' ? host : null), createElement: () => ({ style: {}, setAttribute() {}, append() {}, addEventListener() {}, removeEventListener() {}, remove() {}, classList: { add() {}, remove() {} } }), createTextNode: t => ({ textContent: t }) };
  const calls = [];
  const mod = installResourceSaver32({}, { root: doc, storage: store, onApply: on => calls.push(on) });
  assert.equal(mod.enabled(), false);
  assert.deepEqual(calls, [false]);
  mod.set(true);
  assert.equal(mod.enabled(), true);
  assert.equal(store.v, 'true');
  assert.deepEqual(calls, [false, true]);
});

test('tab ẩn: số lát luôn ≤ 0,25 s thực và ≤ 0,5 s sim mỗi lượt update', () => {
  // ×1: 1 s thực chia thành 4 lát 0,25 s.
  assert.equal(smartHiddenSlices32(1, 1), 4);
  // ×10: 1 s thực = 10 s sim; mỗi lượt update tối đa 0,5 s sim → 20 lát 0,05 s.
  assert.equal(smartHiddenSlices32(1, 10), 20);
  // Lát phải thỏa cả hai giới hạn của city-traffic-31.js.
  for (const ts of [1, 2, 5, 10, 20]) {
    const slices = smartHiddenSlices32(1, ts);
    assert.ok(1 / slices <= 0.25 + 1e-9, `ts=${ts} lát ${1 / slices} > 0,25 s`);
    assert.ok((1 / slices) * ts <= 0.5 + 1e-9, `ts=${ts} lát siêu thời gian > 0,5 s sim`);
  }
  assert.equal(smartHiddenSlices32(0, 1), 0);
  assert.equal(smartHiddenSlices32(-5, 1), 0);
});

test('tab ẩn: vòng setInterval 1 s mô phỏng đúng nhịp đồng hồ của traffic.update (60 s → sim.t +60 ± 1)', () => {
  const sim = northSim('fixed');
  // Mô phỏng đúng installHiddenTab32: mỗi giây chia realSeconds thành smartHiddenSlices32 lát,
  // mỗi lát gọi traffic.update → acc += dt*timeScale, bước cố định 0,1 s, tối đa 5 bước/lát.
  const MAX_STEPS = 5;
  let acc = 0;
  const update = (dtReal, timeScale) => {
    acc += dtReal * timeScale; let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) { if (!sim.inStep) sim.beginStep(); sim.finishStep(); acc -= STEP; steps++; }
    if (acc > STEP) acc = STEP;
  };
  for (const timeScale of [1, 10]) {
    sim.reset(); acc = 0;
    const realSeconds = 60 / timeScale;                    // s thực để đồng hồ sim chạy 60 s
    const slices = smartHiddenSlices32(1, timeScale);      // lát MỖI lần setInterval (1 s thực)
    const dtReal = 1 / slices;                             // thời gian thực của mỗi lát
    const ticks = Math.round(realSeconds);
    for (let k = 0; k < ticks; k++) for (let i = 0; i < slices; i++) update(dtReal, timeScale);
    assert.ok(Math.abs(sim.counters.t - 60) <= 1, `timeScale=${timeScale} sim.t=${sim.counters.t}`);
  }
});
