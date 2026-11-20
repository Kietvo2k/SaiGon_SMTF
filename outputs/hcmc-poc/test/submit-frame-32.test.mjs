// submit-frame-32.test.mjs — logic thuần của vòng đẩy khung /api/demo/frame (demo-v2).
// Chạy được trong Node: không cần WebGL; fetchImpl/channelImpl/capture giả lập.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameIdOf32, pickEncodeStep32, nextEncodeStep32, shouldBackoff32, encodeFrameBlob32,
  installSubmitFrame32, SUBMIT_FRAME_MAX_BYTES_32, SUBMIT_FRAME_GAP_MS_32
} from '../submit-frame-32.js?v=32c';

test('frameIdOf32: đúng hợp đồng [A-Za-z0-9_-]{1,80}, không prefix sample-', () => {
  assert.equal(frameIdOf32('CAM-BAC-002', 7), 'live-CAM-BAC-002-7');
  assert.match(frameIdOf32('CAM-HX-001', 0), /^live-[A-Za-z0-9_-]+$/);
  assert.ok(!frameIdOf32('CAM-BAC-002', 123456).startsWith('sample-'));
  // camera lạ vẫn làm sạch ký tự, không ném ra ngoài hợp đồng
  assert.equal(frameIdOf32('CAM/BAC 002', 1), 'live-CAMBAC002-1');
  // chuỗi dài vượt hợp đồng 80 ký tự → từ chối, không gửi frameId rác
  assert.throws(() => frameIdOf32('C'.repeat(70), 12345678901234567890), RangeError);
});

test('pickEncodeStep32: bậc đầu khi chưa thử; giữ bậc khi đạt hạn mức; hạ bậc khi vượt; cạn → null', () => {
  const steps = [
    { quality: 0.8, width: 1280 },
    { quality: 0.6, width: 1280 },
    { quality: 0.45, width: 960 }
  ];
  assert.deepEqual(pickEncodeStep32(null, null, 256 * 1024, steps), { index: 0, step: steps[0] });
  // bậc 0 đã đạt 100 KiB ≤ 256 KiB → giữ bậc 0
  assert.deepEqual(pickEncodeStep32(100 * 1024, 0, 256 * 1024, steps), { index: 0, step: steps[0] });
  // bậc 0 vượt 300 KiB → hạ bậc 1
  assert.deepEqual(pickEncodeStep32(300 * 1024, 0, 256 * 1024, steps), { index: 1, step: steps[1] });
  // bậc cuối vẫn vượt → cạn
  assert.deepEqual(pickEncodeStep32(300 * 1024, 2, 256 * 1024, steps), { index: -1, step: null });
  assert.equal(nextEncodeStep32(3, steps), null);
  assert.equal(nextEncodeStep32(0, steps), steps[0]);
});

test('shouldBackoff32: chỉ 409/429/503 chờ thêm một gap', () => {
  assert.equal(shouldBackoff32(429), true);
  assert.equal(shouldBackoff32(503), true);
  assert.equal(shouldBackoff32(409), true);
  assert.equal(shouldBackoff32(401), false);
  assert.equal(shouldBackoff32(404), false);
  assert.equal(shouldBackoff32(200), false);
});

test('encodeFrameBlob32: đạt ngay bậc đầu thì không hạ bậc; cạn bậc thì trả null', async () => {
  const canvas = { width: 1280, height: 720 };
  const ok = await encodeFrameBlob32(canvas, SUBMIT_FRAME_MAX_BYTES_32, async () => ({ size: 90 * 1024 }));
  assert.equal(ok.bytes, 90 * 1024);
  assert.equal(ok.step, 0);

  // Mọi bậc đều vượt (kể cả sau thu nhỏ) → null, không vòng lặp vô hạn.
  const tooBig = await encodeFrameBlob32(canvas, SUBMIT_FRAME_MAX_BYTES_32, async () => ({ size: 900 * 1024 }));
  assert.equal(tooBig, null);
});

test('installSubmitFrame32: session trước, POST frame đúng camera + Content-Type + blob, không vượt nhịp 3 s', async () => {
  const calls = [];
  const blob = { size: 80 * 1024 };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200 };
  };
  const capture = { latestFrame: () => ({ canvas: { width: 1280, height: 720 }, seq: 5 }) };
  let clock = 0;
  const loop = installSubmitFrame32({
    app: {}, capture,
    cameras: [{ camera_id: 'CAM-BAC-002' }, { camera_id: 'CAM-HX-001' }],
    fetchImpl,
    channelImpl: null, doc: { hidden: false },
    gapMs: SUBMIT_FRAME_GAP_MS_32,
    encodeImpl: async () => blob,
    now: () => clock, log: () => {}
  });
  try {
    await loop.start();
    // start gọi ensureSession → 1 POST session; tick đầu đẩy frame (await trong start).
    const sessionCall = calls.find(c => c.url === '/api/demo/session');
    assert.ok(sessionCall, 'có POST /api/demo/session trước khi đẩy khung');
    assert.equal(sessionCall.init.method, 'POST');
    assert.equal(sessionCall.init.credentials, 'include');

    const frames = calls.filter(c => c.url.startsWith('/api/demo/frame'));
    assert.ok(frames.length >= 1, 'tick đầu đã đẩy 1 khung');
    const first = frames[0];
    assert.match(first.url, /cameraId=CAM-BAC-002&frameId=live-CAM-BAC-002-5/);
    assert.equal(first.init.headers['Content-Type'], 'image/jpeg');
    assert.equal(first.init.body, blob);
    const st1 = loop.status();
    assert.ok(st1.sessionReady);
    assert.equal(st1.cameraId, 'CAM-BAC-002');
    assert.ok(st1.sent >= 1);
  } finally {
    loop.stop();
  }
});

test('installSubmitFrame32: đổi camera theo selectCamera và từ chối camera ngoài danh mục', () => {
  const capture = { latestFrame: () => ({ canvas: { width: 1280, height: 720 }, seq: 1 }) };
  const loop = installSubmitFrame32({
    app: {}, capture, cameras: [{ camera_id: 'CAM-BAC-001' }, { camera_id: 'CAM-BAC-002' }],
    fetchImpl: async () => ({ ok: true }), now: () => 0, log: () => {}
  });
  assert.equal(loop.selectCamera('CAM-HX-999'), 'CAM-BAC-001'); // ngoài danh mục → giữ nguyên
  assert.equal(loop.selectCamera('CAM-BAC-002'), 'CAM-BAC-002');
  loop.stop();
});
