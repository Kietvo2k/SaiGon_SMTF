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
  camera_id: 'CAM-BAC-002', node_id: 'Bac-02', node_label: 'Ung Văn Khiêm → Nguyễn Gia Trí',
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
    cameraId: 'CAM-BAC-002', junctionId: 'Bac-02', direction: 'Ung Văn Khiêm → Nguyễn Gia Trí',
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

test('saver: tạo phiên rồi gửi đúng payload; mọi vi phạm sát nhau đều được xếp hàng', async () => {
  const { calls, fetchImpl } = harness(url => jsonResponse(url.endsWith('/session') ? { ok: true } : { ok: true }));
  let clock = 1_000_000;
  const saver = createLiveViolationSaver32({
    fetchImpl, cameras: CAMERAS, now: () => clock,
    sleep: async ms => { clock += ms; },
  });

  const first = saver.submit(REC, []);
  const second = saver.submit({ ...REC, plate: '51K-999.99' }, []);
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1, 'saved');
  assert.equal(r2, 'queued');
  assert.equal(saver.status().count, 2);
  assert.equal(saver.status().queued, 0);
  assert.equal(calls.length, 3, '1 session + 2 violation');
  assert.equal(calls[0].url, '/api/demo/session');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].url, '/api/demo/violation');
  assert.equal(calls[1].init.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[1].init.body), liveViolationPayload32(REC, CAMERAS[0]));
  assert.equal(JSON.parse(calls[2].init.body).plate, '51K-999.99');
});

test('saver: cap 2 bản ghi/phiên', async () => {
  const { fetchImpl } = harness(() => jsonResponse({ ok: true }));
  let clock = 0;
  const saver = createLiveViolationSaver32({
    fetchImpl, now: () => clock, cap: 2, sleep: async ms => { clock += ms; },
  });
  assert.equal(await saver.submit(REC), 'saved');
  assert.equal(await saver.submit({ ...REC, plate: '51K-777.77' }), 'saved');
  assert.equal(await saver.submit({ ...REC, plate: '51K-666.66' }), 'capped');
  assert.equal(saver.status().count, 2);
});

test('saver: 401 tự tạo lại phiên; lỗi mạng không ném', async () => {
  let sessionCalls = 0;
  const { calls, fetchImpl } = harness((url) => {
    if (url.endsWith('/session')) { sessionCalls++; return jsonResponse({ ok: true }); }
    return jsonResponse({ error: { code: 'SESSION_REQUIRED' } }, 401);
  });
  let clock = 0;
  const saver = createLiveViolationSaver32({
    fetchImpl, now: () => clock, sleep: async ms => { clock += ms; },
  });
  assert.equal(await saver.submit(REC), 'no-session');
  assert.ok(sessionCalls >= 2, 'phải tạo lại phiên sau 401');

  const broken = createLiveViolationSaver32({
    fetchImpl: async () => { throw new Error('offline'); }, now: () => 0, sleep: async () => {},
  });
  assert.equal(await broken.submit(REC), 'error');
});

test('saver: thiếu fetch/biển trả trạng thái, không ném', async () => {
  const noFetch = createLiveViolationSaver32({ fetchImpl: null });
  assert.equal(await noFetch.submit(REC), 'busy');
  const { fetchImpl } = harness(() => jsonResponse({ ok: true }));
  const saver = createLiveViolationSaver32({ fetchImpl });
  assert.equal(await saver.submit({ ...REC, plate: '' }), 'skipped');
});

test('hằng số hợp đồng giữ đúng giá trị đã ghi trong báo cáo', () => {
  assert.equal(LIVE_SAVE_GAP_MS_32, 400);
  assert.equal(LIVE_SAVE_MAX_32, 500);
});
