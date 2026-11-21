// Đèn giao thông 3D + đếm ngược + cột camera cho cụm Hàng Xanh (M1).
// KHÔNG import tĩnh 'three/webgpu' (Node không resolve được) — THREE truyền qua tham số.
import { SIGNAL_PLAN_32 } from './signal-plan-32.js?v=32c';
import { createTrafficGeometry31 } from './city-traffic-sim-31.js?v=32c';
import { buildJunctionLayout32, junctionPlacements32, HEAD_CURB_OFFSET_32 } from './junction-layout-32.js?v=32c';
export const SIGNALS_32_VERSION = 'signals-32b';
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
const LAMP_R = 0.24;
const COUNTDOWN_H = 0.42;
const COUNTDOWN_MAX_DIST = 220;   // m: xa hơn thì ẩn bảng, tránh nhiều bảng đen nổi giữa cảnh

// Một đầu đèn cho mỗi hướng tiếp cận, bên phải vạch dừng ngoài cùng.
// Nhóm pha lấy trực tiếp từ mô phỏng, không suy đoán từ trục màn hình.
export function signalApproachesOf32(net, geo, nodeMap) {
  const out=[];
  for(const node of nodeMap) {
    const approaches=new Map();
    for(let l=0;l<net.lanes.edge.length;l++) {
      if(net.lanes.to[l]!==node.index) continue;
      const st=net.lanes.st[l], prev=approaches.get(st);
      if(net.signalPlan?.internalSt?.has(st)) continue;
      if(prev!==undefined && net.lanes.offset[prev]>=net.lanes.offset[l]) continue;
      approaches.set(st,l);
    }
    for(const l of approaches.values()) {
      const p=geo.lanePoint(l,Math.max(0,net.lanes.length[l]-net.Rz[node.index]),net.lanes.offset[l]+net.lanes.width[l]/2+HEAD_CURB_OFFSET_32,{});
      const cluster=net.signalPlan?.clusters.find(c=>c.nodeIds.includes(node.index))?.cluster_id || node.node_id;
      const yaw=Math.atan2(-p.tx,-p.tz), groupIdx=net.arriveGroup[net.lanes.st[l]];
      // Hai nhánh bản đồ gần song song trong cùng giao lộ chỉ cần một đầu đèn demo.
      if(out.some(a=>a.cluster===cluster && a.groupIdx===groupIdx && Math.abs(Math.atan2(Math.sin(a.yaw-yaw),Math.cos(a.yaw-yaw)))<Math.PI/6)) continue;
      out.push({node_id:node.node_id,cluster,x:p.x,z:p.z,y:geo.laneY(l,Math.max(0,net.lanes.length[l]-net.Rz[node.index])),groupIdx,yaw});
    }
  }
  return out;
}

export function lightColorOf(phase) {
  return phase === 'green' ? 'green' : phase === 'yellow' ? 'yellow' : 'red';
}

// Trục pha (độ) của nút theo kế hoạch đèn M1; nút không có trong kế hoạch dùng 0.
function axisDegOf32(nodeId, rows = SIGNAL_PLAN_32) {
  const row = rows.find(r => r.node_id === nodeId);
  return row ? row.group_axis_deg : 0;
}

// Toạ độ vạch dừng cho mọi làn đi vào các nút đèn (nodeMap có index = chỉ số nút trong đồ thị).
// geo = createTrafficGeometry31(net, …): lanePoint(l, s, lệch, out) cho điểm trên làn.
// Vạch nằm ngang làn tại s = L − Rz (đúng vị trí dừng của xe trong mô phỏng); (ax, az) là vectơ theo bề ngang làn.
export function stopLinesOf32(net, geo, nodeMap) {
  const { lanes, Rz } = net;
  if (net.G.region === 'bac' && typeof geo.laneY !== 'function') throw new Error('Public cần cao độ làn thật');
  const out = [];
  for (const node of nodeMap) {
    if (!(node.index >= 0)) continue;
    for (let l = 0; l < lanes.edge.length; l++) {
      if (lanes.to[l] !== node.index) continue;
      if(net.signalPlan?.internalSt?.has(lanes.st[l])) continue;
      const s = Math.max(0, lanes.length[l] - Rz[node.index]);
      const a = geo.lanePoint(l, s, lanes.offset[l] + lanes.width[l] / 2, {});
      const b = geo.lanePoint(l, s, lanes.offset[l] - lanes.width[l] / 2, {});
      out.push({ node_id: node.node_id, lane: l, x: (a.x + b.x) / 2, y: (geo.laneY ? geo.laneY(l, s) : net.G.frame.groundY) + STOP_LINE_LIFT_32, z: (a.z + b.z) / 2, ax: a.x - b.x, az: a.z - b.z });
    }
  }
  return out;
}

export function createTrafficSignals32({ scene, THREE, controller, nodeMap, cameras, stopLines = [], approaches = null, rows = SIGNAL_PLAN_32, publicMode = false, camera = null, readTiming = null, getViewportH = () => (typeof innerHeight === 'number' ? innerHeight : 900) }) {
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
  const countdowns = [];   // { node, groupIdx, mesh, canvas, texture, x, z }
  const cones = [];        // { cone, frame }
  const cameraColumns = [];// cột camera: mặc định ẩn, hiện cùng "Vùng quan sát camera"
  // Nhãn thời gian nổi khi bấm trực tiếp vào một đầu đèn: "ĐỎ · 50s".
  let timingSprite = null, timingCanvas = null, timingTexture = null, timingSelected = null, lastTimingPaint = -Infinity, drawTiming = null;

  // Mỗi bóng đèn: khi tắt thì emissive = 0 (không phát sáng) và quầng ẩn.
  // Quầng (halo) chỉ dùng cho cảnh chính; khi chụp bằng chứng thì ẩn hết để không che xe.
  const makeLamp = (color, y, parent, name) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(LAMP_R, 14, 14),
      new THREE.MeshStandardMaterial({ color: IDLE_COLOR, emissive: IDLE_COLOR, emissiveIntensity: 0, roughness: 0.4 }));
    lamp.position.set(0, y, 0.3);
    lamp.userData.lampName = name;
    parent.add(lamp);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
    halo.position.copy(lamp.position);
    halo.visible = false;
    halo.userData.haloGlow = true;
    halo.userData.lampName = name;
    parent.add(halo);
    return { lamp, halo };
  };

  // Đầu đèn dựng từ danh sách nhánh của giao lộ logic (mỗi nhánh một đầu), không nhân theo mã nút.
  const nodeById = new Map(nodeMap.map(n => [n.node_id, n]));
  if (publicMode && (!Array.isArray(approaches) || !approaches.length)) throw new Error('Public cần làn tiếp cận thật để dựng đầu đèn');
  const placements = (Array.isArray(approaches) && approaches.length) ? approaches : nodeMap.flatMap(node => {
    // Fallback cho test/không có dữ liệu làn: 2 nhóm × 2 mặt đối nhau quanh nút.
    const axis = axisDegOf32(node.node_id, rows) * Math.PI / 180;
    return [0, 1].flatMap(g => {
      const theta = axis + g * Math.PI / 2, front = Math.atan2(Math.cos(theta), Math.sin(theta));
      return [front, front + Math.PI].map(yaw => ({ node_id: node.node_id, x: node.x + Math.sin(yaw) * 12, z: node.z + Math.cos(yaw) * 12, y: 0, groupIdx: g, yaw }));
    });
  });
  const seenHead = new Set();
  for (const placement of placements) {
    const { x: px, z: pz, y: baseY = 0, groupIdx: g, yaw } = placement;
    const key = `${(px || 0).toFixed(2)}|${(pz || 0).toFixed(2)}|${Math.round((yaw || 0) * 100)}`;
    if (seenHead.has(key)) continue;   // chống hai nhánh trùng nhau ở cùng vạch dừng
    seenHead.add(key);
    const node = nodeById.get(placement.node_id) || { node_id: placement.node_id || 'HX', x: px || 0, z: pz || 0 };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, POLE_H, 10), new THREE.MeshStandardMaterial({ color: 0x555c60, roughness: 0.7 }));
    pole.position.set(px, baseY + POLE_H / 2, pz); group.add(pole);
    const head = new THREE.Group();
    head.position.set(px, baseY + HEAD_Y, pz);
    head.rotation.y = yaw;
    head.userData.signalHead = true;
    head.userData.signalNode = node.node_id;
    head.userData.signalCluster = placement.cluster || node.node_id;
    head.userData.signalGroup = g;
    head.userData.signalLabel = placement.label || node.node_id;
    // Hộp đèn đứng, viền lưng tối để đầu đèn tách khỏi cột và bầu trời.
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.1, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.85 }));
    head.add(box);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.36, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0e1114, roughness: 0.9 }));
    backing.position.set(0, 0, -0.24);
    head.add(backing);
    const green = makeLamp(PHASE_COLOR.green, -0.7, box, 'green');
    const yellow = makeLamp(PHASE_COLOR.yellow, 0, box, 'yellow');
    const red = makeLamp(PHASE_COLOR.red, 0.7, box, 'red');
    // Mũ che mỗi bóng: giảm chói khi nhìn ngang, không đổi màu đèn.
    for (const y of [-0.7, 0, 0.7]) {
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(LAMP_R + 0.06, LAMP_R + 0.06, 0.12, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x0b0d0f, roughness: 0.9 }));
      hood.position.set(0, y, 0.37);
      hood.rotation.x = Math.PI / 2;
      box.add(hood);
    }
    // Bảng đếm gắn liền đầu đèn (không lơ lửng trên cột), chỉ hiện khi đủ gần.
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, COUNTDOWN_H + 0.06, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x0b0e11, roughness: 0.9 }));
    plate.position.set(0, -1.34, 0.21);
    markHelper(plate); head.add(plate);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.84, COUNTDOWN_H),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.position.set(0, -1.34, 0.235);
    mesh.userData.countdown = true;
    markHelper(mesh); head.add(mesh);
    group.add(head);
    const ownNode = { ...node, x: px, z: pz };
    heads.push({ node: ownNode, groupIdx: g, cluster: placement.cluster || node.node_id, lamps: { green, yellow, red }, head });
    countdowns.push({ node: ownNode, groupIdx: g, mesh, canvas, texture, x: px, z: pz });
  }

  // Demo-v3: ghim tên từng cụm đèn trên bản đồ. Sprite luôn quay về camera, bấm được,
  // và tự tô đỏ/vàng/xanh theo pha đang chạy. Đây là lớp chỉ đường, không phải vật thể giao thông.
  const pinSprites = [];
  const pinHits = [];
  let drawPin = null, areaPin = null, areaMode = null, setAreaMode = null;
  if (THREE.Sprite && THREE.SpriteMaterial && THREE.CanvasTexture) {
  const pinClusters = new Map();
  for (const node of nodeMap) {
    const key = node.cluster_id || node.node_id;
    const item = pinClusters.get(key) || { id: key, x: 0, z: 0, nodeIds: [], count: 0 };
    item.x += node.x; item.z += node.z; item.nodeIds.push(node.node_id); item.count++;
    pinClusters.set(key, item);
  }
  drawPin = (pin, phase) => {
    const ctx = pin.canvas.getContext('2d'), w = pin.canvas.width, h = pin.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const r = 22;
    ctx.beginPath();
    ctx.moveTo(6 + r, 6); ctx.lineTo(w - 6 - r, 6); ctx.quadraticCurveTo(w - 6, 6, w - 6, 6 + r);
    ctx.lineTo(w - 6, h - 6 - r); ctx.quadraticCurveTo(w - 6, h - 6, w - 6 - r, h - 6);
    ctx.lineTo(6 + r, h - 6); ctx.quadraticCurveTo(6, h - 6, 6, h - 6 - r);
    ctx.lineTo(6, 6 + r); ctx.quadraticCurveTo(6, 6, 6 + r, 6); ctx.closePath();
    ctx.fillStyle = 'rgba(8,26,32,.93)'; ctx.fill();
    ctx.strokeStyle = 'rgba(137,216,223,.55)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '700 42px system-ui,Segoe UI,sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1f8f5'; ctx.fillText(pin.id, 20, h / 2 + 1);
    const dot = { red: '#e74c3c', yellow: '#f1c40f', green: '#2ecc71' };
    const order = ['red', 'yellow', 'green'];
    for (let i = 0; i < 3; i++) {
      const cx = w - 84 + i * 26, cy = h / 2;
      const on = order[i] === phase;
      if (on) { ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = on ? dot[order[i]] : 'rgba(160,180,180,.22)'; ctx.fill();
    }
    pin.texture.needsUpdate = true;
  };
  for (const item of pinClusters.values()) {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 112;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.position.set(item.x / item.count, 14, item.z / item.count);
    sprite.scale.set(7.2, 2.1, 1);
    sprite.renderOrder = 20;
    sprite.name = 'signal-pin-32';
    sprite.userData.signalPin = { cluster: item.id, node: item.nodeIds[0] };
    group.add(sprite);
    // Vùng bấm trong suốt lớn hơn nhãn, để click ghim ổn định ở mọi góc camera.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.copy(sprite.position); hit.name = 'signal-pin-hit-32';
    hit.userData.signalPin = sprite.userData.signalPin;
    group.add(hit); pinHits.push(hit);
    pinSprites.push({ sprite, canvas, texture, hit, id: item.id, node: item.nodeIds[0] });
  }
  // Ở mức "Toàn khu", 5 nhãn Hàng Xanh chồng lên nhau. Gom thành một ghim vùng;
  // bấm ghim vùng sẽ bay vào 950 m rồi tách lại 5 ghim cụm.
  const hxItems = [...pinClusters.values()].filter(item => /^HX-/.test(item.id));
  if (hxItems.length > 1) {
    const areaX = hxItems.reduce((sum, item) => sum + item.x / item.count, 0) / hxItems.length;
    const areaZ = hxItems.reduce((sum, item) => sum + item.z / item.count, 0) / hxItems.length;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.position.set(areaX, 24, areaZ);
    sprite.scale.set(14, 3.5, 1);
    sprite.renderOrder = 21;
    sprite.name = 'signal-area-pin-32';
    sprite.visible = false;
    sprite.userData.signalPin = { area: 'HX', x: areaX, z: areaZ, cluster: 'HX-C1', node: 'HX-01' };
    group.add(sprite);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.copy(sprite.position); hit.name = 'signal-area-pin-hit-32'; hit.visible = false;
    hit.userData.signalPin = sprite.userData.signalPin;
    group.add(hit);
    areaPin = { sprite, canvas, texture, hit, x: areaX, z: areaZ };
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,26,32,.95)'; ctx.strokeStyle = 'rgba(137,216,223,.72)'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(8, 8, w - 16, h - 16, 26); else ctx.rect(8, 8, w - 16, h - 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f1f8f5'; ctx.font = '800 40px system-ui,Segoe UI,sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('HÀNG XANH · ' + hxItems.length, 26, h / 2 + 1);
    texture.needsUpdate = true;
  }
  setAreaMode = far => {
    if (!areaPin || areaMode === far) return;
    areaMode = far;
    for (const pin of pinSprites) {
      if (!/^HX-/.test(pin.id)) continue;
      pin.sprite.visible = !far; pin.hit.visible = !far;
    }
    areaPin.sprite.visible = far; areaPin.hit.visible = far;
  };
  }
  if (THREE.Sprite && THREE.SpriteMaterial && THREE.CanvasTexture && typeof document !== 'undefined') {
    timingCanvas = document.createElement('canvas'); timingCanvas.width = 512; timingCanvas.height = 160;
    timingTexture = new THREE.CanvasTexture(timingCanvas);
    timingSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: timingTexture, transparent: true, depthTest: false, depthWrite: false }));
    timingSprite.scale.set(10, 3.2, 1);
    timingSprite.renderOrder = 22;
    timingSprite.name = 'signal-timing-32';
    timingSprite.visible = false;
    markHelper(timingSprite);
    group.add(timingSprite);
    // 1 dòng khi bấm đúng đầu đèn; 2 dòng A/B khi bấm ghim cụm.
    drawTiming = items => {
      const ctx = timingCanvas.getContext('2d'), w = timingCanvas.width, h = timingCanvas.height;
      ctx.clearRect(0, 0, w, h);
      const first = items[0] || { phase: 'red' };
      const accent = items.length > 1 ? '#89d8df' : (first.phase === 'green' ? '#3fb950' : first.phase === 'yellow' ? '#f2a93b' : '#e5484d');
      ctx.fillStyle = 'rgba(4,18,22,.94)'; ctx.strokeStyle = accent; ctx.lineWidth = 5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(8, 8, w - 16, h - 16, 26); else ctx.rect(8, 8, w - 16, h - 16);
      ctx.fill(); ctx.stroke();
      const phaseLabel = p => p === 'green' ? 'XANH' : p === 'yellow' ? 'VÀNG' : 'ĐỎ';
      if (items.length <= 1) {
        ctx.fillStyle = accent; ctx.font = '800 54px system-ui,Segoe UI,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${phaseLabel(first.phase)} · ${Math.max(0, Math.ceil(first.seconds || 0))}s`, w / 2, h / 2 + 2);
      } else {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        items.slice(0, 2).forEach((it, i) => {
          const y = 54 + i * 58;
          ctx.fillStyle = it.phase === 'green' ? '#3fb950' : it.phase === 'yellow' ? '#f2a93b' : '#e5484d';
          ctx.beginPath(); ctx.arc(38, y, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f1f8f5'; ctx.font = '800 38px system-ui,Segoe UI,sans-serif';
          ctx.fillText(`${it.label} ${phaseLabel(it.phase)} ${Math.max(0, Math.ceil(it.seconds || 0))}s`, 64, y + 1);
        });
      }
      timingTexture.needsUpdate = true;
    };
  }
  let lastPinPaint = -Infinity;

  // Cột camera + nón FOV: mặc định ẩn để cảnh không rối; bật cùng checkbox "Vùng quan sát camera".
  for (const node of nodeMap) {
    const cams = (cameras || []).filter(c => c.node_id === node.node_id);
    for (const cam of cams) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, cam.height_m, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b7276 }));
      column.position.set(cam.x, cam.height_m / 2, cam.z);
      column.userData.cameraColumn = true;
      column.visible = false;
      markHelper(column);
      group.add(column);
      cameraColumns.push(column);
      const coneLen = cam.range_m;
      const geometry = new THREE.ConeGeometry(Math.tan((cam.fov_deg * Math.PI / 180) / 2) * coneLen, coneLen, 18, 1, true);
      const cone = new THREE.Mesh(geometry,
        new THREE.MeshBasicMaterial({ color: 0x69a7ff, transparent: true, opacity: 0.06, side: THREE.FrontSide, depthWrite: false }));
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
      for (const sheet of [cone, frame]) { sheet.position.copy(pos); sheet.rotation.set(rot[0], rot[1], rot[2]); sheet.visible = false; markHelper(sheet); group.add(sheet); }
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

  const drawCountdown = (item, seconds, phase) => {
    const ctx = item.canvas.getContext('2d');
    ctx.fillStyle = '#0d1013';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#586065';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 246);
    ctx.fillStyle = phase==='green'?'#2ecc71':phase==='yellow'?'#f1c40f':'#e74c3c';
    ctx.font = 'bold 150px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, Math.ceil(seconds))), 256, 140);
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
        const haloScale = 0.7;
        const state = controller.stateOf(head.node.node_id, tSim);
        const phaseInfo = state.phases.find(p => p.group === head.groupIdx) || {phase:'red'};
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
        const dist = camPos ? Math.hypot(item.x - camPos.x, item.z - camPos.z) : 400;
        const wpp = worldPerPixel(dist);
        const state = controller.stateOf(item.node.node_id, tSim);
        const phaseInfo = state.phases.find(p => p.group === item.groupIdx);
        const seconds=phaseInfo?.countdown_s;
        // Controller trả thời gian pha đang chạy cho cả hướng đỏ: chưa phải thời gian đến xanh.
        // Chỉ hiện đếm lùi xanh/vàng, tránh báo hướng đỏ còn 3s rồi nhảy ngược lên 45s.
        item.mesh.visible=phaseInfo?.phase!=='red' && Number.isFinite(seconds) && seconds>0
          && (!camPos || (dist < COUNTDOWN_MAX_DIST && COUNTDOWN_H/wpp>=6));
        if(item.mesh.visible) drawCountdown(item,seconds,phaseInfo.phase);
      }
      if (drawPin && tSim - lastPinPaint >= .45) {
        lastPinPaint = tSim;
        for (const pin of pinSprites) {
          const state = controller.stateOf(pin.node, tSim);
          const green = state.phases.find(p => p.phase === 'green');
          const yellow = state.phases.find(p => p.phase === 'yellow');
          drawPin(pin, green ? 'green' : yellow ? 'yellow' : 'red');
        }
      }
      // Ghim lớn dần theo khoảng cách để vẫn thấy khi xem toàn khu, nhưng không phình khi đứng gần.
      if (camPos) for (const pin of pinSprites) {
        const d = Math.hypot(pin.sprite.position.x - camPos.x, pin.sprite.position.z - camPos.z);
        // Cỡ chữ trên màn hình gần như cố định (~130 px) ở mọi mức zoom: đủ đọc tên cụm
        // và vẫn bấm trúng, không phình to khi camera sát đầu đèn.
        const s = Math.max(11, Math.min(700, d * .12));
        pin.sprite.scale.set(s, s * .29, 1);
        pin.hit.scale.setScalar(Math.min(40, s / 11));
        // 390 px: đừng để nửa nhãn bị cắt ở mép màn hình; ẩn hẳn ghim ngoài khung.
        const vw = typeof innerWidth === 'number' ? innerWidth : getViewportH() * 1.6;
        const vh = getViewportH();
        const projected = pin.sprite.position.clone().project(camera);
        const sx = (projected.x + 1) / 2 * vw, sy = (-projected.y + 1) / 2 * vh;
        const marginX = Math.min(78, vw * .22), marginY = Math.min(78, vh * .12);
        const onScreen = projected.z < 1 && sx > marginX && sx < vw - marginX && sy > marginY && sy < vh - marginY;
        const hiddenByArea = areaMode === true && /^HX-/.test(pin.id);
        pin.sprite.visible = onScreen && !hiddenByArea;
        pin.hit.visible = pin.sprite.visible;
      }
      if (camPos && areaPin && setAreaMode) {
        const d = Math.hypot(areaPin.sprite.position.x - camPos.x, areaPin.sprite.position.z - camPos.z);
        setAreaMode(d > 1800);
        if (areaPin.sprite.visible) {
          const s = Math.max(14, Math.min(900, d * .16));
          areaPin.sprite.scale.set(s, s * .25, 1);
          areaPin.hit.scale.setScalar(Math.min(60, s / 14));
        }
      }
      if (timingSprite && timingSelected && drawTiming && tSim - lastTimingPaint >= .5) {
        lastTimingPaint = tSim;
        const items = [];
        const timing = readTiming && timingSelected.cluster ? readTiming(timingSelected.cluster) : null;
        const timingItem = (g, n) => ({
          label: Number.isInteger(timingSelected.group) ? '' : (g === 0 ? 'A' : 'B'),
          phase: n?.phase || 'red',
          seconds: n?.phase === 'red' ? (n?.greenAt_s ?? 0) : (n?.remain_s ?? 0)
        });
        if (timing) {
          if (Number.isInteger(timingSelected.group)) items.push(timingItem(timingSelected.group, timing[timingSelected.group]));
          else for (const g of [0, 1]) if (timing[g]) items.push(timingItem(g, timing[g]));
        } else if (Number.isInteger(timingSelected.group)) {
          const state = controller.stateOf(timingSelected.node, tSim);
          const info = state.phases.find(p => p.group === timingSelected.group);
          items.push({ label: '', phase: info?.phase || 'red', seconds: info?.countdown_s || 0 });
        } else {
          for (const g of [0, 1]) {
            const head = heads.find(h => h.cluster === timingSelected.cluster && h.groupIdx === g);
            if (!head) continue;
            const state = controller.stateOf(head.node.node_id, tSim);
            const info = state.phases.find(p => p.group === g);
            items.push({ label: g === 0 ? 'A' : 'B', phase: info?.phase || 'red', seconds: info?.countdown_s || 0 });
          }
        }
        if (!items.length) {
          timingSprite.visible = false;
          timingSelected = null;
        } else {
          drawTiming(items);
          if (camPos) {
            const d = Math.hypot(timingSprite.position.x - camPos.x, timingSprite.position.z - camPos.z);
            const s = Math.max(16, Math.min(300, d * .12));
            timingSprite.scale.set(s, s * .32, 1);
          }
        }
      }
    },
    // Demo-v3: ghim cụm đèn là điểm bấm ưu tiên; trả { cluster, node } hoặc null.
    pickPin(raycaster) {
      if (!raycaster || !pinSprites.length) return null;
      // Ưu tiên đúng nhãn đang thấy; vùng bấm trong suốt chỉ là lưới an toàn.
      const labels = pinSprites.filter(pin => pin.sprite.visible).map(pin => pin.sprite);
      if (areaPin && areaPin.sprite.visible) labels.push(areaPin.sprite);
      const labelHits = raycaster.intersectObjects(labels, false);
      if (labelHits.length) return labelHits[0].object.userData.signalPin;
      const safety = pinHits.filter(hit => hit.visible);
      if (areaPin && areaPin.hit.visible) safety.push(areaPin.hit);
      const hits = raycaster.intersectObjects(safety, false);
      return hits.length ? hits[0].object.userData.signalPin : null;
    },
    pinCount() { return pinSprites.length; },
    // demo-v2 (P1-8): nhấp trực tiếp đầu đèn trong cảnh → mở thanh tra đúng cụm.
    // Trả { node, group, cluster } hoặc null; dùng chính raycaster của cảnh để không thêm picking riêng.
    pickHead(raycaster) {
      if (!raycaster || !heads.length) return null;
      const hits = raycaster.intersectObjects(heads.map(head => head.head), true);
      for (const hit of hits) {
        let object = hit.object;
        while (object && !(object.userData && object.userData.signalHead)) object = object.parent;
        if (object && object.userData && object.userData.signalHead) {
          return { node: object.userData.signalNode, group: object.userData.signalGroup, cluster: object.userData.signalCluster };
        }
      }
      return null;
    },
    // Bấm trực tiếp vào đầu đèn: hiện nhãn thời gian ngay trên đầu đèn.
    showTiming(sel) {
      if (!timingSprite || !sel) {
        if (timingSprite) timingSprite.visible = false;
        timingSelected = null;
        return false;
      }
      if (Number.isInteger(sel.group)) {
        const head = heads.find(h => h.node.node_id === sel.node && h.groupIdx === sel.group);
        if (!head) {
          timingSprite.visible = false;
          timingSelected = null;
          return false;
        }
        timingSelected = { node: sel.node, group: sel.group, cluster: sel.cluster };
        timingSprite.position.set(head.head.position.x, head.head.position.y + 2.3, head.head.position.z);
      } else if (sel.cluster) {
        // Bấm ghim cụm: hiện cả A/B. Đặt nhãn ngay trên ghim để không bị khuất.
        const head = heads.find(h => h.cluster === sel.cluster);
        const pin = pinSprites.find(p => p.id === sel.cluster);
        const anchor = pin ? pin.sprite.position : head ? head.head.position : null;
        if (!anchor) {
          timingSprite.visible = false;
          timingSelected = null;
          return false;
        }
        timingSelected = { cluster: sel.cluster, node: head?.node.node_id || sel.node, group: null };
        const pinTop = pin ? pin.sprite.position.y + pin.sprite.scale.y / 2 : 0;
        timingSprite.position.set(anchor.x, pin ? pinTop + 18 : anchor.y + 2.3, anchor.z);
      } else {
        timingSprite.visible = false;
        timingSelected = null;
        return false;
      }
      timingSprite.visible = true;
      lastTimingPaint = -Infinity;
      return true;
    },
    litLampCount() {
      let n = 0;
      for (const head of heads) for (const pair of Object.values(head.lamps)) n += pair.lamp.material.emissiveIntensity > 1 ? 1 : 0;
      return n;
    },
    setConeVisible(on) {
      for (const { cone, frame } of cones) { cone.visible = !!on; frame.visible = !!on; }
      for (const column of cameraColumns) column.visible = !!on;
    },
    get coneVisible() { return cones.length ? cones[0].cone.visible : false; },
    get cameraVisible() { return cameraColumns.length ? cameraColumns[0].visible : false; },
    coneCount: cones.length,
    cameraColumnCount: cameraColumns.length,
    dispose() {
      scene.remove(group);
    }
  };
}

// T9 — cài đèn 3D vào app smart (app = kết quả initSmartApp32 của T8).
export function installSignals32(app, { nodeMap = [], cameras = [], THREE = null } = {}) {
  const traffic = app.traffic;
  const indexed = nodeMap.map(m => ({ ...m, index: traffic.net.G.nodes.findIndex(n => n.id === m.osm_id) }));
  const geo = createTrafficGeometry31(traffic.net, { jit: [] });
  // Giao lộ logic 3/4/5/6 hướng: mỗi nhánh một đầu đèn; nhánh hẻm bị bỏ khi đã đủ nhánh chính.
  const layout = buildJunctionLayout32({ net: traffic.net, nodeMap: indexed, geo });
  const approaches = junctionPlacements32(layout);
  if (traffic.net.G.region === 'bac' && layout.some(j => !j.arms.some(a => a.incoming && a.head) || !j.arms.some(a => a.outgoing))) throw new Error('Cụm public thiếu làn vào/ra thật');
  const controlled = new Set(layout.flatMap(j => j.arms.filter(a => a.head).flatMap(a => a.laneIds)));
  const stopLines = stopLinesOf32(traffic.net, geo, indexed).filter(s => controlled.has(s.lane));
  const signals = createTrafficSignals32({
    scene: app.scene, THREE, controller: app.controller,
    nodeMap: indexed, stopLines, approaches, rows: traffic.net.signalPlan?.rows || SIGNAL_PLAN_32, publicMode: traffic.net.G.region === 'bac',
    cameras, camera: app.camera,
    // Dùng đúng snapshot của panel để nhãn thời gian khớp số đang hiển thị.
    readTiming: cluster => {
      const snap = app.modules && app.modules.signalInspector && app.modules.signalInspector.snapshot
        ? app.modules.signalInspector.snapshot() : null;
      return snap && snap.rows ? (snap.rows.find(r => r.id === cluster)?.now || null) : null;
    },
    getViewportH: () => app.renderer?.domElement?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 900)
  });
  signals.layout = layout;
  const tick = () => { signals.update(traffic.sim.counters.t); requestAnimationFrame(tick); };
  tick();
  app.registerSmartModule32('signals', signals);
  return signals;
}
