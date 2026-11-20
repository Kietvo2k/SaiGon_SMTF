// enforcement-32.test.mjs — demo-v2 (P2-8/P2-7): bàn cưỡng chế + sự cố có hoàn tác.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31 } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32c';
import { createEnforcement32, ENFORCEMENT_PIN_S_32 } from '../enforcement-32.js?v=32c';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/public-north/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide';

function fixture() {
  const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
  const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
  const controller = createSignalController32({ net, sim: null, mode: 'fixed' });
  const sim = {
    counters: { t: 0 }, N: 4, active: new Uint8Array(4), kind: new Uint8Array(4),
    spawnTestNpc(count) { this.spawned = (this.spawned || 0) + count; return count; },
    clearTestNpcs() { this.cleared = (this.cleared || 0) + 1; }
  };
  controller.attachSim(sim);
  const restrictions = [];
  const traffic = { net, sim, setRestrictions: r => restrictions.push(JSON.parse(JSON.stringify(r || {}))) };
  const avoidCalls = [];
  const routing = { setExtraAvoid: edges => avoidCalls.push(edges.slice()) };
  const vmsCalls = [];
  const vms = { setFlood: (id, lines) => vmsCalls.push(['set', id, ...lines]), clearFlood: id => vmsCalls.push(['clear', id]) };
  const emergencyCalls = [];
  const emergency = {
    start: p => { emergencyCalls.push(['start', p.kind]); return { active: true, kind: p.kind }; },
    stop: r => { emergencyCalls.push(['stop', r]); return { active: false }; }
  };
  const events = [];
  const channel = { postMessage: e => events.push(e), close() {} };
  return { net, controller, traffic, restrictions, routing, avoidCalls, vms, vmsCalls, emergency, emergencyCalls, events, channel, boards: [{ id: 'VMS-01', x: -130, z: -2540 }] };
}

test('P2-8: ghim đèn ngẫu nhiên ghi đè đúng cụm, undo nhả ghi đè', () => {
  const f = fixture();
  const enf = createEnforcement32({ ...f, random: () => 0.3, nodeMap, channel: f.channel });
  const pin = enf.pinSignal();
  assert.ok(['HX-C1', 'HX-C2', 'HX-C3', 'HX-C4', 'HX-C5', 'Bac-01', 'Bac-02', 'Bac-03', 'Bac-04', 'Bac-05'].includes(pin.node));
  assert.ok(pin.group === 0 || pin.group === 1);
  const nodeIdx = f.net.signalPlan.clusters.find(c => c.cluster_id === pin.node).nodeIds[0];
  const ov = f.controller.stateOf(nodeIdx, 0).override;
  assert.ok(ov && ov.by === 'ENFORCEMENT-32');
  assert.ok(Math.abs(ov.until_t_sim - ENFORCEMENT_PIN_S_32) < 1e-9, `ghi đè giữ ${ov.until_t_sim} s`);
  assert.equal(enf.count(), 1);
  enf.undo(pin.id);
  assert.equal(f.controller.stateOf(nodeIdx, 0).override, null);
  assert.equal(enf.count(), 0);
});

test('P2-8: bơm xe + triệu hồi xe công vụ có hoàn tác đúng đối tượng', () => {
  const f = fixture();
  const enf = createEnforcement32({ ...f, nodeMap, channel: f.channel });
  const spawn = enf.spawnCars(12);
  assert.equal(f.traffic.sim.spawned, 12);
  assert.equal(spawn.added, 12);
  const service = enf.spawnService('fire');
  assert.deepEqual(f.emergencyCalls.at(-1), ['start', 'fire']);
  assert.equal(enf.count(), 2);
  enf.undo(service.id);
  assert.equal(f.emergencyCalls.at(-1)[0], 'stop');
  enf.undo(spawn.id);
  assert.equal(f.traffic.sim.cleared, 1);
  assert.equal(enf.count(), 0);
});

test('P2-7: tạo tai nạn chặn làn + điều tiết + phát sự kiện before; hoàn tác phát after', () => {
  const f = fixture();
  const enf = createEnforcement32({ ...f, nodeMap, channel: f.channel });
  const incident = enf.createIncident();
  assert.ok(incident.road.length > 0, 'phải biết đường của điểm tai nạn');
  assert.equal(f.restrictions.at(-1).blocks.length, 1, 'phải chặn đúng một làn');
  assert.equal(f.avoidCalls.at(-1).length, 1, 'routeBias tránh đúng một cạnh');
  assert.ok(f.vmsCalls.some(c => c[0] === 'set' && c.join(' ').includes('SỰ CỐ CHẠN LÀN')));
  assert.equal(f.events.at(-1).type, 'incident');
  assert.equal(f.events.at(-1).status, 'before');
  assert.match(f.events.at(-1).plan, /làn kề/);
  enf.undo(incident.id);
  assert.equal((f.restrictions.at(-1).blocks || []).length, 0, 'hoàn tác bỏ mọi chặn');
  assert.equal(f.avoidCalls.at(-1).length, 0);
  assert.ok(f.vmsCalls.some(c => c[0] === 'clear'));
  assert.equal(f.events.at(-1).status, 'after');
});

test('P2-8: undoAll trả mọi thao tác về trạng thái sạch', () => {
  const f = fixture();
  const enf = createEnforcement32({ ...f, random: () => 0.7, nodeMap, channel: f.channel });
  enf.pinSignal(); enf.spawnCars(5); enf.spawnService('police'); enf.createIncident();
  assert.equal(enf.count(), 4);
  const labels = enf.undoAll();
  assert.equal(labels.length, 4);
  assert.equal(enf.count(), 0);
  assert.equal((f.restrictions.at(-1).blocks || []).length, 0);
  assert.equal(f.emergencyCalls.filter(c => c[0] === 'stop').length, 1);
});
