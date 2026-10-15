import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectToCamera32, projectToPixel32, createCameraCapture32, CAPTURE_32_VERSION, readbackFlip32, rowBandStats32, skyAboveRoad32, pickCaptureHeads32, ORIENTATION_BAND, VEHICLE_Y_32 } from '../camera-capture-32.js?v=32a';

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

// --- T10b: hướng ảnh (trời phải ở trên) ---

test('projectToPixel32 theo phép chiếu phối cảnh: xa hơn thì cao hơn trong khung; sang phải thì px lớn hơn', () => {
  const c = { camera_id: 'T', node_id: 'N', x: 0, z: 0, height_m: 7, yaw_deg: 0, pitch_deg: -20, fov_deg: 60, range_m: 60 };
  const d0 = (7 - VEHICLE_Y_32) / Math.tan(20 * Math.PI / 180);   // điểm đúng tâm khung (tia nhìn cắt tâm xe)
  const mid = projectToPixel32(d0, 0, c, 1280, 720);
  assert.ok(Math.abs(mid.px - 640) < 1 && Math.abs(mid.py - 360) < 1, `tâm: ${mid.px},${mid.py}`);
  const near = projectToPixel32(10, 0, c, 1280, 720), far = projectToPixel32(40, 0, c, 1280, 720);
  assert.ok(far.py < near.py, `xa hơn lên trên (${far.py} < ${near.py})`);
  const right = projectToPixel32(d0, 5, c, 1280, 720);           // yaw 0 → bên phải là +z
  assert.ok(right.px > 640, `sang phải thì px > 640 (${right.px})`);
});

test('rowBandStats32 + skyAboveRoad32: khung trời-trên nhận true, khung lật dọc nhận false', () => {
  const w = 20, h = 100;
  const sky = new Uint8Array(w * h * 4);     // trời xanh sáng 2/3 trên, đường tối 1/3 dưới
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, top = y < 66;
      sky[i] = top ? 120 : 50; sky[i + 1] = top ? 180 : 48; sky[i + 2] = top ? 235 : 46; sky[i + 3] = 255;
    }
  }
  const s1 = rowBandStats32(sky, w, h);
  assert.equal(s1.rows, Math.round(h * ORIENTATION_BAND));
  assert.ok(s1.top.lum > s1.bottom.lum + 2, `trên sáng hơn dưới (${s1.top.lum} > ${s1.bottom.lum})`);
  assert.ok(s1.top.blue > s1.bottom.blue);
  assert.equal(skyAboveRoad32(s1), true);
  const flipped = new Uint8Array(sky.length);   // ảnh lộn ngược: hàng trên = hàng dưới cũ
  for (let y = 0; y < h; y++) flipped.set(sky.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  assert.equal(skyAboveRoad32(rowBandStats32(flipped, w, h)), false, 'ảnh lộn ngược phải bị phát hiện');
});

test('readbackFlip32 theo backend thật: WebGPU không lật; WebGL (kể cả WebGPURenderer chạy backend WebGL2) lật', () => {
  const read = () => {};
  assert.equal(readbackFlip32({ backend: { isWebGPUBackend: true }, readRenderTargetPixelsAsync: read }), false);
  assert.equal(readbackFlip32({ backend: { isWebGLBackend: true }, readRenderTargetPixelsAsync: read }), true);
  assert.equal(readbackFlip32({ readRenderTargetPixelsAsync: read }), false);
  assert.equal(readbackFlip32({ readRenderTargetPixels() { } }), true);
  assert.equal(readbackFlip32(null), true);
});

// Hàm dựng khung giả: renderer + document + ảnh; trả về ImageData đã ghi (để đo hàng trên/dưới).
function frameEnv(backend, buf) {
  const env = stubEnv();
  env.renderer.backend = backend;
  env.renderer.readRenderTargetPixelsAsync = () => Promise.resolve(buf);
  const put = [];
  env.doc.createElement = () => ({
    width: 0, height: 0,
    getContext: () => ({ createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }), putImageData(img) { put.push(img); }, drawImage() { } }),
    toDataURL: () => 'data:image/jpeg;base64,STUB'
  });
  return { env, put };
}

// Khung giả: 2/3 trên là trời sáng xanh, 1/3 dưới là mặt đường tối (theo thứ tự hàng "trên-xuống").
function skyTopFirst(w, h) {
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, top = y < h * 2 / 3;
    buf[i] = top ? 120 : 50; buf[i + 1] = top ? 180 : 48; buf[i + 2] = top ? 235 : 46; buf[i + 3] = 255;
  }
  return buf;
}

test('captureFrame (WebGPU): không lật dọc — hàng đầu của buffer là hàng trên khung', async () => {
  const w = 1280, h = 720;
  const { env, put } = frameEnv({ isWebGPUBackend: true }, skyTopFirst(w, h));
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    const capture = createCameraCapture32({ renderer: env.renderer, scene: env.scene, THREE: env.THREE, cameras: [cam] });
    await capture.captureFrame('CAM-HX-001');
    const d = put[0].data;
    assert.ok(d[1] > d[(h - 1) * w * 4 + 1], `hàng trên phải sáng hơn hàng dưới (${d[1]} > ${d[(h - 1) * w * 4 + 1]})`);
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
});

test('captureFrame (WebGPURenderer chạy backend WebGL2): buffer dưới-lên nên ảnh vẽ ra phải lật lại để trời ở trên', async () => {
  const w = 1280, h = 720;
  const raw = new Uint8Array(w * h * 4);      // theo quy ước WebGL: hàng 0 = DƯỚI (đường tối)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, roadHalf = y < h / 3;
    raw[i] = roadHalf ? 50 : 120; raw[i + 1] = roadHalf ? 48 : 180; raw[i + 2] = roadHalf ? 46 : 235; raw[i + 3] = 255;
  }
  const { env, put } = frameEnv({ isWebGLBackend: true }, raw);
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    const capture = createCameraCapture32({ renderer: env.renderer, scene: env.scene, THREE: env.THREE, cameras: [cam] });
    await capture.captureFrame('CAM-HX-001');
    const d = put[0].data;
    assert.ok(d[1] > d[(h - 1) * w * 4 + 1], `WebGL phải lật để trời lên (${d[1]} > ${d[(h - 1) * w * 4 + 1]})`);
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
});

// --- T10b: chỉ giữ MỘT đầu đèn của nút camera (đỏ và xanh không sáng cùng lúc trong khung) ---

test('pickCaptureHeads32: chỉ xét đầu đèn của đúng nút camera; chọn mặt nhìn về camera nhất; không mặt nào nhìn về camera → -1', () => {
  const c = { node_id: 'HX-06', x: 0, z: -30 };   // camera ở phía nam (z âm) của nút HX-06 tại (0,0)
  const heads = [
    { node_id: 'HX-06', x: 0, z: 0, yaw: 0 },                 // mặt quay đi: dot -1
    { node_id: 'HX-06', x: 0, z: 0, yaw: Math.PI },           // mặt nhìn thẳng camera: dot 1  → chọn
    { node_id: 'HX-06', x: 0, z: 0, yaw: 2 * Math.PI / 3 },   // khác nhóm, nhìn lệch: dot 0,5 → loại
    { node_id: 'HX-01', x: 0, z: 0, yaw: Math.PI }            // nút khác: bỏ qua
  ];
  assert.equal(pickCaptureHeads32(c, heads), 1);
  assert.equal(pickCaptureHeads32(c, [heads[0], heads[3]]), -1, 'không mặt nào nhìn về camera');
  assert.equal(pickCaptureHeads32({ node_id: 'HX-99', x: 0, z: -30 }, heads), -1, 'nút không có đèn');
});

// Cảnh giả: nút HX-06 có 2 nhóm, mỗi nhóm 2 mặt đối nhau; một nút HX-05 gần đó; HUD đếm ngược và quầng.
function signalFrameScene() {
  const obj = () => ({
    visible: true, position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, userData: {}, material: null, children: [],
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  });
  const lamp = (name, emissiveIntensity) => Object.assign(obj(), { userData: { lampName: name }, material: { emissiveIntensity } });
  const halo = () => Object.assign(obj(), { userData: { haloGlow: true }, material: { color: {} } });
  const head = (node_id, x, z, yaw, group, litName) => {
    const h = Object.assign(obj(), { position: { x, y: 5, z }, rotation: { y: yaw }, userData: { signalHead: true, signalNode: node_id, signalGroup: group } });
    const box = obj();
    box.children.push(lamp('green', litName === 'green' ? 1.6 : 0), lamp('yellow', 0), lamp('red', litName === 'red' ? 1.6 : 0), halo());
    h.children.push(box);
    return h;
  };
  const root = obj();
  const facing = head('HX-06', 0, 0, Math.PI, 1, 'red');        // nhìn camera (z âm), nhóm 1, đèn đỏ sáng
  const back = head('HX-06', 0, 0, 0, 1, 'green');              // quay đi, cùng nhóm
  const cross = head('HX-06', 0, 0, 2 * Math.PI / 3, 0, 'green'); // nhóm 0 nhìn lệch: phải bị ẩn
  const other = head('HX-05', 0, 0, Math.PI, 0, 'green');       // nút khác gần đó: phải bị ẩn
  const countdown = Object.assign(obj(), { userData: { countdown: true } });
  root.children.push(facing, back, cross, other, countdown);
  return { root, facing, back, cross, other, countdown };
}

test('renderTo: chỉ đầu đèn được chọn hiện khi render; HUD và quầng ẩn; trạng thái trả lại đúng sau chụp', async () => {
  const sig = signalFrameScene();
  sig.back.visible = false;                 // trạng thái gốc khác nhau để kiểm khôi phục nguyên vẹn
  const seen = [];
  const { env } = frameEnv({ isWebGPUBackend: true }, skyTopFirst(1280, 720));
  env.renderer.render = () => seen.push({
    facing: sig.facing.visible, back: sig.back.visible, cross: sig.cross.visible, other: sig.other.visible,
    countdown: sig.countdown.visible, halo: sig.facing.children[0].children[3].visible
  });
  sig.facing.children[0].children[3].visible = true;   // quầng đang hiện trước khi chụp
  const prevDoc = globalThis.document;
  globalThis.document = env.doc;
  try {
    const capture = createCameraCapture32({ renderer: env.renderer, scene: sig.root, THREE: env.THREE, cameras: [{ camera_id: 'CAM-T', node_id: 'HX-06', x: 0, z: -30, height_m: 7, yaw_deg: 90, pitch_deg: -20, fov_deg: 60, range_m: 60 }] });
    await capture.captureFrame('CAM-T');
    assert.equal(seen.length, 1, 'render được gọi 1 lần');
    assert.deepEqual(seen[0], { facing: true, back: false, cross: false, other: false, countdown: false, halo: false });
    assert.equal(sig.facing.visible, true);
    assert.equal(sig.back.visible, false, 'trạng thái gốc (ẩn) được giữ nguyên sau chụp');
    assert.equal(sig.cross.visible, true, 'sau chụp: đầu đèn hiện lại');
    assert.equal(sig.other.visible, true, 'sau chụp: đầu đèn nút khác hiện lại');
    assert.equal(sig.countdown.visible, true, 'sau chụp: HUD hiện lại');
    assert.equal(sig.facing.children[0].children[3].visible, true, 'sau chụp: quầng hiện lại đúng trạng thái trước chụp');
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
});

test('visibleHeadsOf: báo đúng đầu đèn sẽ hiện trong khung và đèn đang sáng của nó', () => {
  const sig = signalFrameScene();
  const { env } = frameEnv({ isWebGPUBackend: true }, skyTopFirst(1280, 720));
  const capture = createCameraCapture32({ renderer: env.renderer, scene: sig.root, THREE: env.THREE, cameras: [{ camera_id: 'CAM-T', node_id: 'HX-06', x: 0, z: -30, height_m: 7, yaw_deg: 90, pitch_deg: -20, fov_deg: 60, range_m: 60 }] });
  assert.deepEqual(capture.visibleHeadsOf('CAM-T'), [{ node_id: 'HX-06', group: 1, lit: ['red'] }]);
  assert.deepEqual(capture.visibleHeadsOf('CAM-KHONG-CO'), []);
});

test('camera chụp chỉ đọc layer 0 (helper không render vào ảnh)', () => {
  const THREE = {
    PerspectiveCamera: class { constructor() { this.rotation = { order: 'XYZ', x: 0, y: 0 }; this.position = { set() {} }; this.layers = { mask: 0xffff, set(v) { this.mask = 1 << v; } }; } },
    WebGLRenderTarget: class { constructor() { this.textures = [{}]; } dispose() {} }
  };
  const capture = createCameraCapture32({ renderer: { setRenderTarget() {}, render() {} }, scene: { traverse() {} }, THREE, cameras: [cam] });
  assert.equal(capture.rigOf(cam.camera_id).camera.layers.mask, 1, 'chỉ layer 0');
});
