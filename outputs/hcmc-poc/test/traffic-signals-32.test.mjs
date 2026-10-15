import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightColorOf, SIGNALS_32_VERSION, createTrafficSignals32, HELPER_LAYER_32, stopLinesOf32 } from '../traffic-signals-32.js?v=32a';
import { SIGNAL_PLAN_32 } from '../signal-plan-32.js?v=32a';

test('lightColorOf ánh xạ phase → màu đèn', () => {
  assert.equal(SIGNALS_32_VERSION, 'signals-32a');
  assert.equal(lightColorOf('green'), 'green');
  assert.equal(lightColorOf('yellow'), 'yellow');
  assert.equal(lightColorOf('red'), 'red');
});

// --- T10b: helper không lọt vào khung camera; đèn/quầng chỉ sáng đúng màu đang chạy ---

function stubThree() {
  const mk = (name) => class {
    constructor(...a) { this.type = name; this.args = a; this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {}, copy(o) { Object.assign(this, o); } }; this.rotation = { set() {} }; this.quaternion = { copy() {} }; this.scale = { setScalar() {}, set() {} }; this.material = new (name === 'Mesh' ? StubMat : class { })(); this.layers = { mask: 1, set(v) { this.mask = 1 << v; }, enable(v) { this.mask |= 1 << v; } }; this.userData = {}; }
    add(c) { this.children.push(c); }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  };
  class StubMat {
    constructor(o) { Object.assign(this, o || {}); this.color = { setHex(v) { this.hex = v; } }; this.emissive = { setHex(v) { this.hex = v; } }; }
  }
  const T = {
    Group: mk('Group'), Mesh: mk('Mesh'),
    PerspectiveCamera: class { constructor(fov, aspect) { this.fov = fov; this.aspect = aspect; this.rotation = { order: 'XYZ', x: 0, y: 0 }; this.position = { set() {} }; this.layers = { mask: 1, set(v) { this.mask = 1 << v; }, enable(v) { this.mask |= 1 << v; } }; } },
    WebGLRenderTarget: class { constructor(w, h) { this.width = w; this.height = h; this.textures = [{}]; } dispose() { } },
    SphereGeometry: class { }, CylinderGeometry: class { }, BoxGeometry: class { }, PlaneGeometry: class { }, ConeGeometry: class { },
    MeshStandardMaterial: StubMat, MeshBasicMaterial: StubMat,
    CanvasTexture: class { constructor(c) { this.canvas = c; this.needsUpdate = false; } },
    Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    FrontSide: 'FrontSide'
  };
  return T;
}

function stubCanvas() {
  const noop = () => { };
  return {
    width: 0, height: 0,
    getContext: () => ({ fillRect: noop, strokeRect: noop, fillText: noop, clearRect: noop }),
    toDataURL: () => 'data:image/png;base64,STUB'
  };
}

const nodeMap = [{ node_id: 'HX-01', osm_id: 366390689, x: -251.2, z: -2439.9, index: 0 }];
const cams = [{ camera_id: 'CAM-HX-001', node_id: 'HX-01', x: -208.2, z: -2469.9, height_m: 7, yaw_deg: 149.9, pitch_deg: -20, fov_deg: 60, range_m: 60 }];

function collect(root, pred, out = []) { root.traverse(o => { if (pred(o)) out.push(o); }); return out; }

globalThis.document = { createElement: () => stubCanvas() };

function makeSignals(phase) {
  const THREE = stubThree();
  const scene = { children: [], add(o) { this.children.push(o); }, remove() { }, traverse(fn) { for (const c of this.children) c.traverse(fn); } };
  const camera = { layers: { mask: 1, enable(v) { this.mask |= (1 << v); } }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const controller = { stateOf: () => ({ phases: [{ group: 0, phase, countdown_s: 12 }, { group: 1, phase: phase === 'red' ? 'green' : 'red', countdown_s: 7 }] }) };
  const s = createTrafficSignals32({ scene, THREE, controller, nodeMap, cameras: cams, camera, getViewportH: () => 900 });
  s.update(10);
  return { s, scene, camera, THREE };
}

test('mặt đèn quay theo TRỤC pha của nút: nhóm 0 song song trục, nhóm 1 vuông góc, mỗi nhóm hai mặt đối nhau', () => {
  for (const row of SIGNAL_PLAN_32) {
    const THREE = stubThree();
    const scene = { add() { }, remove() { }, traverse() { } };
    const s = createTrafficSignals32({ scene, THREE, controller: { stateOf: () => ({ phases: [] }) }, nodeMap: [{ node_id: row.node_id, osm_id: row.osm_id, x: 0, z: 0, index: 0 }], cameras: [] });
    const heads = collect(s.group, o => o.userData && o.userData.signalHead);
    assert.equal(heads.length, 4, `${row.node_id}: 4 đầu đèn`);
    const axis = row.group_axis_deg * Math.PI / 180;
    const dirOf = g => (g === 0 ? [Math.cos(axis), Math.sin(axis)] : [-Math.sin(axis), Math.cos(axis)]);
    for (let g = 0; g < 2; g++) {
      const pair = heads.filter(h => h.userData.signalGroup === g);
      assert.equal(pair.length, 2, `${row.node_id} nhóm ${g}: 2 mặt`);
      const [a, b] = pair.map(h => [Math.sin(h.rotation.y), Math.cos(h.rotation.y)]);   // pháp tuyến mặt
      const [dx, dz] = dirOf(g);
      assert.ok(Math.abs(Math.abs(a[0] * dx + a[1] * dz) - 1) < 1e-9, `${row.node_id} nhóm ${g}: mặt 1 song song trục nhóm`);
      assert.ok(Math.abs(a[0] + b[0]) < 1e-9 && Math.abs(a[1] + b[1]) < 1e-9, `${row.node_id} nhóm ${g}: hai mặt đối nhau`);
    }
    assert.ok(heads.every(h => h.userData.signalNode === row.node_id), 'mỗi đầu đèn gắn đúng mã nút');
  }
});

test('den giao thong: moi dau den chi 1 den sang, den tat co emissive 0 va quang an', () => {
  for (const phase of ['red', 'green', 'yellow']) {
    const { s } = makeSignals(phase);
    const lamps = collect(s.group, o => o.type === 'Mesh' && o.material && 'emissiveIntensity' in o.material);
    assert.ok(lamps.length >= 9, `co den khong? (${lamps.length})`);
    // mỗi đầu đèn (cha gồm box 3 den) chỉ 1 đèn emissiveIntensity > 1
    const heads = collect(s.group, o => o.userData && o.userData.signalHead);
    assert.equal(heads.length, 4, '4 dau den (2 nhom x 2 mat)');
    for (const head of heads) {
      const box = head.children[0];
      const on = box.children.filter(c => c.userData.lampName && c.material.emissiveIntensity > 1);
      assert.equal(on.length, 1, `dau den chi 1 den sang (${on.length})`);
      const off = box.children.filter(c => c.userData.lampName && c.material.emissiveIntensity <= 1);
      for (const o of off) {
        assert.equal(o.material.emissiveIntensity, 0, 'den tat: emissiveIntensity = 0');
        assert.equal(o.material.color.hex, 0x2a2f33, 'den tat: mau toi');
        assert.equal(o.visible, true, 'den tat van hien vo');
      }
      const halos = box.children.filter(c => c.userData.haloGlow);
      assert.equal(halos.filter(x => x.visible).length, 1, 'chi 1 quang sang');
    }
    assert.equal(s.litLampCount(), heads.length, 'tong so den sang = so dau den');
  }
});

test('helper (non FOV, vien non FOV, cot camera, bang dem nguoc) nam layer 1; camera chinh bat layer 1', () => {
  const { s, camera } = makeSignals('red');
  const cones = collect(s.group, o => o.userData.coneHelper);
  const countdown = collect(s.group, o => o.userData.countdown);
  const columns = collect(s.group, o => o.userData.cameraColumn);
  assert.equal(cones.length, 2, 'non FOV + vien = 2 mesh (1 camera)');
  assert.ok(countdown.length >= 1, 'bang dem nguoc');
  assert.ok(columns.length >= 1, 'cot camera');
  for (const o of [...cones, ...countdown, ...columns]) {
    assert.equal(o.layers.mask, 1 << HELPER_LAYER_32, 'helper o layer 1 (khong o layer 0)');
  }
  assert.equal(camera.layers.mask & (1 << HELPER_LAYER_32), 1 << HELPER_LAYER_32, 'camera chinh phai bat layer 1 de thay helper');
});

test('stopLinesOf32: mỗi làn đi vào nút có một vạch tại L − Rz, theo bề ngang làn; làn của nút khác bị bỏ qua', () => {
  // Hai làn vào nút 5 (Rz 11, dài 40), một làn vào nút 7. geo giả: lệch ngang đi theo trục x.
  const net = {
    lanes: { edge: [0, 1, 2], to: [5, 5, 7], length: [40, 40, 40], offset: [1.8, -1.8, 0], width: [3.5, 3.5, 3.5] },
    Rz: Float32Array.from([0, 0, 0, 0, 0, 11, 0, 0]),
    G: { frame: { groundY: 1 } }
  };
  const geo = { lanePoint: (l, s, lat, out) => Object.assign(out, { x: 100 + lat, z: s, tx: 1, tz: 0 }) };
  const lines = stopLinesOf32(net, geo, [{ node_id: 'HX-06', index: 5 }]);
  assert.equal(lines.length, 2, 'chỉ 2 làn vào nút 5');
  for (const s of lines) {
    assert.equal(s.node_id, 'HX-06');
    assert.equal(s.z, 29, 'vạch tại L − Rz = 40 − 11');
    assert.ok(Math.abs(s.y - 1.15) < 1e-9, 'nâng 0,15 m trên mặt đường (groundY 1,0)');
    assert.ok(Math.abs(Math.hypot(s.ax, s.az) - 3.5) < 1e-9, 'vạch dài bằng bề ngang làn');
    assert.ok(Math.abs(s.az) < 1e-9, 'vạch nằm ngang làn (vuông góc hướng đi)');
  }
  assert.ok(Math.abs(lines[0].x - 101.8) < 1e-9, 'tâm vạch làn 1');
});

test('vạch dừng: tấm nằm ngang làn (trục rộng song song (ax, az)) và gắn đúng nút', () => {
  const THREE = stubThree();
  const scene = { add() { }, remove() { }, traverse() { } };
  const stopLines = [{ node_id: 'HX-01', x: 0, y: 1.15, z: 0, ax: 3.5, az: 0 }, { node_id: 'HX-01', x: 4, y: 1.15, z: 4, ax: 0, az: 2.8 }];
  const s = createTrafficSignals32({ scene, THREE, controller: { stateOf: () => ({ phases: [] }) }, nodeMap: [], cameras: [], stopLines });
  const strips = collect(s.group, o => o.userData && o.userData.stopLine);
  assert.equal(strips.length, 2);
  strips.forEach((strip, i) => {
    const e = stopLines[i], len = Math.hypot(e.ax, e.az);
    const ry = strip.rotation.y;
    // trục X cục bộ sau khi xoay (thứ tự YXZ, xoay X = -90°): (cos ry, 0, -sin ry)
    assert.ok(Math.abs(Math.cos(ry) - e.ax / len) < 1e-9 && Math.abs(-Math.sin(ry) - e.az / len) < 1e-9, `tấm ${i} song song bề ngang làn`);
    assert.equal(strip.rotation.order, 'YXZ');
    assert.equal(strip.userData.stopLine, 'HX-01');
  });
});
