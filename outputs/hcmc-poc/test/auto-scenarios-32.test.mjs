import { test } from 'node:test';
import assert from 'node:assert/strict';
const auto = await import('../auto-scenarios-32.js');
const emergencyMod = await import('../emergency-32.js');

function fakeEnforcement() {
  const calls = { create: 0, undo: [] };
  return {
    calls,
    createIncident() {
      calls.create++;
      return { id: `inc-${calls.create}`, lane: 0, s: 12, x: 100, z: 200, road: 'Điện Biên Phủ', nodeId: 'HX-01' };
    },
    undo(id) { calls.undo.push(id); return 'đã hoàn tác'; }
  };
}

function fakeEmergency() {
  const calls = { start: [], stop: 0 };
  let active = null;
  const api = {
    calls,
    start(input) {
      calls.start.push({ ...input, origin: input.origin ? { ...input.origin } : null, target: input.target ? { ...input.target } : null });
      active = { slot: calls.start.length, kind: input.kind, passed: 0, node_id: 'HX-01', label: `Xe ${input.kind}` };
      return api.status();
    },
    status() { return active ? { active: true, ...active } : { active: false, label: 'Chưa điều xe' }; },
    stop() { if (active) { calls.stop++; active = null; } return api.status(); },
    deactivate() { active = null; },
    get active() { return active; },
    set passed(value) { if (active) active.passed = value; },
    set nodeId(value) { if (active) active.node_id = value; }
  };
  return api;
}

function harness({ fast = false, priorityMs = null, incidentMs = null, enabled = true } = {}) {
  let clock = 0;
  const emergency = fakeEmergency();
  const enforcement = fakeEnforcement();
  const events = [];
  const hidden = { count: 0 };
  const pose = { value: { x: 1000, y: 1, z: 1000 } };
  const scheduler = auto.createAutoScenarios32({
    emergency, enforcement, stations: auto.AUTO_STATIONS_32,
    fast, enabled, priorityMs, incidentMs, now: () => clock,
    emit: event => events.push(event), channel: null,
    poseOf: () => ({ ...pose.value }),
    hideIncident: () => { hidden.count++; },
    retryPoliceMs: 5000,
    priorityHoldMs: 10_000_000, policeHoldMs: 10_000_000
  });
  return {
    scheduler, emergency, enforcement, events, hidden, pose,
    get clock() { return clock; },
    advance(ms) { clock += ms; return scheduler.tick(clock); }
  };
}

test('nhịp 30 giây phát đúng cứu thương → cứu hỏa → công an, đúng trạm', () => {
  const h = harness();
  h.advance(29999);
  assert.equal(h.emergency.calls.start.length, 0, 'chưa tới 30 s thì chưa điều xe');
  h.advance(1);
  assert.equal(h.emergency.calls.start.length, 1);
  assert.equal(h.emergency.calls.start[0].kind, 'ambulance');
  assert.equal(h.emergency.calls.start[0].origin.id, 'hospital');
  h.emergency.deactivate();
  h.advance(30000);
  assert.equal(h.emergency.calls.start[1].kind, 'fire');
  assert.equal(h.emergency.calls.start[1].origin.id, 'fire');
  h.emergency.deactivate();
  h.advance(30000);
  assert.equal(h.emergency.calls.start[2].kind, 'police');
  assert.equal(h.emergency.calls.start[2].origin.id, 'police');
  h.emergency.deactivate();
  h.advance(30000);
  assert.equal(h.emergency.calls.start[3].kind, 'ambulance', 'hết vòng thì quay lại cứu thương');
  assert.equal(h.scheduler.status().priorityRuns, 4);
});

test('5 phút tạo đúng một tai nạn và lưu id + toạ độ', () => {
  const h = harness({ priorityMs: 10_000_000 });
  h.advance(299999);
  assert.equal(h.enforcement.calls.create, 0);
  const status = h.advance(1);
  assert.equal(h.enforcement.calls.create, 1);
  assert.equal(status.incident.id, 'inc-1');
  assert.equal(status.incident.x, 100);
  assert.equal(status.incident.z, 200);
  assert.equal(status.incident.road, 'Điện Biên Phủ');
  assert.ok(h.events.some(event => event.type === 'incident-created' && event.id === 'inc-1'));
  assert.equal(h.scheduler.status().incidentsCreated, 1);
});

test('xe công an tới gần hiện trường ≤40 m thì undo + hide + phát incident-resolved', () => {
  const h = harness({ priorityMs: 300000, incidentMs: 300000 });
  h.advance(300000);
  assert.ok(h.scheduler.status().incident, 'tai nạn phải xuất hiện trước');
  assert.equal(h.emergency.calls.start.at(-1).kind, 'police', 'tai nạn được ưu tiên điều công an');
  assert.equal(h.emergency.calls.start.at(-1).target.x, 100);
  h.pose.value = { x: 105, y: 1, z: 200 };
  h.advance(1000);
  assert.equal(h.enforcement.calls.undo.length, 1);
  assert.equal(h.enforcement.calls.undo[0], 'inc-1');
  assert.equal(h.hidden.count, 1, 'phải ẩn hiện trường');
  assert.ok(h.events.some(event => event.type === 'incident-resolved' && event.id === 'inc-1'));
  assert.equal(h.scheduler.status().incident, null);
  assert.equal(h.scheduler.status().incidentsResolved, 1);
});

test('xe công an đã qua nút sự cố cũng kết thúc tai nạn', () => {
  const h = harness({ priorityMs: 300000, incidentMs: 300000 });
  h.advance(300000);
  h.emergency.nodeId = 'HX-01';
  h.advance(1000);
  h.emergency.passed = 1;
  h.advance(1000);
  assert.equal(h.enforcement.calls.undo.length, 1);
  assert.equal(h.scheduler.status().incident, null);
});

test('không chồng chéo: đang có xe ưu tiên thì bỏ qua lượt mới, không double-run', () => {
  const h = harness({ priorityMs: 30000, incidentMs: 10_000_000 });
  h.advance(30000);
  assert.equal(h.emergency.calls.start.length, 1);
  assert.equal(h.emergency.calls.start[0].kind, 'ambulance');
  h.advance(30000);
  assert.equal(h.emergency.calls.start.length, 1, 'xe đang chạy thì không điều thêm');
  assert.ok(h.scheduler.status().skipped >= 1);
  h.advance(1000);
  assert.equal(h.emergency.calls.start.length, 1, 'không thử lại giữa hai nhịp');
  h.advance(29000);
  assert.equal(h.emergency.calls.start.length, 1, 'nhịp 90 s vẫn bị bỏ qua');
  h.emergency.deactivate();
  h.advance(30000);
  assert.equal(h.emergency.calls.start.length, 2);
  assert.equal(h.emergency.calls.start[1].kind, 'fire', 'bỏ qua lượt thì không mất vòng luân phiên');
});

test('tab ẩn thì dừng nhịp, hiện lại thì hẹn lại và chạy tiếp', () => {
  const h = harness({ priorityMs: 30000, incidentMs: 300000 });
  h.scheduler.pause();
  h.advance(120000);
  assert.equal(h.emergency.calls.start.length, 0, 'tạm dừng thì không điều xe');
  assert.equal(h.scheduler.status().paused, true);
  h.scheduler.resume();
  h.advance(29999);
  assert.equal(h.emergency.calls.start.length, 0, 'resume hẹn lại đủ 30 s, không bắn bù');
  h.advance(1);
  assert.equal(h.emergency.calls.start.length, 1);
});

test('dispose dừng xe tự động, hoàn tác tai nạn và không chạy tiếp', () => {
  const h = harness({ priorityMs: 300000, incidentMs: 300000 });
  h.advance(300000);
  assert.ok(h.scheduler.status().incident);
  const result = h.scheduler.dispose();
  assert.equal(result.disposed, true);
  assert.equal(h.enforcement.calls.undo.length, 1);
  assert.equal(h.hidden.count, 1);
  assert.equal(h.emergency.calls.stop, 1, 'phải dừng đúng xe do kịch bản điều');
  assert.ok(h.events.some(event => event.type === 'incident-resolved' && event.reason === 'Dừng kịch bản tự động'));
  h.advance(300000);
  assert.equal(h.enforcement.calls.create, 1, 'dispose xong không tạo thêm tai nạn');
  assert.equal(h.emergency.calls.start.length, 1, 'dispose xong không điều thêm xe');
});

test('fast mode nén 30 s → 3 s và 5 phút → 10 s', () => {
  const h = harness({ fast: true });
  assert.equal(h.scheduler.priorityMs, 3000);
  assert.equal(h.scheduler.incidentMs, 10000);
  h.advance(3000);
  assert.equal(h.emergency.calls.start.length, 1);
  h.emergency.deactivate();
  h.advance(7000);
  assert.equal(h.enforcement.calls.create, 1, 'tai nạn xuất hiện ở giây thứ 10');
  assert.equal(h.scheduler.status().fast, true);
});

test('tai nạn dừng xe đang chạy của kịch bản để không chồng chéo', () => {
  const h = harness({ priorityMs: 3000, incidentMs: 10000 });
  h.advance(3000);
  assert.equal(h.emergency.calls.start.length, 1);
  assert.equal(h.scheduler.status().emergency.active, true);
  h.advance(3000);
  h.advance(3000);
  h.advance(1000);
  assert.equal(h.emergency.calls.stop, 1, 'phải dừng xe đang chạy trước khi mở hiện trường');
  assert.equal(h.enforcement.calls.create, 1);
  assert.equal(h.scheduler.status().incident.id, 'inc-1');
  assert.equal(h.scheduler.status().emergency.active, false);
});

test('gắn trạm vào làn gần nhất và giữ cấu hình {id,label,x,z,lane}', () => {
  const net = {
    G: {
      nodes: [{ id: 11, x: 0, z: 0 }, { id: 12, x: 100, z: 0 }],
      roads: [{ name: 'Đường thử' }], frame: { groundY: 1 }
    },
    E: [{ road: 0, c: [0, 0, 100, 0], profile: null }], NE: 1, NL: 1,
    lanes: {
      edge: [0], dir: [1], from: [0], to: [1], length: [100], offset: [0], st: [0],
      speed: [10], width: [3], k: [0], n: [1], rank: [0]
    },
    geo: {
      off: Int32Array.of(0), s: Float32Array.of(0, 100), planar: Float32Array.of(100),
      x: Float32Array.of(0, 100), z: Float32Array.of(0, 0),
      nx: Float32Array.of(0, 0), nz: Float32Array.of(1, 1)
    }
  };
  const nodeMap = [{ osm_id: 12, node_id: 'T-12' }];
  const [station] = auto.resolveAutoStations32({
    net, nodeMap,
    stations: [{ id: 'x', label: 'Trạm thử', kind: 'ambulance', x: 25, z: 12 }]
  });
  assert.equal(station.id, 'x');
  assert.equal(station.label, 'Trạm thử');
  assert.equal(station.lane, 0);
  assert.equal(station.x, 25);
  assert.equal(station.z, 0);
  assert.equal(station.siteX, 25);
  assert.equal(station.siteZ, 12);
  assert.equal(station.siteDistanceM, 12);
  assert.equal(station.road, 'Đường thử');
  assert.equal(station.nodeId, 'T-12');
});

test('emergency.start nhận origin: chọn xe gần trạm hơn dù xe kia gần nút hơn', () => {
  const net = {
    G: { nodes: [
      { id: 11, x: 0, z: 0 }, { id: 12, x: 400, z: 0 },
      { id: 13, x: 700, z: 0 }, { id: 14, x: 1100, z: 0 }
    ] },
    Rz: [10, 10, 10, 10], signal: [0, 1, 0, 0], arriveGroup: [0, 1, 0, 0],
    lanes: {
      to: [1, 3], from: [0, 2], length: [400, 400], st: [0, 1],
      edge: [0, 1], offset: [0, 0], dir: [1, 1]
    },
    E: [
      { c: [0, 0, 400, 0], road: 0 }, { c: [700, 0, 1100, 0], road: 0 }
    ],
    roads: [{ name: 'Đường thử' }]
  };
  const sim = {
    N: 2, active: [1, 1], kind: [1, 1], lane: [0, 1], s: [350, 300], gen: [0, 0],
    len: [4.3, 4.3], path: new Int32Array([-1, -1, -1, -1, -1, -1, -1, -1]),
    counters: { t: 0 }, v: [1, 1],
    finishStep() {}, setEmergencyPolicy(policy) { this.policy = policy; }
  };
  const controller = {
    stateOf() { return { override: null, phases: [] }; },
    overridePhase() {}
  };
  const nodeMap = [{ osm_id: 12, node_id: 'A' }, { osm_id: 14, node_id: 'B' }];
  const emergency = emergencyMod.createEmergency32({ sim, net, controller, nodeMap });
  assert.equal(emergency.start({ kind: 'ambulance' }).slot, 0, 'không có trạm: xe gần nút hơn thắng');
  emergency.stop();
  assert.equal(emergency.start({ kind: 'ambulance', origin: { id: 'station', x: 1000, z: 0 } }).slot, 1, 'có trạm: xe gần trạm hơn thắng');
  assert.equal(emergency.status().origin.id, 'station');
});
