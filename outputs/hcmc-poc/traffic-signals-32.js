// Đèn giao thông 3D + đếm ngược + cột camera cho cụm Hàng Xanh (M1).
// KHÔNG import tĩnh 'three/webgpu' (Node không resolve được) — THREE truyền qua tham số.
export const SIGNALS_32_VERSION = 'signals-32a';
const PHASE_COLOR = { green: 0x2ecc71, yellow: 0xf1c40f, red: 0xe74c3c };
const IDLE_COLOR = 0x2a2f33;

export function lightColorOf(phase) {
  return phase === 'green' ? 'green' : phase === 'yellow' ? 'yellow' : 'red';
}

export function createTrafficSignals32({ scene, THREE, controller, nodeMap, cameras }) {
  if (!THREE) throw new TypeError('createTrafficSignals32 cần THREE (truyền từ app, không import tĩnh)');
  const group = new THREE.Group();
  group.name = 'traffic-signals-32';
  scene.add(group);
  const heads = [];   // {nodeIndex, groupIdx, lamps:{green,yellow,red}, countdown, canvas, texture}

  const makeLamp = (color, x, y) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshStandardMaterial({ color: IDLE_COLOR, emissive: IDLE_COLOR, emissiveIntensity: 0.2 }));
    mesh.position.set(x, y, 0);
    return mesh;
  };

  for (const node of nodeMap) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x555c60, roughness: 0.7 }));
    pole.position.set(node.x + 2.2, 2.6, node.z + 2.2);
    group.add(pole);
    for (const g of [0, 1]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.1, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.8 }));
      box.position.set(node.x + 2.2 + g * 1.1, 4.6, node.z + 2.2);
      group.add(box);
      const lamps = {
        green: makeLamp(PHASE_COLOR.green, 0, 0.65),
        yellow: makeLamp(PHASE_COLOR.yellow, 0, 0),
        red: makeLamp(PHASE_COLOR.red, 0, -0.65)
      };
      for (const m of Object.values(lamps)) { box.add(m); }
      // Bảng đếm ngược: canvas 128×64 → texture.
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const texture = new THREE.CanvasTexture(canvas);
      const countdown = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
      countdown.position.set(node.x + 2.2 + g * 1.1, 3.2, node.z + 2.2);
      group.add(countdown);
      heads.push({ nodeIndex: node, groupIdx: g, lamps, countdown, canvas, texture });
    }
    // Cột camera + nón FOV (nếu node có camera).
    const cams = (cameras || []).filter(c => c.node_id === node.node_id);
    for (const cam of cams) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, cam.height_m, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b7276 }));
      column.position.set(cam.x, cam.height_m / 2, cam.z);
      group.add(column);
      const coneLen = cam.range_m;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan((cam.fov_deg * Math.PI / 180) / 2) * coneLen, coneLen, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x69a7ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      const yaw = cam.yaw_deg * Math.PI / 180, pitch = cam.pitch_deg * Math.PI / 180;
      cone.position.set(cam.x + Math.cos(yaw) * coneLen / 2 * Math.cos(pitch), cam.height_m + Math.sin(pitch) * coneLen / 2, cam.z + Math.sin(yaw) * coneLen / 2 * Math.cos(pitch));
      cone.rotation.set(pitch - Math.PI / 2, 0, -yaw + Math.PI / 2);
      group.add(cone);
    }
  }

  const drawCountdown = (head, seconds) => {
    const ctx = head.canvas.getContext('2d');
    ctx.fillStyle = '#111417';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#f4f7f8';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.max(0, Math.ceil(seconds))), 64, 48);
    head.texture.needsUpdate = true;
  };

  return {
    group,
    update(tSim) {
      for (const head of heads) {
        const state = controller.stateOf(head.nodeIndex.node_id, tSim);   // head.nodeIndex là hàng nodeMap (có .node_id/.index)
        const phaseInfo = state.phases.find(p => p.group === head.groupIdx) || state.phases[0];
        const lit = lightColorOf(phaseInfo.phase);
        for (const [name, mesh] of Object.entries(head.lamps)) {
          const on = name === lit;
          mesh.material.color.setHex(on ? PHASE_COLOR[name] : IDLE_COLOR);
          mesh.material.emissive.setHex(on ? PHASE_COLOR[name] : IDLE_COLOR);
          mesh.material.emissiveIntensity = on ? 1.2 : 0.15;
        }
        drawCountdown(head, phaseInfo.countdown_s);
      }
    },
    dispose() {
      scene.remove(group);
    }
  };
}

// T9 — cài đèn 3D vào app smart (app = kết quả initSmartApp32 của T8).
export function installSignals32(app, { nodeMap = [], cameras = [], THREE = null }) {
  const traffic = app.traffic;
  const signals = createTrafficSignals32({
    scene: app.scene, THREE, controller: app.controller,
    nodeMap: nodeMap.map(m => ({ ...m, index: traffic.net.G.nodes.findIndex(n => n.id === m.osm_id) })),
    cameras
  });
  const tick = () => { signals.update(traffic.sim.counters.t); requestAnimationFrame(tick); };
  tick();
  app.registerSmartModule32('signals', signals);
  return signals;
}
