import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectToCamera32, projectToPixel32, createCameraCapture32, CAPTURE_32_VERSION } from '../camera-capture-32.js?v=32a';

const cam = { camera_id: 'CAM-HX-001', x: -231, z: -2422, height_m: 8, yaw_deg: 222, pitch_deg: -12, fov_deg: 60, range_m: 60 };

test('projectToCamera32: xe trước mặt camera nằm trong FOV, sau lưng thì không', () => {
  assert.equal(CAPTURE_32_VERSION, 'capture-32a');
  const front = projectToCamera32(-251, -2440, cam);   // HX-01, trước mặt
  assert.ok(front.distance_m <= cam.range_m);
  assert.ok(Math.abs(front.angle_rad) <= (cam.fov_deg * Math.PI / 180) / 2);
  const back = projectToCamera32(-100, -2000, cam);
  assert.ok(Math.abs(back.angle_rad) > (cam.fov_deg * Math.PI / 180) / 2 || back.distance_m > cam.range_m);
});

test('projectToPixel32: px ti lệ góc lệch (giữa khung khi thẳng trước, lệch khi sang bên)', () => {
  const center = projectToPixel32(cam.x + Math.cos(cam.yaw_deg * Math.PI / 180) * 10, cam.z + Math.sin(cam.yaw_deg * Math.PI / 180) * 10, cam, 1280, 720);
  assert.ok(Math.abs(center.px - 640) < 1);
  const left = projectToPixel32(-251, -2440, cam, 1280, 720);
  assert.ok(left.px > 0 && left.px < 1280);
});

// THREE + document + renderer giả để kiểm hợp đồng createCameraCapture32 (chạy Node, không cần GPU).
function stubEnv() {
  const readCalls = [], cropDraws = [];
  const THREE = {
    SRGBColorSpace: 'srgb',
    PerspectiveCamera: class { constructor(fov, aspect, near, far) { this.fov = fov; this.aspect = aspect; this.rotation = { order: 'XYZ', x: 0, y: 0 }; this.position = { set() {} }; } },
    WebGLRenderTarget: class { constructor(w, h, opts) { this.width = w; this.height = h; this.options = opts; this.textures = [{}]; } dispose() {} }
  };
  const renderer = {
    setRenderTarget() {},
    render() {},
    // chữ ký WebGPU: (renderTarget, x, y, width, height, textureIndex, faceIndex) → Promise<Uint8Array>
    readRenderTargetPixelsAsync(rt, x, y, w, h, ti, fi) { readCalls.push([rt, x, y, w, h, ti, fi]); return Promise.resolve(new Uint8Array(w * h * 4)); }
  };
  const scene = { traverse: fn => fn({ userData: { countdown: true }, visible: true }) };
  const doc = { createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, drawImage(...a) { cropDraws.push(a); } }),
    toDataURL: t => `data:${t || 'image/jpeg'};base64,STUB`
  }) };
  return { THREE, renderer, scene, doc, readCalls, cropDraws };
}

test('captureFrame/captureEvidence: gọi readRenderTargetPixelsAsync đúng chữ ký, trả đủ 3 ảnh + plate_crop theo vị trí xe', async () => {
  const env = stubEnv();
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    const capture = createCameraCapture32({ renderer: env.renderer, scene: env.scene, THREE: env.THREE, cameras: [cam] });
    assert.deepEqual(capture.cameraIds(), ['CAM-HX-001']);
    const frame = await capture.captureFrame('CAM-HX-001');
    assert.match(frame.jpeg, /^data:image\/jpeg/);
    assert.equal(frame.w, 1280); assert.equal(frame.h, 720);
    assert.equal(capture.latestFrame('CAM-HX-001').seq, 1);
    assert.equal(env.readCalls.length, 1);
    assert.equal(env.readCalls[0].length, 7);            // (rt,x,y,w,h,textureIndex,faceIndex)
    assert.equal(env.readCalls[0][5], 0);
    assert.equal(env.readCalls[0][6], 0);
    const ev = await capture.captureEvidence('CAM-HX-001', { x: -251, z: -2440 }, 12);
    assert.equal(ev.before.kind, 'before');
    assert.equal(ev.after.kind, 'after');
    assert.equal(ev.plate_crop.kind, 'plate_crop');
    assert.equal(ev.plate_crop.w, 320); assert.equal(ev.plate_crop.h, 120);
    const { px } = projectToPixel32(-251, -2440, cam, 1280, 720);
    assert.equal(ev.px, Math.round(px));
    // hộp cắt theo vị trí xe (không phải giữa khung): sx = px - 160 (kẹp biên)
    assert.equal(env.cropDraws[0][1], Math.max(0, Math.min(1280 - 320, Math.round(px) - 160)));
    assert.equal(env.cropDraws[0][3], 320);
    assert.equal(env.cropDraws[0][4], 120);
    assert.equal(capture.latestFrame('CAM-HX-999'), null);
    assert.deepEqual(await capture.captureEvidence('CAM-HX-999', { x: 0, z: 0 }, 0), { before: null, after: null, plate_crop: null });
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
});
