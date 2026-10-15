// Render-to-texture camera theo registry cameras.json: khung stream + ảnh bằng chứng.
// Thuần toán ở đầu file chạy được trong Node; phần render chỉ chạy trong trình duyệt (THREE truyền vào).
export const CAPTURE_32_VERSION = 'capture-32a';
export const EVIDENCE_W = 1280;
export const EVIDENCE_H = 720;
export const ORIENTATION_BAND = 0.15;   // dải hàng trên/dưới (15 %) để QA kiểm hướng khung: trời phải ở trên
export const PLATE_CROP_W = 320;
export const PLATE_CROP_H = 120;
export const VEHICLE_Y_32 = 1.8;        // m: tâm xe = mặt đường (y = 1,0 của cảnh, groundY) + 0,8 m (điểm chiếu cắt ô biển số)
const FACE_MIN_DOT_32 = 0;              // mặt đèn chỉ được giữ khi nhìn về phía camera (dot > 0)

export function projectToCamera32(x, z, cam) {
  const dx = x - cam.x, dz = z - cam.z;
  const distance = Math.hypot(dx, dz);
  const toPoint = Math.atan2(dz, dx);
  const yaw = cam.yaw_deg * Math.PI / 180;
  let d = toPoint - yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return { distance_m: distance, angle_rad: d };
}

// Chiếu xe (x, z) xuống pixel khung (dùng cho `plate_crop` theo xe) bằng đúng phép chiếu phối cảnh
// của camera chụp: vị trí và pitch/yaw từ cam, FOV là góc ĐỨNG (như PerspectiveCamera của three.js),
// tỉ lệ khung w/h. Tâm xe ở VEHICLE_Y_32. Trả về { px, py, distance_m }; py đo từ đỉnh khung xuống.
export function projectToPixel32(x, z, cam, w, h) {
  const { distance_m } = projectToCamera32(x, z, cam);
  const yaw = cam.yaw_deg * Math.PI / 180, pitch = (cam.pitch_deg || 0) * Math.PI / 180;
  const f = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];   // hướng nhìn
  const r = [-Math.sin(yaw), 0, Math.cos(yaw)];                                                    // sang phải
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];     // hướng lên = r × f
  const d = [x - cam.x, VEHICLE_Y_32 - cam.height_m, z - cam.z];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const xc = dot(d, r), yc = dot(d, u), zc = dot(d, f);
  const th = Math.tan((cam.fov_deg * Math.PI / 180) / 2), tw = th * (w / h);
  const nx = xc / (zc * tw), ny = yc / (zc * th);   // -1..1 trong khung khi |nx|,|ny| ≤ 1 và zc > 0
  return { px: (nx * 0.5 + 0.5) * w, py: (0.5 - ny * 0.5) * h, distance_m };
}

// Hàng đầu của buffer đọc từ render target: WebGPU trả hàng TRÊN-XUỐNG (không lật);
// WebGL readPixels trả hàng DƯỚI-LÊN (phải lật để trời ở trên). Chọn theo backend THỰC TẾ của renderer:
// WebGPURenderer vẫn có readRenderTargetPixelsAsync khi chạy backend WebGL2, nên không suy từ hàm.
export function readbackFlip32(renderer) {
  const backend = renderer && renderer.backend;
  if (backend && backend.isWebGPUBackend === true) return false;
  if (backend && backend.isWebGLBackend === true) return true;
  return !renderer || typeof renderer.readRenderTargetPixelsAsync !== 'function';
}

// Khung bằng chứng chỉ giữ MỘT đầu đèn: đầu đèn của nút camera giám sát có mặt nhìn về camera nhất.
// Một nút có 4 mặt (2 nhóm × 2 mặt đối nhau) nên nếu giữ hết thì đỏ và xanh của các hướng sẽ sáng cùng lúc.
// cam: { node_id, x, z }; heads: [{ node_id, x, z, yaw }] với yaw = rotation.y của Group đầu đèn.
// Trả về chỉ số đầu đèn được giữ, hoặc -1 nếu không mặt nào nhìn về camera.
export function pickCaptureHeads32(cam, heads) {
  let best = -1, bestDot = -Infinity;
  heads.forEach((h, i) => {
    if (h.node_id !== cam.node_id) return;
    const tx = cam.x - h.x, tz = cam.z - h.z, len = Math.hypot(tx, tz) || 1;
    const dot = (Math.sin(h.yaw) * tx + Math.cos(h.yaw) * tz) / len;   // pháp tuyến mặt = (sin yaw, cos yaw)
    if (dot > bestDot) { best = i; bestDot = dot; }
  });
  return best >= 0 && bestDot > FACE_MIN_DOT_32 ? best : -1;
}

// Đo độ sáng + độ xanh trung bình theo băng hàng (độ rộng 15% trên / dưới) để QA assert hướng khung.
// 'sky' = trời (sáng + thiên xanh); 'road' = mặt đường (tối, ít xanh).
export function rowBandStats32(buf, w, h, band = ORIENTATION_BAND) {
  const rows = Math.max(1, Math.round(h * band));
  const stats = (from, to) => {
    let lum = 0, blue = 0, n = 0;
    for (let y = from; y < to; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        blue += b - 0.5 * (r + g);
        n++;
      }
    }
    return n ? { lum: +(lum / n).toFixed(2), blue: +(blue / n).toFixed(2) } : { lum: 0, blue: 0 };
  };
  return { top: stats(0, rows), bottom: stats(h - rows, h), rows };
}

// true khi khung có dấu hiệu: băng trên sáng + thiên xanh hơn băng dưới.
export function skyAboveRoad32(stats) {
  return stats.top.lum > stats.bottom.lum + 2 && stats.top.blue > stats.bottom.blue;
}

export function createCameraCapture32({ renderer, scene, THREE, cameras }) {
  if (!THREE) throw new TypeError('createCameraCapture32 cần THREE (truyền từ app, không import tĩnh)');
  const rigs = new Map();   // camera_id → {camera, target, latest, buffer}
  for (const cam of cameras || []) {
    const camera = new THREE.PerspectiveCamera(cam.fov_deg, EVIDENCE_W / EVIDENCE_H, 0.5, 3000);
    const yaw = cam.yaw_deg * Math.PI / 180, pitch = (cam.pitch_deg || 0) * Math.PI / 180;
    camera.position.set(cam.x, cam.height_m, cam.z);
    camera.rotation.order = 'YXZ';
    // Hướng nhìn Three.js: -Z cục bộ. Cần `rotation.y = -yaw - π/2`, `rotation.x = pitch`
    // (pitch âm = cúi) để khớp perception `(cos yaw, sin yaw)` và `yaw_deg` trong cameras.json.
    camera.rotation.y = -yaw - Math.PI / 2;
    camera.rotation.x = pitch;
    // Chụp chỉ layer 0: helper (nón FOV, cột camera, bảng đếm ngược) đã gắn layer 1 để không lọt vào ảnh.
    if (camera.layers) { camera.layers.set(0); camera.layers.mask |= 1; }
    // colorSpace sRGB để ảnh đọc ra khớp độ sáng khung chính (mặc định NoColorSpace cho ra ảnh tối).
    const target = new THREE.WebGLRenderTarget(EVIDENCE_W, EVIDENCE_H,
      THREE.SRGBColorSpace ? { colorSpace: THREE.SRGBColorSpace } : {});
    rigs.set(cam.camera_id, { cam, camera, target, latest: null, buffer: null });
  }
  // Quét scene một lần: HUD (bảng đếm ngược, quầng đèn) và đầu đèn 3D (Group có userData.signalHead).
  let captureTargets = null;   // { hud: [...], heads: [...] }
  const targetsOf = () => {
    if (!captureTargets) {
      captureTargets = { hud: [], heads: [] };
      scene.traverse(o => {
        const u = o.userData || {};
        if (u.countdown || u.haloGlow) captureTargets.hud.push(o);
        if (u.signalHead) captureTargets.heads.push(o);
      });
    }
    return captureTargets;
  };
  const headDescriptors = () => targetsOf().heads.map(o => ({
    node_id: o.userData.signalNode, x: o.position.x, z: o.position.z, yaw: o.rotation.y
  }));
  // Trước khi chụp: ẩn HUD và quầng (không che xe/đèn); chỉ giữ MỘT đầu đèn của nút camera (xem pickCaptureHeads32).
  // Trạng thái cũ được lưu để khôi phục nguyên vẹn, vì update() của đèn đặt lại visible mỗi khung.
  const hideForCapture = rig => {
    const { hud, heads } = targetsOf();
    const all = [...hud, ...heads];
    const saved = all.map(o => o.visible);
    for (const o of hud) o.visible = false;
    const keep = pickCaptureHeads32(rig.cam, headDescriptors());
    heads.forEach((o, i) => { o.visible = i === keep; });
    return { all, saved };
  };
  const restoreAfterCapture = ({ all, saved }) => all.forEach((o, i) => { o.visible = saved[i]; });
  const renderTo = rig => {
    const hidden = hideForCapture(rig);
    renderer.setRenderTarget(rig.target);
    renderer.render(scene, rig.camera);
    renderer.setRenderTarget(null);
    restoreAfterCapture(hidden);
    const w = EVIDENCE_W, h = EVIDENCE_H;
    // WebGPURenderer: readRenderTargetPixelsAsync(rt, x, y, w, h, textureIndex, faceIndex) TRẢ typed array
    // (KHÔNG nhận buffer đích — đối số thứ 5 là textureIndex). WebGL fallback nhận buffer đích như cũ.
    const flip = readbackFlip32(renderer);
    const read = renderer.readRenderTargetPixelsAsync
      ? renderer.readRenderTargetPixelsAsync(rig.target, 0, 0, w, h, 0, 0)
      : Promise.resolve().then(() => {
        const pixels = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(rig.target, 0, 0, w, h, pixels);
        return pixels;
      });
    return read.then(buf => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      // WebGPU: pixels top-first (không lật); WebGL: gốc dưới-trái (lật). Lật nhầm = ảnh lộn ngược.
      for (let y = 0; y < h; y++) {
        const s = (flip ? (h - 1 - y) : y) * w * 4, dst = y * w * 4;
        img.data.set(buf.subarray(s, s + w * 4), dst);
      }
      ctx.putImageData(img, 0, 0);
      return { jpeg: canvas.toDataURL('image/jpeg', 0.8), w, h, canvas };
    });
  };
  return {
    cameraIds: () => [...rigs.keys()],
    rigOf: cameraId => { const r = rigs.get(cameraId); return r ? { cam: r.cam, camera: r.camera } : null; },
    captureFrame(cameraId) {
      const rig = rigs.get(cameraId);
      if (!rig) return Promise.resolve(null);
      return renderTo(rig).then(frame => {
        rig.buffer = rig.latest;   // giữ khung kế-trước làm `before` cho vi phạm
        rig.latest = { jpeg: frame.jpeg, seq: (rig.latest?.seq ?? 0) + 1, t: Date.now(), w: frame.w, h: frame.h };
        return rig.latest;
      });
    },
    captureEvidence(cameraId, vehicle, tSim, beforeFrame = null) {
      const rig = rigs.get(cameraId);
      if (!rig) return Promise.resolve({ before: null, after: null, plate_crop: null });
      const before = beforeFrame || rig.buffer;   // khung TRƯỚC vạch (vòng trạm giữ)
      return renderTo(rig).then(after => {
        // Cắt ô biển: hộp 320×120 căn theo điểm CHIẾU của xe (không phải giữa khung).
        const { px, py } = projectToPixel32(vehicle.x, vehicle.z, rig.cam, after.w, after.h);
        const sx = Math.max(0, Math.min(after.w - PLATE_CROP_W, Math.round(px) - PLATE_CROP_W / 2));
        const sy = Math.max(0, Math.min(after.h - PLATE_CROP_H, Math.round(py) - PLATE_CROP_H / 2));
        const crop = document.createElement('canvas');
        crop.width = PLATE_CROP_W; crop.height = PLATE_CROP_H;
        const ctx = crop.getContext('2d');
        ctx.drawImage(after.canvas, sx, sy, PLATE_CROP_W, PLATE_CROP_H, 0, 0, PLATE_CROP_W, PLATE_CROP_H);
        const b = before || after;
        return {
          before: { jpeg: b.jpeg, w: b.w || after.w, h: b.h || after.h, kind: 'before' },
          after: { jpeg: after.jpeg, w: after.w, h: after.h, kind: 'after' },
          plate_crop: { jpeg: crop.toDataURL('image/jpeg', 0.9), w: PLATE_CROP_W, h: PLATE_CROP_H, kind: 'plate_crop' },
          px: Math.round(px),
          t_sim: +Number(tSim).toFixed(1)
        };
      });
    },
    // Đèn sẽ hiện trong khung chụp của camera (không render): [{ node_id, group, lit: [tên đèn sáng] }] hoặc [].
    visibleHeadsOf(cameraId) {
      const rig = rigs.get(cameraId);
      if (!rig) return [];
      const { heads } = targetsOf();
      const keep = pickCaptureHeads32(rig.cam, headDescriptors());
      if (keep < 0) return [];
      const o = heads[keep], lit = [];
      o.traverse(c => { if (c.userData && c.userData.lampName && c.material && c.material.emissiveIntensity > 1) lit.push(c.userData.lampName); });
      return [{ node_id: o.userData.signalNode, group: o.userData.signalGroup, lit }];
    },
    latestFrame: cameraId => rigs.get(cameraId)?.latest ?? null,
    setStream(cameraId, on, fps) {
      const rig = rigs.get(cameraId);
      if (!rig) return;
      if (on && !rig.timer) rig.timer = setInterval(() => this.captureFrame(cameraId), 1000 / Math.max(1, fps || 2));
      else if (!on && rig.timer) { clearInterval(rig.timer); rig.timer = null; }
    },
    dispose() {
      for (const rig of rigs.values()) {
        if (rig.timer) clearInterval(rig.timer);
        rig.timer = null;
        if (rig.target && typeof rig.target.dispose === 'function') rig.target.dispose();
      }
    }
  };
}

// T10 — cài capture vào app smart (app = initSmartApp32 của T8). Chỉ gọi trong trình duyệt (cần renderer + THREE).
export function installCameraCapture32(app, { cameras = [], THREE = null } = {}) {
  const capture = createCameraCapture32({ renderer: app.renderer, scene: app.scene, THREE, cameras });
  app.registerSmartModule32('capture', capture);
  if (typeof window !== 'undefined') window.__smartCapture = capture;
  return capture;
}
