// signal-override-countdown-32.test.mjs — demo-v2 (P1-9): đếm ngược đúng khi ghim pha thủ công.
// Mọi tổ hợp: ghim nhóm khác lúc xanh / ghim đúng nhóm đang xanh / ghim lúc vàng / lúc đỏ chung /
// đổi ghim giữa chừng / hết thời gian ghim. Countdown phải giảm đều theo bước 0,1 s và về đúng 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31 } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32c';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function setup(mode = 'fixed') {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode });
  const sim = { counters: { t: 0 } };
  controller.attachSim(sim);
  return { net, controller, sim, signalPlan };
}

const phaseOf = (st, g) => st.phases.find(p => p.group === g);

test('P1-9: ghim nhóm khác lúc đang xanh — vàng 3 s, đỏ chung 2 s, rồi xanh đích đếm đúng tới 0', () => {
  for (const mode of ['fixed', 'smart']) {
    const { controller, sim, signalPlan } = setup(mode);
    const node = signalPlan.signalNodes[0];
    controller.overridePhase(node, 1, 30, 'officer1', 'ghim thử');
    let lastGreenCountdown = null;
    for (let k = 0; k <= 400; k++) {
      const t = k / 10;
      sim.counters.t = t;
      controller.update(t, new Map());
      const st = controller.stateOf(node, t);
      if (t < 3) {
        assert.equal(phaseOf(st, 0).phase, 'yellow', `${mode} t=${t}`);
        assert.ok(Math.abs(phaseOf(st, 0).countdown_s - (3 - t)) <= 0.11, `${mode} t=${t} countdown vàng ${phaseOf(st, 0).countdown_s}`);
      } else if (t < 5) {
        assert.equal(phaseOf(st, 0).phase, 'red', `${mode} t=${t}`);
        assert.ok(Math.abs(phaseOf(st, 0).countdown_s - (5 - t)) <= 0.11, `${mode} t=${t} countdown đỏ chung ${phaseOf(st, 0).countdown_s}`);
      } else if (t < 30) {
        assert.equal(phaseOf(st, 1).phase, 'green', `${mode} t=${t}`);
        assert.equal(phaseOf(st, 0).phase, 'red');
        const cd = phaseOf(st, 1).countdown_s;
        assert.ok(cd >= 0 && cd <= 30.01, `${mode} t=${t} countdown xanh ghim ${cd}`);
        if (lastGreenCountdown !== null) {
          assert.ok(lastGreenCountdown - cd <= 0.11 + 1e-9 && lastGreenCountdown >= cd - 1e-9,
            `${mode} t=${t} countdown phải giảm đều (trước ${lastGreenCountdown}, sau ${cd})`);
        }
        lastGreenCountdown = cd;
      } else if (t <= 30.05) {
        // bước cuối của ghim: countdown về đúng 0, nhóm đích vẫn xanh
        assert.equal(phaseOf(st, 1).phase, 'green', `${mode} t=${t} bước cuối ghim`);
        assert.ok(phaseOf(st, 1).countdown_s <= 0.11, `${mode} t=${t} countdown phải về 0`);
      } else if (t < 33.05) {
        // hết ghim: nhả AN TOÀN. FIXED: nhóm đích qua vàng 3 s. SMART trống hàng chờ: thuật toán giữ xanh tới maxGreen.
        if (mode === 'fixed') {
          assert.equal(phaseOf(st, 1).phase, 'yellow', `${mode} t=${t} nhả an toàn qua vàng`);
        } else {
          assert.ok(['green', 'yellow'].includes(phaseOf(st, 1).phase), `${mode} t=${t} sau nhả pha hợp lệ`);
        }
      }
      if (t > 30.05) assert.equal(st.override, null, `${mode} t=${t} override phải nhả sau until`);
    }
  }
});

test('P1-9: ghim đúng nhóm đang xanh — giữ pha, countdown theo until_t_sim của lệnh ghim', () => {
  const { controller, sim, signalPlan } = setup('fixed');
  const node = signalPlan.signalNodes[0];
  sim.counters.t = 0;
  controller.update(0, new Map());
  assert.equal(phaseOf(controller.stateOf(node, 0), 0).phase, 'green');
  const r = controller.overridePhase(node, 0, 40, 'officer1', 'giữ nhóm đang xanh');
  assert.equal(r.until_t_sim, 40);
  // Nhóm 0 vẫn xanh suốt 40 s (kể cả quá maxGreen 45 chưa tới), countdown giảm từ 40 về 0.
  for (let k = 0; k <= 405; k++) {
    const t = k / 10;
    sim.counters.t = t;
    controller.update(t, new Map());
    const st = controller.stateOf(node, t);
    if (t <= 40) {
      assert.equal(phaseOf(st, 0).phase, 'green', `t=${t}`);
      assert.ok(Math.abs(phaseOf(st, 0).countdown_s - (40 - t)) <= 0.11, `t=${t} cd=${phaseOf(st, 0).countdown_s}`);
    }
  }
});

test('P1-9: ghim lúc đang đỏ chung — qua hết đỏ là sang nhóm đích, không nhảy sớm', () => {
  const { controller, sim, signalPlan } = setup('fixed');
  const node = signalPlan.signalNodes[0];
  sim.counters.t = 24;   // 22 xanh + 2 vào đỏ chung (22+3=25 bắt đầu đỏ? vàng 22-25, đỏ 25-27)
  controller.update(24, new Map());
  assert.equal(phaseOf(controller.stateOf(node, 0), 0).phase, 'yellow', 't=24 nhóm 0 đang vàng');
  controller.overridePhase(node, 0, 20, 'officer1', 'ghim về nhóm 0');
  for (let k = 0; k <= 60; k++) {
    const t = 24 + k / 10;
    sim.counters.t = t;
    controller.update(t, new Map());
    const st = controller.stateOf(node, t);
    if (t < 27) {
      // chưa tới hết đỏ chung: nhóm 1 đang xanh trước đó hoặc đỏ — không được xanh nhóm 0 sớm
      assert.notEqual(phaseOf(st, 0).phase, 'green', `t=${t} không xanh sớm`);
    }
  }
  // Máy trạng thái tới nhóm 0 (ovTarget): xanh nhóm 0 với countdown theo until (24+20=44).
  let seen = false;
  for (let k = 0; k <= 300; k++) {
    const t = 27 + k / 10;
    sim.counters.t = t;
    controller.update(t, new Map());
    const st = controller.stateOf(node, t);
    if (t <= 44 && phaseOf(st, 0).phase === 'green') {
      seen = true;
      assert.ok(Math.abs(phaseOf(st, 0).countdown_s - (44 - t)) <= 0.11, `t=${t} cd=${phaseOf(st, 0).countdown_s}`);
    }
  }
  assert.ok(seen, 'nhóm 0 phải được xanh theo lệnh ghim sau khi qua vàng + đỏ chung');
});

test('P1-9: đổi ghim giữa chừng — ovTarget theo lệnh mới, countdown bám mốc mới', () => {
  const { controller, sim, signalPlan } = setup('fixed');
  const node = signalPlan.signalNodes[0];
  sim.counters.t = 0;
  controller.overridePhase(node, 1, 60, 'officer1', 'ghim nhóm 1');
  // sau 1 s đổi ý: ghim lại nhóm 0 trong 25 s
  sim.counters.t = 1;
  controller.update(1, new Map());
  controller.overridePhase(node, 0, 25, 'officer1', 'đổi sang nhóm 0');
  const until = 1 + 25;
  let seenGreen0 = false;
  for (let k = 0; k <= 500; k++) {
    const t = 1 + k / 10;
    sim.counters.t = t;
    controller.update(t, new Map());
    const st = controller.stateOf(node, t);
    if (t < until) assert.equal(st.override.group, 0, `t=${t} override bám lệnh mới`);
    if (t >= 6 && t <= until && phaseOf(st, 0).phase === 'green') {
      seenGreen0 = true;
      assert.ok(Math.abs(phaseOf(st, 0).countdown_s - (until - t)) <= 0.11, `t=${t} cd=${phaseOf(st, 0).countdown_s}`);
    }
  }
  assert.ok(seenGreen0, 'nhóm 0 phải xanh theo lệnh ghim thay thế');
});

test('P1-9: mọi bước 0,1 s countdown không âm và đơn điệu giảm trong toàn bộ cửa sổ ghim', () => {
  const { controller, sim, signalPlan } = setup('smart');
  const node = signalPlan.signalNodes[2];
  sim.counters.t = 10;
  controller.update(10, new Map());
  const { until_t_sim: until } = controller.overridePhase(node, 1, 45, 'officer1', 'kiểm đơn điệu');
  let previous = null;
  for (let k = 0; k <= 600; k++) {
    const t = 10 + k / 10;
    sim.counters.t = t;
    controller.update(t, new Map());
    const st = controller.stateOf(node, t);
    assert.ok(st.override === null || st.override.until_t_sim === until, `t=${t} mốc until phải giữ nguyên`);
    for (const p of st.phases) {
      assert.ok(p.countdown_s >= 0 && Number.isFinite(p.countdown_s), `t=${t} countdown âm/nan`);
    }
    const cd = phaseOf(st, 1).countdown_s;
    if (t >= 15 && previous !== null && t <= until) {
      assert.ok(previous >= cd - 0.001, `t=${t} countdown nhóm ghim tăng bất thường ${previous} → ${cd}`);
    }
    if (t >= 15) previous = cd;
  }
});
