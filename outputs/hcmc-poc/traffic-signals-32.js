// Đèn giao thông 3D + đếm ngược + cột camera cho cụm Hàng Xanh (M1).
// KHÔNG import tĩnh 'three/webgpu' (Node không resolve được) — THREE truyền qua tham số.
export const SIGNALS_32_VERSION = 'signals-32a';
const PHASE_COLOR = { green: 0x2ecc71, yellow: 0xf1c40f, red: 0xe74c3c };
const IDLE_COLOR = 0x2a2f33;
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

export function createTrafficSignals32({ scene, THREE, controller, nodeMap, cameras, camera = null, getViewportH = () => (typeof innerHeight === 'number' ? innerHeight : 900) }) {
  if (!THREE) throw new TypeError('createTrafficSignals32 cần THREE (truyền từ app, không import tĩnh)');
  const group = new THREE.Group();
  group.name = 'traffic-signals-32';
  scene.add(group);
  const heads = [];        // { node, groupIdx, lamps, halos }
  const countdowns = [];   // { node, groupIdx, mesh, canvas, texture }
  const cones = [];        // { cone, frame }

  const makeLamp = (color, y, parent) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(LAMP_R, 14, 14),
      new THREE.MeshStandardMaterial({ color: IDLE_COLOR, emissive: IDLE_COLOR, emissiveIntensity: 0.2, roughness: 0.4 }));
    lamp.position.set(0, y, 0.6);
    parent.add(lamp);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    halo.position.copy(lamp.position);
    halo.visible = false;
    parent.add(halo);
    return { lamp, halo };
  };

  for (const node of nodeMap) {
    const px = node.x, pz = node.z;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, POLE_H, 10),
      new THREE.MeshStandardMaterial({ color: 0x555c60, roughness: 0.7 }));
    pole.position.set(px, POLE_H / 2, pz);
    group.add(pole);
    // Hai nhóm pha, mỗi nhóm hai mặt đối nhau ⇒ từ mọi góc nhìn đều thấy màu của từng hướng.
    for (const g of [0, 1]) {
      const yaw0 = g * Math.PI / 2;
      for (const yaw of [yaw0, yaw0 + Math.PI]) {
        const head = new THREE.Group();
        head.position.set(px, HEAD_Y, pz);
        head.rotation.y = yaw;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.85 }));
        head.add(box);
        const green = makeLamp(PHASE_COLOR.green, 0.7, box);
        const yellow = makeLamp(PHASE_COLOR.yellow, 0, box);
        const red = makeLamp(PHASE_COLOR.red, -0.7, box);
        group.add(head);
        heads.push({ node, groupIdx: g, lamps: { green, yellow, red } });
      }
      // Bảng đếm ngược: canvas bám camera (billboard), phóng theo khoảng cách để luôn đọc được.
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const texture = new THREE.CanvasTexture(canvas);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * COUNTDOWN_H, COUNTDOWN_H),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      mesh.position.set(px + (g ? 1.1 : -1.1), POLE_H + 1.2, pz);
      mesh.userData.countdown = true;
      group.add(mesh);
      countdowns.push({ node, groupIdx: g, mesh, canvas, texture });
    }
    // Cột camera + nón FOV (nếu node có camera).
    const cams = (cameras || []).filter(c => c.node_id === node.node_id);
    for (const cam of cams) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, cam.height_m, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b7276 }));
      column.position.set(cam.x, cam.height_m / 2, cam.z);
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
      for (const mesh of [cone, frame]) { mesh.position.copy(pos); mesh.rotation.set(rot[0], rot[1], rot[2]); group.add(mesh); }
      cones.push({ cone, frame });
    }
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
          pair.lamp.material.emissiveIntensity = on ? 1.6 : 0.12;
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
  const signals = createTrafficSignals32({
    scene: app.scene, THREE, controller: app.controller,
    nodeMap: nodeMap.map(m => ({ ...m, index: traffic.net.G.nodes.findIndex(n => n.id === m.osm_id) })),
    cameras, camera: app.camera, getViewportH: () => app.renderer?.domElement?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 900)
  });
  const tick = () => { signals.update(traffic.sim.counters.t); requestAnimationFrame(tick); };
  tick();
  app.registerSmartModule32('signals', signals);
  return signals;
}
