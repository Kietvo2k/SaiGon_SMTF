// Render-to-texture camera theo registry cameras.json: khung stream + ảnh bằng chứng.
// Thuần toán ở đầu file chạy được trong Node; phần render chỉ chạy trong trình duyệt (THREE truyền vào).
export const CAPTURE_32_VERSION = 'capture-32a';
export const EVIDENCE_W = 1280;
export const EVIDENCE_H = 720;
export const PLATE_CROP_W = 320;
export const PLATE_CROP_H = 120;

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

// Chiếu vị trí xe (x, z) xuống toạ độ pixel ngang trong khung (dùng cho `plate_crop` theo xe).
export function projectToPixel32(x, z, cam, w, h) {
  const { distance_m, angle_rad } = projectToCamera32(x, z, cam);
  const half = (cam.fov_deg * Math.PI / 180) / 2;
  const nx = Math.tan(Math.max(-half + 1e-4, Math.min(half - 1e-4, angle_rad))) / Math.tan(half);   // -1..1
  const px = (nx * 0.5 + 0.5) * w;
  return { px, py: h * 0.62, distance_m };
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
    // colorSpace sRGB để ảnh đọc ra khớp độ sáng khung chính (mặc định NoColorSpace cho ra ảnh tối).
    const target = new THREE.WebGLRenderTarget(EVIDENCE_W, EVIDENCE_H,
      THREE.SRGBColorSpace ? { colorSpace: THREE.SRGBColorSpace } : {});
    rigs.set(cam.camera_id, { cam, camera, target, latest: null, buffer: null });
  }
  // Bảng đếm ngược là billboard HUD luôn quay về camera chính; trong khung bằng chứng nó che xe/đèn.
  // Quét một lần rồi ẩn khi chụp (đèn + quầng vẫn hiện để thấy hiệu lệnh).
  let overlayMeshes = null;
  const setOverlays = on => {
    if (!overlayMeshes) {
      overlayMeshes = [];
      scene.traverse(o => { if (o.userData && o.userData.countdown) overlayMeshes.push(o); });
    }
    for (const o of overlayMeshes) o.visible = on;
  };
  const renderTo = rig => {
    setOverlays(false);
    renderer.setRenderTarget(rig.target);
    renderer.render(scene, rig.camera);
    renderer.setRenderTarget(null);
    setOverlays(true);
    const w = EVIDENCE_W, h = EVIDENCE_H;
    // WebGPURenderer: readRenderTargetPixelsAsync(rt, x, y, w, h, textureIndex, faceIndex) TRẢ typed array
    // (KHÔNG nhận buffer đích — đối số thứ 5 là textureIndex). WebGL fallback nhận buffer đích như cũ.
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
      // WebGL/WebGPU pixels đọc ngược chiều dọc → lật khi vẽ.
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4, dst = y * w * 4;
        img.data.set(buf.subarray(src, src + w * 4), dst);
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
        // Cắt ô biển: hộp 320×120 theo vị trí CHIẾU của xe (không phải giữa khung).
        const { px } = projectToPixel32(vehicle.x, vehicle.z, rig.cam, after.w, after.h);
        const sx = Math.max(0, Math.min(after.w - PLATE_CROP_W, Math.round(px) - PLATE_CROP_W / 2));
        const sy = Math.round(after.h * 0.62);
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
