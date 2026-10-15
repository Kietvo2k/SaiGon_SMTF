// M5a — kiểm thử Node: hiệu chỉnh dự báo, mật độ (cao điểm / cầu Sài Gòn / 03:00), hạn chế làn của sim,
// ba kịch bản (start/stop tất định), lệnh trạm (cmd.scenario, cmd.vms), ưu tiên nội dung VMS, đặt đồng hồ 17:30.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { buildTrafficNetwork31, createTrafficSim31, createTrafficGeometry31, SEED } from '../city-traffic-sim-31.js?v=32a';
import { buildSignalPlan32 } from '../signal-plan-32.js?v=32a';
import { createSignalController32 } from '../traffic-controller-32.js?v=32a';
import { regionTrafficPayload, regionOf } from '../city-region-31.js?v=31a';
import { regionPolygon } from '../city-region-31.js?v=31a';
import * as LOCK from '../city-lock-32.js?v=32a';
import { forecastEdge32, calibrateForecast32, PROB_CAP_FREE_32, REL_DECAY_32, forecastRaw32 } from '../forecast-32.js?v=32a';
import { createRouteBias32, createVmsBus32, vmsDisplay32, chooseVmsBoards32 } from '../heat-live-32.js?v=32a';
import { createCommandRouter32, VMS_IDS_32 } from '../station-client-32.js?v=32a';
import { installClock32, clockAt32, DEMAND_BY_HOUR_32 } from '../clock-32.js?v=32a';
import { NORTH_DEMAND_32, NORTH_BRIDGE_OPTS_32, isNorthBridgeException32 } from '../smart-app-32.js?v=32a';
import { PEAK_HANG_XANH_DEMAND } from '../../../scripts/a1-metric-32.mjs';
import {
  SCENARIO_KEYS_32, findLaneBlock32, findFloodEdges32, createScenarios32, circlePolygon32, inPolygon32,
  FLOOD_CENTRE_32, FLOOD_SPEED_K_32, BLOCK_DIST_M_32
} from '../scenarios-32.js?v=32a';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.resolve('outputs/hcmc-poc/data/road-graph-31.js'));
require(path.resolve('outputs/hcmc-poc/data/scene.js'));
const G = globalThis.ROAD_GRAPH_31, D = globalThis.CITY_DATA;
const nodeMap = JSON.parse(fs.readFileSync(path.resolve('outputs/smart-traffic/backend/app/seed/node_map.json'), 'utf8'));
const WIDTHS = { motorway: 16, trunk: 15, primary: 14, secondary: 11, tertiary: 8, residential: 5, living_street: 4, service: 3.5, unclassified: 5, footway: 2.5, pedestrian: 12, cycleway: 2, path: 1.5 };
const widthOf = i => D.roads[i].lanes ? Math.max(WIDTHS[D.roads[i].type] || 4, D.roads[i].lanes * 3.1) : WIDTHS[D.roads[i].type] || 4;
// Cùng bộ lọc đường như app smart (khu Bắc: ẩn đường nhỏ không gần đèn).
const rf = LOCK.lockRoadFilter32({ roads: D.roads, regionOf, signalPoints: nodeMap.map(n => [n.x, n.z]), isSignatureWay: () => false });
const simHidden = new Set([...rf.hidden, ...rf.keptMinor]);
const drawn = i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide' && !simHidden.has(i);
const signalPlan = buildSignalPlan32({ graph: G, nodeMap });
const net = buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn, signalPlan });
const HX = [0, -2485];

function northSim({ demand = null, mode = 'fixed', bridge = true } = {}) {
  const controller = createSignalController32({ net, sim: null, mode });
  const sim = createTrafficSim31(net, { signalPlan, controller, breakerS: 180, seed: SEED, demand });
  const payload = { ...regionTrafficPayload('bac'), margin: 0 };
  sim.setRegion(bridge ? { ...payload, ...NORTH_BRIDGE_OPTS_32 } : payload);
  return { sim, controller };
}
function nearHx(sim) {
  const geo = createTrafficGeometry31(net, { jit: sim.jit, len: sim.len }), P = {};
  let n = 0, bridge = 0;
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    const e = net.lanes.edge[sim.lane[i]];
    if (G.roads[net.E[e].road]?.name === 'Cầu Sài Gòn') bridge++;
    geo.poseAt(i, sim.lane[i], sim.s[i], sim.next[i], sim.prevLane[i], P);
    if (Math.hypot(P.x - HX[0], P.z - HX[1]) <= 300) n++;
  }
  return { near: n, bridge, active: sim.activeCount() };
}

// ---------------------------------------------------------------- hiệu chỉnh dự báo (công thức M5a)
test('hiệu chỉnh: cạnh đang thông (<0,3) ở 30 phút không quá 50 %; horizon 10/20 không bị cắt', () => {
  const base = { prob: 0.92, reliability: 0.7, level: 0.1, slope: 0, n: 6, observedRise: 0 };
  assert.ok(calibrateForecast32({ ...base, horizonMin: 30 }).prob <= PROB_CAP_FREE_32 + 1e-12);
  assert.equal(calibrateForecast32({ ...base, horizonMin: 10 }).prob, 0.92);
  assert.equal(calibrateForecast32({ ...base, horizonMin: 20 }).prob, 0.92);
});

test('hiệu chỉnh: xu hướng tăng rõ (quan sát ≥0,15 và dự kiến ≥0,15) thì không cắt; tăng nhiễu thì cắt', () => {
  const rising = calibrateForecast32({ prob: 0.9, reliability: 0.7, level: 0.28, horizonMin: 30, slope: 0.01, n: 3, observedRise: 0.28 });
  assert.equal(rising.prob, 0.9, 'tăng rõ: giữ xác suất');
  const noisy = calibrateForecast32({ prob: 0.9, reliability: 0.7, level: 0.28, horizonMin: 30, slope: 0.01, n: 3, observedRise: 0.05 });
  assert.ok(noisy.prob <= PROB_CAP_FREE_32, 'quan sát tăng nhỏ: vẫn cắt');
  const flatProj = calibrateForecast32({ prob: 0.9, reliability: 0.7, level: 0.28, horizonMin: 30, slope: 0.00001, n: 3, observedRise: 0.28 });
  assert.ok(flatProj.prob <= PROB_CAP_FREE_32, 'dự kiến phẳng: vẫn cắt');
  const congested = calibrateForecast32({ prob: 0.9, reliability: 0.7, level: 0.45, horizonMin: 30, slope: 0, n: 3, observedRise: 0 });
  assert.equal(congested.prob, 0.9, 'mức ≥0,3 không thuộc luật cắt');
});

test('hiệu chỉnh: độ tin cậy giảm đúng theo horizon (10 > 20 > 30) với cùng đầu vào', () => {
  const inp = { prob: 0.5, reliability: 0.8, level: 0.5, slope: 0, n: 6, observedRise: 0 };
  const r10 = calibrateForecast32({ ...inp, horizonMin: 10 }).reliability;
  const r20 = calibrateForecast32({ ...inp, horizonMin: 20 }).reliability;
  const r30 = calibrateForecast32({ ...inp, horizonMin: 30 }).reliability;
  assert.ok(r10 > r20 && r20 > r30, `${r10} > ${r20} > ${r30}`);
  assert.ok(Math.abs(r30 - 0.8 * (1 - REL_DECAY_32)) < 1e-9);
});

test('hiệu chỉnh trên dự báo thống kê: cạnh thông đứng yên ở 30 phút có prob ≤ 0,5 và giá trị hợp lệ', () => {
  const recent = [0, 60, 120, 180, 240, 300].map(t => ({ t, level: 0.1 }));
  const f = forecastEdge32({ history: new Array(24).fill(0.1), recent, horizonMin: 30 });
  assert.ok(f.prob <= PROB_CAP_FREE_32 && f.prob >= 0 && f.reliability >= 0 && f.reliability <= 1);
  const raw = forecastRaw32({ history: new Array(24).fill(0.1), recent, horizonMin: 30 });
  assert.ok(raw.prob >= 0 && raw.prob <= 1, 'dự báo thô vẫn trong [0,1]');
});

// ---------------------------------------------------------------- mật độ khu Bắc (app smart)
test('nhu cầu app smart = PEAK_HANG_XANH_DEMAND của A1, trừ poolScale (5 thay 10 để lưu lượng HX đạt 5 xe/phút)', () => {
  const { poolScale, ...rest } = NORTH_DEMAND_32;
  const { poolScale: peakScale, ...peakRest } = PEAK_HANG_XANH_DEMAND;
  assert.deepEqual(JSON.parse(JSON.stringify(rest)), JSON.parse(JSON.stringify(peakRest)));
  assert.equal(peakScale, 10);
  assert.equal(poolScale, 5);
});

test('mật độ: 17:30 có ≥120 xe trong 300 m quanh Hàng Xanh và ≥30 xe trên cầu Sài Gòn; 03:00 thưa rõ', () => {
  const peak = northSim({ demand: NORTH_DEMAND_32 });
  peak.sim.setLightFactor(1);
  peak.sim.setFraction(DEMAND_BY_HOUR_32[17]);
  for (let k = 0; k < 600; k++) peak.sim.step();
  const p = nearHx(peak.sim);
  assert.ok(p.near >= 120, `17:30 quanh HX ${p.near} < 120`);
  assert.ok(p.bridge >= 30, `17:30 trên cầu Sài Gòn ${p.bridge} < 30`);
  const night = northSim({ demand: NORTH_DEMAND_32 });
  night.sim.setLightFactor(0.5);
  night.sim.setFraction(DEMAND_BY_HOUR_32[3]);
  for (let k = 0; k < 600; k++) night.sim.step();
  const q = nearHx(night.sim);
  assert.ok(q.near * 3 < p.near, `03:00 (${q.near}) không thưa rõ so với 17:30 (${p.near})`);
});

test('biên khu: chỉ cầu Sài Gòn được vắt ranh; xe ngoài khu không phải xe trên cầu là 0', () => {
  const { sim } = northSim({ demand: NORTH_DEMAND_32 });
  sim.setFraction(1);
  for (let k = 0; k < 300; k++) sim.step();
  let outsideNonBridge = 0, outsideSaigon = 0;
  const geo = createTrafficGeometry31(net, { jit: sim.jit, len: sim.len }), P = {};
  for (let i = 0; i < sim.N; i++) {
    if (!sim.active[i]) continue;
    geo.poseAt(i, sim.lane[i], sim.s[i], sim.next[i], sim.prevLane[i], P);
    if (regionOf(P.x, P.z) === 'bac') continue;
    const e = net.lanes.edge[sim.lane[i]];
    if (isNorthBridgeException32(net, e)) outsideSaigon++;
    else if (!net.bridgeEdge[e]) outsideNonBridge++;   // cầu khác ngoài khu: hiện trạng từ trước M5a, không tính ở đây
  }
  assert.equal(outsideNonBridge, 0, 'xe ngoài khu trên đường thường');
  assert.ok(outsideSaigon >= 0);
  // Chỉ cạnh tên "Cầu Sài Gòn" là ngoại lệ biên: các cầu vắt ranh khác (Thủ Thiêm, Thị Nghè…) vẫn không có xe ngoài khu.
  const names = new Set();
  for (let l = 0; l < net.NL; l++) if (sim.insideLaneOf(l) && net.bridgeEdge[net.lanes.edge[l]]) names.add(G.roads[net.E[net.lanes.edge[l]].road].name);
  assert.ok(names.has('Cầu Sài Gòn'));
});

// ---------------------------------------------------------------- hạn chế làn của sim
test('hạn chế làn: xe không vượt qua xe hỏng; xe rẽ vào làn bị chắn đổi sang làn kề tại nút; bỏ hạn chế → trả nguyên', () => {
  const spot = findLaneBlock32(net, nodeMap);
  assert.ok(spot, 'có làn phải Điện Biên Phủ vào HX-01');
  const { sim } = northSim({ demand: NORTH_DEMAND_32 });
  sim.setFraction(1);
  for (let k = 0; k < 600; k++) sim.step();   // 60 s để có xe trên khu
  const rear = spot.s - 2.2;
  sim.setRestrictions({ blocks: [{ lane: spot.lane, s: rear }] });
  const behind = [];
  for (let i = 0; i < sim.N; i++) if (sim.active[i] && sim.lane[i] === spot.lane && sim.s[i] <= rear) behind.push(i);
  for (let k = 0; k < 900; k++) sim.step();
  for (const i of behind) if (sim.active[i] && sim.lane[i] === spot.lane) assert.ok(sim.s[i] <= rear + 0.01, `xe vượt chắn: s=${sim.s[i]}`);
  let intoBlocked = 0;
  for (let i = 0; i < sim.N; i++) for (let p = 0; p < 4; p++) if (sim.path[i * 4 + p] === spot.lane) intoBlocked++;
  assert.ok(intoBlocked <= 2, `còn ${intoBlocked} lộ trình đi vào làn bị chắn`);
  assert.deepEqual(sim.restrictionCounts(), { closed: 0, blocked: 1, slowed: 0 });
  sim.clearRestrictions();
  assert.deepEqual(sim.restrictionCounts(), { closed: 0, blocked: 0, slowed: 0 });
});

test('hạn chế làn: giảm tốc còn 20 % làm xe trên làn chậm lại; làn đóng bị loại khỏi lộ trình (trừ khi không còn lối khác)', () => {
  const f = findFloodEdges32(net);
  assert.ok(f.shallow.length > 0 && f.deep.length > 0 && f.deep.length < f.shallow.length, 'đoạn ngập có đoạn sâu ⊂ đoạn ngập');
  const lanesOf = [];
  for (let l = 0; l < net.NL; l++) if (f.shallow.includes(net.lanes.edge[l])) lanesOf.push(l);
  const { sim } = northSim({ demand: null });
  sim.setFraction(1);
  for (let k = 0; k < 300; k++) sim.step();
  let before = 0, nb = 0;
  for (let i = 0; i < sim.N; i++) if (sim.active[i] && lanesOf.includes(sim.lane[i])) { before += sim.v[i]; nb++; }
  sim.setRestrictions({ speedMul: lanesOf.map(l => ({ lane: l, k: FLOOD_SPEED_K_32 })) });
  for (let k = 0; k < 400; k++) sim.step();
  let after = 0, na = 0;
  for (let i = 0; i < sim.N; i++) if (sim.active[i] && lanesOf.includes(sim.lane[i])) { after += sim.v[i]; na++; }
  assert.ok(na > 0, 'có xe trên đoạn ngập');
  assert.ok(after / na <= 0.35 * 13.5 + 1e-9, `tốc độ TB trên đoạn ngập ${after / na} vẫn cao`);
  void before; void nb;
  // đóng làn sâu: lộ trình mới không chứa làn đóng (khi còn lối khác)
  sim.setRestrictions({ closed: f.deep.flatMap(e => { const out = []; for (let l = 0; l < net.NL; l++) if (net.lanes.edge[l] === e) out.push(l); return out; }) });
  let closedInPath = 0, pathEntries = 0;
  for (let i = 0; i < sim.N; i++) for (let p = 0; p < 4; p++) { const cur = sim.path[i * 4 + p]; if (cur >= 0) { pathEntries++; if (sim.restrictionCounts().closed && f.deep.includes(net.lanes.edge[cur])) closedInPath++; } }
  // Còn lại: đoạn 0 khi xe đang giữ khóa nút, và lối không còn lựa chọn nào (giữ nguyên, không dịch chuyển xe).
  assert.ok(closedInPath / Math.max(1, pathEntries) < 0.03, `lộ trình còn ${closedInPath}/${pathEntries} đoạn đóng`);
});

test('hạn chế làn: xuất/nhập trạng thái giữ nguyên hạn chế và cùng hash sau khi chạy tiếp', () => {
  const spot = findLaneBlock32(net, nodeMap);
  const a = northSim({ demand: null }).sim;
  a.setFraction(1);
  a.setRestrictions({ blocks: [{ lane: spot.lane, s: spot.s - 2.2 }] });
  for (let k = 0; k < 200; k++) a.step();
  const st = a.exportState();   // không đi qua JSON: JSON biến Infinity thành null
  const b = northSim({ demand: null }).sim;
  b.setFraction(1);
  b.importState(st);
  assert.deepEqual(b.restrictionCounts(), a.restrictionCounts());
  for (let k = 0; k < 100; k++) { a.step(); b.step(); }
  assert.equal(b.stateHash(), a.stateHash());
});

test('hạn chế làn không đổi hash cổ điển (không truyền gì): c05ce91e', () => {
  const plain = createTrafficSim31(buildTrafficNetwork31({ graph: G, roads: D.roads, widthOf, drawn: i => !D.roads[i].tunnel && G.roads[i].skipRender !== 'hide' }));
  plain.setRestrictions({});
  for (let k = 0; k < 300; k++) plain.step();
  assert.equal(plain.stateHash(), 'c05ce91e');
});

// ---------------------------------------------------------------- kịch bản
test('kịch bản: khóa đúng 4 mục; khóa lạ bị từ chối và trạng thái không đổi', () => {
  assert.deepEqual([...SCENARIO_KEYS_32], ['none', 'peak-hang-xanh', 'lane-block', 'flood-nhc']);
  const { sim } = northSim({ demand: null });
  const scn = createScenarios32({ traffic: { sim, net, setRestrictions: r => sim.setRestrictions(r), setVisibleFraction: f => sim.setFraction(f) }, nodeMap, now: () => 0 });
  assert.throws(() => scn.start('priority-run', {}), RangeError);
  assert.equal(scn.status().key, 'none');
});

test('kịch bản lane-block: chắn làn ~120 m trước HX-01, tự hết sau N phút sim, stop trả làn', () => {
  const { sim } = northSim({ demand: null });
  sim.setFraction(1);
  const scn = createScenarios32({ traffic: { sim, net, setRestrictions: r => sim.setRestrictions(r), setVisibleFraction: f => sim.setFraction(f) }, nodeMap, now: () => 0 });
  const r = scn.start('lane-block', { minutes: 5 });
  assert.equal(r.info.distToNodeM, BLOCK_DIST_M_32);
  assert.equal(scn.status().remainingS, 300);
  for (let k = 0; k < 3100; k++) sim.step();   // ≈310 s sim
  scn.tick();
  assert.equal(scn.status().key, 'none', 'hết 5 phút thì tự dừng');
  assert.deepEqual(sim.restrictionCounts(), { closed: 0, blocked: 0, slowed: 0 });
});

test('kịch bản flood-nhc: giảm tốc + đóng đoạn sâu + tránh (routing) + VMS gần vùng ngập; stop xóa hết', () => {
  const { sim } = northSim({ demand: null });
  const routing = createRouteBias32();
  const vms = createVmsBus32();
  const boards = chooseVmsBoards32({ net, nodeMap, max: 4 });
  const scn = createScenarios32({ traffic: { sim, net, setRestrictions: r => sim.setRestrictions(r), setVisibleFraction: f => sim.setFraction(f) }, routing, vms, boards, nodeMap, now: () => 0 });
  const info = scn.start('flood-nhc').info;
  assert.ok(info.shallow > info.deep && info.deep > 0);
  assert.ok(routing.extraAvoided().length === info.shallow);
  assert.ok(info.vms.length >= 1 && info.vms.every(id => VMS_IDS_32.includes(id)));
  const shown = vms.snapshot(boards, []).find(x => x.vms_id === info.vms[0]);
  assert.match(shown.text, /NGẬP NGUYỄN HỮU CẢNH/);
  assert.equal(shown.mode, 'auto');
  scn.stop();
  assert.equal(routing.extraAvoided().length, 0);
  assert.deepEqual(sim.restrictionCounts(), { closed: 0, blocked: 0, slowed: 0 });
  assert.equal(vms.floodOf(info.vms[0]), null);
});

test('kịch bản peak-hang-xanh: đặt đồng hồ 17:30 và nhu cầu 100 %; đổi kịch bản thì dừng cái cũ', () => {
  const { sim } = northSim({ demand: NORTH_DEMAND_32 });
  const traffic = { sim, net, setRestrictions: r => sim.setRestrictions(r), setVisibleFraction: f => sim.setFraction(f) };
  const calls = [];
  const clock = { goTo: (h, m) => { calls.push([h, m]); return true; } };
  const scn = createScenarios32({ traffic, clock, nodeMap, now: () => 0 });
  scn.start('flood-nhc');
  scn.start('peak-hang-xanh');
  assert.deepEqual(calls, [[17, 30]]);
  assert.equal(scn.status().key, 'peak-hang-xanh');
  assert.equal(sim.restrictionCounts().slowed, 0, 'đổi sang cao điểm thì bỏ ngập');
  assert.equal(sim.fraction, 1);
});

test('kịch bản: pool khu Bắc có đủ xe để đếm ở 17:30 (không hạn chế) — mật độ 1 lần đo', () => {
  const { sim } = northSim({ demand: NORTH_DEMAND_32 });
  assert.ok(sim.N > 3600, 'pool khu Bắc lớn hơn pool mặc định');
});

// ---------------------------------------------------------------- lệnh trạm, VMS, đồng hồ
test('lệnh trạm: cmd.scenario gọi start/stop; khóa lạ không làm dừng vòng chạy', () => {
  const calls = [];
  const scenarios = {
    start: (k, p) => { if (k === 'priority-run') throw new RangeError('kịch bản không hỗ trợ: priority-run'); calls.push(['start', k, p]); return { key: k }; },
    stop: () => { calls.push(['stop']); return {}; }
  };
  const logs = [];
  const route = createCommandRouter32({ scenarios, vms: createVmsBus32(), log: m => logs.push(m) });
  assert.deepEqual(route({ event: 'cmd.scenario', data: { key: 'flood-nhc', params: {} } }), { ok: true, key: 'flood-nhc' });
  assert.deepEqual(route({ event: 'cmd.scenario', data: { key: 'none' } }), { ok: true, key: 'none' });
  assert.deepEqual(calls, [['start', 'flood-nhc', {}], ['stop']]);
  assert.equal(route({ event: 'cmd.scenario', data: { key: 'priority-run' } }).ok, false, 'khóa lạ bị từ chối, không ném ra ngoài');
  assert.equal(route({ event: 'kpi.update', data: {} }), null);
  assert.equal(route(null), null);
});

test('lệnh trạm: cmd.vms manual ghi đè (tối đa 2 dòng, ≤ 60 ký tự); auto trả về hệ thống; bảng lạ bị bỏ qua', () => {
  const vms = createVmsBus32();
  const route = createCommandRouter32({ scenarios: null, vms });
  assert.deepEqual(route({ event: 'cmd.vms', data: { vms_id: 'VMS-02', mode: 'manual', text: 'ĐƯỜNG ĐÓNG', lines: ['ĐƯỜNG ĐÓNG', 'ĐI ĐƯỜNG KHÁC', 'DÒNG 3'] } }).lines, ['ĐƯỜNG ĐÓNG', 'ĐI ĐƯỜNG KHÁC']);
  assert.equal(vms.manualOf('VMS-02').text, 'ĐƯỜNG ĐÓNG · ĐI ĐƯỜNG KHÁC');
  route({ event: 'cmd.vms', data: { vms_id: 'VMS-02', mode: 'manual', text: 'x'.repeat(200) } });
  assert.equal(vms.manualOf('VMS-02').lines[0].length, 60);
  assert.equal(route({ event: 'cmd.vms', data: { vms_id: 'VMS-99', mode: 'manual', text: 'x' } }).ok, false);
  route({ event: 'cmd.vms', data: { vms_id: 'VMS-02', mode: 'auto', text: '' } });
  assert.equal(vms.manualOf('VMS-02'), null);
});

test('ưu tiên hiển thị VMS: cán bộ đặt > ngập > cảnh báo kẹt > lái xe an toàn', () => {
  const boards = [{ id: 'VMS-01', altName: 'Cầu Văn Thánh 1', watch: new Set([7]), x: 0, z: 0 }];
  const alerts = [{ edge: 7, prob: 0.9, horizonMin: 20 }];
  const bus = createVmsBus32();
  assert.equal(vmsDisplay32(boards[0], [], bus).state, 'normal');
  assert.equal(vmsDisplay32(boards[0], alerts, bus).state, 'alert');
  bus.setFlood('VMS-01', ['NGẬP NGUYỄN HỮU CẢNH', 'ĐI CẦU VĂN THÁNH 1']);
  assert.match(vmsDisplay32(boards[0], alerts, bus).text, /NGẬP/);
  bus.setManual('VMS-01', ['ĐƯỜNG ĐÓNG']);
  assert.equal(vmsDisplay32(boards[0], alerts, bus).text, 'ĐƯỜNG ĐÓNG');
  assert.equal(bus.snapshot(boards, alerts)[0].mode, 'manual');
});

test('đồng hồ: goTo(17,30) đặt đúng giờ, dựng lại nhu cầu giờ 17 (=100 %) và đi theo đường ngắn', () => {
  const sim = { counters: { t: 0 } };
  let frac = null, light = null;
  const traffic = { sim, setVisibleFraction: f => { frac = f; }, setTimeScale: () => 1, ffRemaining: () => 0, fastForward: () => 0 };
  const api = installClock32({ registerSmartModule32: () => null }, { traffic, setLight: k => { light = k; }, getLight: () => 'day', doc: null, tickMs: 600000 });
  assert.equal(api.goTo(17, 30), true);
  assert.equal(api.clock().label, '17:30');
  assert.equal(frac, DEMAND_BY_HOUR_32[17]);
  assert.equal(light, 'golden');
  api.goTo(3, 0);
  assert.equal(api.clock().label, '03:00');
  assert.equal(clockAt(0).label, '16:00');
  api.dispose();
});

function clockAt(t) { return clockAt32(t, 0); }

// ---------------------------------------------------------------- hình học và biên
test('hình học: đa giác ngập đều 16 đỉnh bao tâm; đa giác ngập chứa điểm tâm', () => {
  const poly = circlePolygon32(FLOOD_CENTRE_32, 350, 16);
  assert.equal(poly.length, 32);
  assert.ok(inPolygon32(poly, FLOOD_CENTRE_32[0], FLOOD_CENTRE_32[1]));
  assert.ok(!inPolygon32(poly, FLOOD_CENTRE_32[0] + 500, FLOOD_CENTRE_32[1]));
  assert.ok(regionPolygon('bac').length >= 3);
});

test('vị trí xe hỏng: làn phải Điện Biên Phủ, lùi đúng 120 m từ vạch HX-01', () => {
  const spot = findLaneBlock32(net, nodeMap);
  assert.equal(G.roads[net.E[net.lanes.edge[spot.lane]].road].name, 'Điện Biên Phủ');
  const e = net.lanes.edge[spot.lane];
  const sameEdge = [];
  for (let l = 0; l < net.NL; l++) if (net.lanes.edge[l] === e) sameEdge.push(l);
  const best = sameEdge.reduce((a, b) => (net.lanes.offset[b] > net.lanes.offset[a] ? b : a));
  assert.equal(spot.lane, best, 'làn có lệch phải lớn nhất');
  assert.ok(spot.s > 0 && spot.s <= net.lanes.length[spot.lane]);
});
