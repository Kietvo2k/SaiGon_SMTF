// Đèn giao thông 3D + đếm ngược + cột camera cho cụm Hàng Xanh (M1).
// KHÔNG import tĩnh 'three/webgpu' (Node không resolve được) — THREE truyền qua tham số.
import { SIGNAL_PLAN_32 } from './signal-plan-32.js?v=32a';
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32a';
export const SIGNALS_32_VERSION = 'signals-32a';
// Vạch dừng sơn trắng ngang mỗi làn tiếp cận nút đèn, đặt đúng vị trí dừng của mô phỏng (L − Rz).
const STOP_LINE_DEPTH_32 = 0.45;   // m: bề dày vạch
const STOP_LINE_LIFT_32 = 0.15;    // m: nâng khỏi mặt đường (mặt đường cảnh cao hơn groundY một chút; 0,05 m bị che)
const PHASE_COLOR = { green: 0x2ecc71, yellow: 0xf1c40f, red: 0xe74c3c };
const IDLE_COLOR = 0x2a2f33;
// Lớp (layer) chỉ dành cho helper (nón FOV, cột camera, bảng đếm ngược): camera chính bật thêm lớp này,
// camera chụp bằng chứng chỉ đọc lớp 0 nên helper không lọt vào ảnh.
export const HELPER_LAYER_32 = 1;
const POLE_H = 6.0;
const HEAD_Y = 5.0;
const LAMP_R = 0.5;
const HALO_BASE = 2.2;          // đường kính quầng sáng tối thiểu (m)
const HALO_PX = 20;             // quầng sáng phải luôn ≥ 20 px trên màn hình
const COUNTDOWN_PX = 40;        // bảng đếm ngược phải luôn ≥ 40 px cao (đọc được ở góc cận cảnh)
const COUNTDOWN_H = 1.6;        // cao tối thiểu thực (m); rộng = 2 × cao

export function lightColorOf(phase) {
  return phase === 'green' ? 'green' : phase === 'yellow' ? 'yellow' : 'red';
}

// Trục pha (độ) của nút theo kế hoạch đèn M1; nút không có trong kế hoạch dùng 0.
function axisDegOf32(nodeId) {
  const row = SIGNAL_PLAN_32.find(r => r.node_id === nodeId);
  return row ? row.group_axis_deg : 0;
}

// Toạ độ vạch dừng cho mọi làn đi vào các nút đèn (nodeMap có index = chỉ số nút trong đồ thị).
// geo = createTrafficGeometry31(net, …): lanePoint(l, s, lệch, out) cho điểm trên làn.
// Vạch nằm ngang làn tại s = L − Rz (đúng vị trí dừng của xe trong mô phỏng); (ax, az) là vectơ theo bề ngang làn.
export function stopLinesOf32(net, geo, nodeMap) {
  const { lanes, Rz } = net;
  const y = net.G.frame.groundY + STOP_LINE_LIFT_32;
  const out = [];
  for (const node of nodeMap) {
    if (!(node.index >= 0)) continue;
    for (let l = 0; l < lanes.edge.length; l++) {
      if (lanes.to[l] !== node.index) continue;
      const s = Math.max(0, lanes.length[l] - Rz[node.index]);
      const a = geo.lanePoint(l, s, lanes.offset[l] + lanes.width[l] / 2, {});
      const b = geo.lanePoint(l, s, lanes.offset[l] - lanes.width[l] / 2, {});
      out.push({ node_id: node.node_id, x: (a.x + b.x) / 2, y, z: (a.z + b.z) / 2, ax: a.x - b.x, az: a.z - b.z });
    }
  }
  return out;
}

export function createTrafficSignals32({ scene, THREE, controller, nodeMap, cameras, stopLines = [], camera = null, getViewportH = () => (typeof innerHeight === 'number' ? innerHeight : 900) }) {
  if (!THREE) throw new TypeError('createTrafficSignals32 cần THREE (truyền từ app, không import tĩnh)');
  const group = new THREE.Group();
  group.name = 'traffic-signals-32';
  scene.add(group);
  // Helper (nón FOV, viền nón FOV, cột camera, bảng đếm ngược) chỉ hiện với camera chính:
  // gán lớp HELPER_LAYER_32 và bật lớp đó trên camera chính. Camera chụp không đọc lớp này.
  const markHelper = o => {
    if (!o || !o.layers) return o;
    if (!camera || !camera.layers) return o;
    o.layers.set(HELPER_LAYER_32);
    camera.layers.enable(HELPER_LAYER_32);
    return o;
  };

  const heads = [];        // { node, groupIdx, lamps, head }
  const countdowns = [];   // { node, groupIdx, mesh, canvas, texture }
  const cones = [];        // { cone, frame }

  // Mỗi bóng đèn: khi tắt thì emissive = 0 (không phát sáng) và quầng ẩn.
  // Quầng (halo) chỉ dùng cho cảnh chính; khi chụp bằng chứng thì ẩn hết để không che xe.
  const makeLamp = (color, y, parent, name) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(LAMP_R, 14, 14),
      new THREE.MeshStandardMaterial({ color: IDLE_COLOR, emissive: IDLE_COLOR, emissiveIntensity: 0, roughness: 0.4 }));
    lamp.position.set(0, y, 0.6);
    lamp.userData.lampName = name;
    parent.add(lamp);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    halo.position.copy(lamp.position);
    halo.visible = false;
    halo.userData.haloGlow = true;
    halo.userData.lampName = name;
    parent.add(halo);
    return { lamp, halo };
  };

  for (const node of nodeMap) {
    const px = node.x, pz = node.z;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, POLE_H, 10),
      new THREE.MeshStandardMaterial({ color: 0x555c60, roughness: 0.7 }));
    pole.position.set(px, POLE_H / 2, pz);
    group.add(pole);
    // Hai nhóm pha, mỗi nhóm hai mặt đối nhau. Mặt đèn của nhóm g quay theo TRỤC pha của nút
    // (group_axis_deg; nhóm 1 vuông góc trục) để đèn đúng hướng xe tiếp cận thuộc nhóm đó.
    // Pháp tuyến mặt (x,z) = (cos θ, sin θ); Object3D: +Z cục bộ = (sin yaw, cos yaw) ⇒ yaw = atan2(cos θ, sin θ).
    const axis = axisDegOf32(node.node_id) * Math.PI / 180;
    for (const g of [0, 1]) {
      const theta = axis + g * Math.PI / 2;
      const front = Math.atan2(Math.cos(theta), Math.sin(theta));
      for (const yaw of [front, front + Math.PI]) {
        const head = new THREE.Group();
        head.position.set(px, HEAD_Y, pz);
        head.rotation.y = yaw;
        head.userData.signalHead = true;
        head.userData.signalNode = node.node_id;
        head.userData.signalGroup = g;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.85 }));
        head.add(box);
        const green = makeLamp(PHASE_COLOR.green, 0.7, box, 'green');
        const yellow = makeLamp(PHASE_COLOR.yellow, 0, box, 'yellow');
        const red = makeLamp(PHASE_COLOR.red, -0.7, box, 'red');
        group.add(head);
        heads.push({ node, groupIdx: g, lamps: { green, yellow, red }, head });
      }
      // Bảng đếm ngược: canvas bám camera (billboard), phóng theo khoảng cách để luôn đọc được.
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const texture = new THREE.CanvasTexture(canvas);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * COUNTDOWN_H, COUNTDOWN_H),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      mesh.position.set(px + (g ? 1.1 : -1.1), POLE_H + 1.2, pz);
      mesh.userData.countdown = true;
      markHelper(mesh);
      group.add(mesh);
      countdowns.push({ node, groupIdx: g, mesh, canvas, texture });
    }
    // Cột camera + nón FOV (nếu node có camera).
    const cams = (cameras || []).filter(c => c.node_id === node.node_id);
    for (const cam of cams) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, cam.height_m, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b7276 }));
      column.position.set(cam.x, cam.height_m / 2, cam.z);
      column.userData.cameraColumn = true;
      markHelper(column);
      group.add(column);
      const coneLen = cam.range_m;
      const geometry = new THREE.ConeGeometry(Math.tan((cam.fov_deg * Math.PI / 180) / 2) * coneLen, coneLen, 18, 1, true);
      // Một mặt (FrontSide) để nón không bị chồng lớp kép khiến trông đậm hơn mức cần.
      const cone = new THREE.Mesh(geometry,
        new THREE.MeshBasicMaterial({ color: 0x69a7ff, transparent: true, opacity: 0.06, side: THREE.FrontSide, depthWrite: false }));
      // Viền mảnh (≤ 0,1) để thấy biên vùng quan sát mà không che mặt đường.
      const frame = new THREE.Mesh(geometry,
        new THREE.MeshBasicMaterial({ color: 0x9cc6ff, wireframe: true, transparent: true, opacity: 0.08, depthWrite: false }));
      const yaw = cam.yaw_deg * Math.PI / 180, pitch = cam.pitch_deg * Math.PI / 180;
      const pos = new THREE.Vector3(
        cam.x + Math.cos(yaw) * coneLen / 2 * Math.cos(pitch),
        cam.height_m + Math.sin(pitch) * coneLen / 2,
        cam.z + Math.sin(yaw) * coneLen / 2 * Math.cos(pitch));
      const rot = [pitch - Math.PI / 2, 0, -yaw + Math.PI / 2];
      cone.userData.coneHelper = true;
      frame.userData.coneHelper = true;
      for (const mesh of [cone, frame]) { mesh.position.copy(pos); mesh.rotation.set(rot[0], rot[1], rot[2]); markHelper(mesh); group.add(mesh); }
      cones.push({ cone, frame });
    }
  }

  // Vạch dừng: tấm phẳng sơn trắng nằm ngang làn (xem stopLinesOf32). Thuộc cảnh chính (lớp 0) nên có trong ảnh bằng chứng.
  for (const s of stopLines) {
    const len = Math.hypot(s.ax, s.az) || 1;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, STOP_LINE_DEPTH_32),
      new THREE.MeshBasicMaterial({ color: 0xf4f7f8, transparent: true, opacity: 0.92, depthWrite: false }));
    // Tấm nằm trong mặt XZ: xoay X trước rồi Y (thứ tự YXZ) để trục rộng của tấm song song với (ax, az).
    strip.rotation.order = 'YXZ';
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.y = Math.atan2(-s.az, s.ax);
    strip.position.set(s.x, s.y, s.z);
    strip.userData.stopLine = s.node_id;
    group.add(strip);
  }

  const drawCountdown = (item, seconds) => {
    const ctx = item.canvas.getContext('2d');
    ctx.fillStyle = '#0d1013';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#586065';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    ctx.fillStyle = '#f4f7f8';
    ctx.font = 'bold 104px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, Math.ceil(seconds))), 128, 70);
    item.texture.needsUpdate = true;
  };

  const worldPerPixel = dist => {
    const fov = (camera && camera.fov ? camera.fov : 42) * Math.PI / 180;
    return 2 * Math.tan(fov / 2) * Math.max(1, dist) / Math.max(200, getViewportH());
  };

  return {
    group,
    update(tSim) {
      const camPos = camera && camera.position;
      for (const head of heads) {
        const dist = camPos ? Math.hypot(head.node.x - camPos.x, head.node.z - camPos.z) : 400;
        const wpp = worldPerPixel(dist);
        const haloScale = Math.max(HALO_BASE, HALO_PX * wpp);
        const state = controller.stateOf(head.node.node_id, tSim);
        const phaseInfo = state.phases.find(p => p.group === head.groupIdx) || state.phases[0];
        const lit = lightColorOf(phaseInfo.phase);
        for (const [name, pair] of Object.entries(head.lamps)) {
          const on = name === lit;
          pair.lamp.material.color.setHex(on ? PHASE_COLOR[name] : IDLE_COLOR);
          pair.lamp.material.emissive.setHex(on ? PHASE_COLOR[name] : IDLE_COLOR);
          pair.lamp.material.emissiveIntensity = on ? 1.6 : 0;
          pair.halo.visible = on;
          pair.halo.scale.setScalar(on ? haloScale : 1);
          pair.halo.material.color.setHex(PHASE_COLOR[name]);
        }
      }
      for (const item of countdowns) {
        const dist = camPos ? Math.hypot(item.node.x - camPos.x, item.node.z - camPos.z) : 400;
        const wpp = worldPerPixel(dist);
        const height = Math.max(COUNTDOWN_H, COUNTDOWN_PX * wpp);
        item.mesh.scale.set(height / COUNTDOWN_H, height / COUNTDOWN_H, 1);
        if (camera) item.mesh.quaternion.copy(camera.quaternion);
        const state = controller.stateOf(item.node.node_id, tSim);
        const phaseInfo = state.phases.find(p => p.group === item.groupIdx) || state.phases[0];
        drawCountdown(item, phaseInfo.countdown_s);
      }
    },
    litLampCount() {
      let n = 0;
      for (const head of heads) for (const pair of Object.values(head.lamps)) n += pair.lamp.material.emissiveIntensity > 1 ? 1 : 0;
      return n;
    },
    setConeVisible(on) {
      for (const { cone, frame } of cones) { cone.visible = !!on; frame.visible = !!on; }
    },
    get coneVisible() { return cones.length ? cones[0].cone.visible : false; },
    coneCount: cones.length,
    dispose() {
      scene.remove(group);
    }
  };
}

// T9 — cài đèn 3D vào app smart (app = kết quả initSmartApp32 của T8).
export function installSignals32(app, { nodeMap = [], cameras = [], THREE = null } = {}) {
  const traffic = app.traffic;
  const indexed = nodeMap.map(m => ({ ...m, index: traffic.net.G.nodes.findIndex(n => n.id === m.osm_id) }));
  const signals = createTrafficSignals32({
    scene: app.scene, THREE, controller: app.controller,
    nodeMap: indexed,
    stopLines: stopLinesOf32(traffic.net, createTrafficGeometry31(traffic.net, { jit: [] }), indexed),
    cameras, camera: app.camera, getViewportH: () => app.renderer?.domElement?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 900)
  });
  const tick = () => { signals.update(traffic.sim.counters.t); requestAnimationFrame(tick); };
  tick();
  app.registerSmartModule32('signals', signals);
  return signals;
}
