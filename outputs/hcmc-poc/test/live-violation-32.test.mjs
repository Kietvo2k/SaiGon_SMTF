// Kiểm sender vi phạm 3D → /api/demo/violation (không gọi mạng thật).
// Chạy: node --test outputs/hcmc-poc/test/live-violation-32.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLiveViolationSaver32, liveViolationPayload32, pickLiveImage32,
  LIVE_SAVE_GAP_MS_32, LIVE_SAVE_MAX_32,
} from '../live-violation-32.js';

const CAMERAS = [{ camera_id: 'CAM-BAC-002', junction_id: 'Bac-02' }];
const REC = {
  plate: '51K-888.88', violation_code: 'RED-LIGHT', violation_label: 'Vượt đèn đỏ',
  camera_id: 'CAM-BAC-002', node_id: 'Bac-02', node_label: 'Ung Văn Khiêm ↔ Nguyễn Gia Trưng',
  vehicle_class: 'car', confidence: 0.91, signal: { speed_kmh: 42.4 },
  sim: { station_time: '2026-11-21T08:00:00.000Z' },
};

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});

test('payload: biển, mã, thời điểm, camera/junction và trường tuỳ chọn', () => {
  const payload = liveViolationPayload32(REC, CAMERAS[0]);
  assert.deepEqual(payload, {
    plate: '51K-888.88', code: 'RED-LIGHT', occurredAt: '2026-11-21T08:00:00.000Z',
    cameraId: 'CAM-BAC-002', junctionId: 'Bac-02', direction: 'Ung Văn Khiêm ↔ Nguyễn Gia Trưng',
    vehicleClass: 'car', speed: 42.4, confidence: 0.91,
  });
});

test('payload: thiếu biển hoặc mã → null (bỏ qua, không gửi)', () => {
  assert.equal(liveViolationPayload32({ ...REC, plate: '' }), null);
  assert.equal(liveViolationPayload32({ ...REC, violation_code: '' }), null);
  assert.equal(liveViolationPayload32(null), null);
});

test('payload: thời điểm hỏng dùng giờ hiện tại; xe bus/truck không lọt vào vehicle_class', () => {
  const now = () => new Date('2026-11-21T09:00:00.000Z');
  const payload = liveViolationPayload32({ ...REC, sim: { station_time: 'hỏng' }, vehicle_class: 'bus' }, null, now);
  assert.equal(payload.occurredAt, '2026-11-21T09:00:00.000Z');
  assert.equal(payload.vehicleClass, null);
  assert.equal(payload.junctionId, 'Bac-02');
});

test('ảnh: ưu tiên after, bỏ ảnh quá hạn mức, không có thì null', () => {
  assert.equal(pickLiveImage32([{ kind: 'plate_crop', dataUrl: 'data:image/jpeg;base64,AA' }]), 'data:image/jpeg;base64,AA');
  assert.equal(pickLiveImage32([
    { kind: 'plate_crop', dataUrl: 'data:image/jpeg;base64,BB' },
    { kind: 'after', dataUrl: 'data:image/jpeg;base64,CC' },
  ]), 'data:image/jpeg;base64,CC');
  assert.equal(pickLiveImage32([{ kind: 'after', dataUrl: 'x'.repeat(300_000) }]), null);
  assert.equal(pickLiveImage32([]), null);
});

function harness(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { calls, fetchImpl };
}

test('saver: tạo phiên rồi gửi đúng payload; giãn nhịp 10 s', async () => {
  const { calls, fetchImpl } = harness(url => jsonResponse(url.endsWith('/session') ? { ok: true } : { ok: true }));
  let clock = 1_000_000;
  const saver = createLiveViolationSaver32({ fetchImpl, cameras: CAMERAS, now: () => clock });

  assert.equal(await saver.submit(REC, []), 'saved');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/demo/session');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].url, '/api/demo/violation');
  assert.equal(calls[1].init.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[1].init.body), liveViolationPayload32(REC, CAMERAS[0]));

  clock += LIVE_SAVE_GAP_MS_32 - 1;
  assert.equal(await saver.submit(REC, []), 'throttled');
  assert.equal(calls.length, 2, 'chưa đủ 10 s thì không gọi thêm');

  clock += 1;
  assert.equal(await saver.submit(REC, []), 'saved');
  assert.equal(calls.length, 3);
});

test('saver: cap 50 bản ghi/phiên', async () => {
  const { fetchImpl } = harness(url => jsonResponse({ ok: true }));
  let clock = 0;
  const saver = createLiveViolationSaver32({ fetchImpl, now: () => clock, cap: 2 });
  assert.equal(await saver.submit(REC), 'saved');
  clock += LIVE_SAVE_GAP_MS_32;
  assert.equal(await saver.submit(REC), 'saved');
  clock += LIVE_SAVE_GAP_MS_32;
  assert.equal(await saver.submit(REC), 'capped');
  assert.equal(saver.status().count, 2);
});

test('saver: 401 ở /violation → lần sau tạo lại phiên; lỗi mạng không ném', async () => {
  let sessionCalls = 0;
  const { calls, fetchImpl } = harness((url) => {
    if (url.endsWith('/session')) { sessionCalls++; return jsonResponse({ ok: true }); }
    return jsonResponse({ error: { code: 'SESSION_REQUIRED' } }, 401);
  });
  let clock = 0;
  const saver = createLiveViolationSaver32({ fetchImpl, now: () => clock });
  assert.equal(await saver.submit(REC), 'no-session');
  clock += LIVE_SAVE_GAP_MS_32;
  assert.equal(await saver.submit(REC), 'no-session');
  assert.equal(sessionCalls, 2, 'mất phiên thì lần gửi sau tạo phiên mới');
  assert.equal(calls.filter(call => call.url.endsWith('/violation')).length, 2);

  const broken = createLiveViolationSaver32({ fetchImpl: async () => { throw new Error('offline'); }, now: () => 0 });
  assert.equal(await broken.submit(REC), 'error');
});

test('saver: thiếu fetch/biển thì trả trạng thái, không ném', async () => {
  const noFetch = createLiveViolationSaver32({ fetchImpl: null });
  assert.equal(await noFetch.submit(REC), 'busy');
  const { fetchImpl } = harness(() => jsonResponse({ ok: true }));
  const saver = createLiveViolationSaver32({ fetchImpl });
  assert.equal(await saver.submit({ ...REC, plate: '' }), 'skipped');
});

test('hằng số hợp đồng giữ đúng giá trị đã ghi trong báo cáo', () => {
  assert.equal(LIVE_SAVE_GAP_MS_32, 10_000);
  assert.equal(LIVE_SAVE_MAX_32, 50);
});
