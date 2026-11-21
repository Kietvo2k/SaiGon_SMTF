// Kiểm POST /api/demo/violation: validation, rate limit, dedup, fallback và union đọc.
// Không gọi Supabase thật — global fetch được thay bằng mock theo bảng/đường dẫn.
// Chạy: node --test scripts/api-demo/live-violation.test.mjs
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

process.env.SUPABASE_URL = 'https://mock.supabase.test';
process.env.SUPABASE_SECRET_KEY = 'test-service-key';
process.env.DEMO_SESSION_SECRET = 's'.repeat(32);

const apiUrl = pathToFileURL(join(import.meta.dirname, '..', '..', 'api', 'demo', '[route].mjs')).href;
const api = await import(apiUrl);
const handler = api.default.fetch;
const LIVE_ID = '11111111-1111-4111-8111-111111111111';

const occurrence = () => new Date(Date.now() - 60_000).toISOString();
const payload = (extra = {}) => ({
  plate: '51K-888.88', code: 'RED-LIGHT', occurredAt: occurrence(),
  cameraId: 'CAM-BAC-002', junctionId: 'Bac-02', direction: 'Ung Văn Khiêm → Nguyễn Gia Trưng',
  vehicleClass: 'car', speed: 42.4, confidence: 0.91, ...extra,
});

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});

function installSupabase(options = {}) {
  const calls = [];
  const original = globalThis.fetch;
  const state = {
    liveTable: options.liveTable ?? 'ok',
    liveRows: options.liveRows ?? [],
    liveDuplicate: options.liveDuplicate ?? false,
    seedRows: options.seedRows ?? [],
    seedConflict: options.seedConflict ?? false,
    uploadOk: options.uploadOk ?? true,
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    calls.push({ url, path: url.pathname, method, headers, body: init.body });

    if (url.pathname === '/rest/v1/smtf_submit_live_violations') {
      if (state.liveTable === 'missing') return json({ code: '42P01' }, 404);
      if (method === 'POST') {
        return state.liveDuplicate ? json([], 201) : json([{ id: LIVE_ID }], 201);
      }
      if (method === 'PATCH') return new Response(null, { status: 204 });
      return json(state.liveRows);
    }
    if (url.pathname === '/rest/v1/smtf_submit_records') {
      if (method === 'POST') return state.seedConflict ? json({}, 409) : new Response(null, { status: 201 });
      return json(state.seedRows);
    }
    if (url.pathname === '/rest/v1/smtf_submit_kpi') {
      return json([{ source: 'sample', wait_avg_s: 18, queue_max: 9, flow_per_node_min: 24 }]);
    }
    if (url.pathname === '/rest/v1/smtf_submit_cameras') {
      return json([{ camera_id: 'CAM-BAC-002', junction_id: 'Bac-02', label: 'Ung Văn Khiêm' }]);
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      return state.uploadOk ? new Response(null, { status: 200 }) : new Response(null, { status: 500 });
    }
    if (url.pathname === '/rest/v1/smtf_submit_evidence') return json([]);
    return json([]);
  };
  return { calls, state, restore: () => { globalThis.fetch = original; } };
}

async function withMock(options, run) {
  const mock = installSupabase(options);
  try { return await run(mock); } finally { mock.restore(); }
}

async function newSession() {
  const response = await handler(new Request('https://demo.test/api/demo/session', { method: 'POST' }));
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

function postViolation(cookie, body) {
  return handler(new Request('https://demo.test/api/demo/violation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://demo.test' },
    body: JSON.stringify(body),
  }));
}

function call(method, path, cookie = null) {
  const headers = cookie ? { Cookie: cookie } : {};
  return handler(new Request(`https://demo.test${path}`, { method, headers }));
}

const expectApiError = async (response, status, code) => {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.ok(body.error.message.length > 0);
  return body;
};

/* ---------------------------------- pure ---------------------------------- */

test('validate: payload hợp lệ → biển chuẩn hoá, nhãn tiếng Việt, status theo confidence', () => {
  const valid = api.validateLiveViolation(payload({ plate: '51k88888' }));
  assert.equal(valid.plate, '51K-888.88');
  assert.equal(valid.code, 'RED-LIGHT');
  assert.equal(valid.label, 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông');
  assert.equal(valid.status, 'new');
  assert.equal(new Date(valid.occurredAt).toISOString(), valid.occurredAt);
});

test('validate: confidence thấp → needs_review; bus/truck → vehicleClass null', () => {
  assert.equal(api.validateLiveViolation(payload({ confidence: 0.5 })).status, 'needs_review');
  assert.equal(api.validateLiveViolation(payload({ confidence: null })).status, 'needs_review');
  assert.equal(api.validateLiveViolation(payload({ vehicleClass: 'bus' })).vehicleClass, null);
});

test('validate: từ chối biển, mã, thời điểm, camera, tốc độ, độ tin cậy sai', () => {
  for (const [input, code] of [
    [payload({ plate: 'ABCD' }), 'INVALID_PLATE'],
    [payload({ code: 'BOGUS' }), 'INVALID_CODE'],
    [payload({ occurredAt: 'hôm qua' }), 'INVALID_TIME'],
    [payload({ occurredAt: '2199-01-01T00:00:00.000Z' }), 'INVALID_TIME'],
    [payload({ cameraId: 'CAM-XX-1' }), 'INVALID_CAMERA'],
    [payload({ speed: 999 }), 'INVALID_SPEED'],
    [payload({ confidence: 1.5 }), 'INVALID_CONFIDENCE'],
  ]) {
    assert.throws(() => api.validateLiveViolation(input), error => error.code === code, code);
  }
});

test('gate: 1 lần/400 ms/phiên và cap 500', () => {
  const store = new Map();
  assert.equal(api.liveViolationGate(store, 'a', 0), 'ok');
  assert.equal(api.liveViolationGate(store, 'a', 399), 'rate');
  assert.equal(api.liveViolationGate(store, 'a', 400), 'ok');
  assert.equal(api.liveViolationGate(store, 'b', 400), 'ok', 'phiên khác không bị chặn');

  const quota = new Map();
  for (let i = 0; i < 500; i++) assert.equal(api.liveViolationGate(quota, 's', i * 400), 'ok');
  assert.equal(api.liveViolationGate(quota, 's', 500 * 400), 'quota');
});

test('ảnh: không có → null; JPEG nhỏ hợp lệ; sai magic/quá lớn bị chặn', () => {
  const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  assert.equal(api.parseLiveImage(null), null);
  assert.ok(Buffer.isBuffer(api.parseLiveImage(`data:image/jpeg;base64,${tiny}`)));
  assert.throws(() => api.parseLiveImage('data:image/png;base64,AAAA'), error => error.code === 'INVALID_IMAGE');
  assert.throws(() => api.parseLiveImage(`data:image/jpeg;base64,${Buffer.from('nope').toString('base64')}`),
    error => error.code === 'INVALID_IMAGE');
  assert.throws(() => api.parseLiveImage(`data:image/jpeg;base64,${'A'.repeat(400_000)}`),
    error => error.code === 'IMAGE_TOO_LARGE');
});

/* --------------------------------- endpoint -------------------------------- */

test('endpoint: thiếu phiên → 401; biển sai → 400', async () => {
  await withMock({}, async () => {
    await expectApiError(await postViolation('', payload()), 401, 'SESSION_REQUIRED');
    const cookie = await newSession();
    await expectApiError(await postViolation(cookie, payload({ plate: 'SAI' })), 400, 'INVALID_PLATE');
  });
});

test('endpoint: lưu bảng live + dedup theo (plate, code, occurredAt)', async () => {
  await withMock({}, async (mock) => {
    const cookie = await newSession();
    const response = await postViolation(cookie, payload());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, mode: 'live', id: LIVE_ID });

    const insert = mock.calls.find(item => item.path === '/rest/v1/smtf_submit_live_violations' && item.method === 'POST');
    assert.ok(insert, 'có POST vào bảng live');
    assert.match(insert.url.search, /on_conflict=plate%2Cviolation_code%2Coccurred_at|on_conflict=plate,violation_code,occurred_at/);
    assert.match(insert.headers.get('prefer'), /ignore-duplicates/);
    const row = JSON.parse(insert.body);
    assert.equal(row.plate, '51K-888.88');
    assert.equal(row.violation_code, 'RED-LIGHT');
    assert.equal(row.status, 'new');
    assert.equal(row.speed_kmh, 42.4);
    assert.equal(row.session_id.length, 36);

    const blocked = await postViolation(cookie, payload({ code: 'SPEED' }));
    await expectApiError(blocked, 429, 'RATE_LIMIT');
    assert.equal(blocked.headers.get('retry-after'), '1');
  });
});

test('endpoint: bản ghi trùng (unique) → 200 duplicate, không lỗi', async () => {
  await withMock({ liveDuplicate: true }, async () => {
    const cookie = await newSession();
    const response = await postViolation(cookie, payload());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, mode: 'live', duplicate: true });
  });
});

test('endpoint: biển đã có hồ sơ seed → bỏ qua, không ghi live', async () => {
  await withMock({ seedRows: [{ plate: '51K-888.88' }] }, async (mock) => {
    const cookie = await newSession();
    const response = await postViolation(cookie, payload());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, mode: 'seed', skipped: true });
    assert.equal(mock.calls.filter(item => item.path === '/rest/v1/smtf_submit_live_violations' && item.method === 'POST').length, 0);
  });
});

test('endpoint: ảnh hợp lệ → upload 1 ảnh rồi PATCH evidence_path', async () => {
  await withMock({}, async (mock) => {
    const cookie = await newSession();
    const image = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
    const response = await postViolation(cookie, payload({ image }));
    assert.equal(response.status, 200);
    const upload = mock.calls.find(item => item.path.startsWith('/storage/v1/object/') && item.method === 'POST');
    assert.ok(upload, 'có upload ảnh');
    assert.equal(upload.path, `/storage/v1/object/smtf-submit-20261120/live/${LIVE_ID}.jpg`);
    const patch = mock.calls.find(item => item.path === '/rest/v1/smtf_submit_live_violations' && item.method === 'PATCH');
    assert.ok(patch);
    assert.equal(JSON.parse(patch.body).evidence_path, `live/${LIVE_ID}.jpg`);
  });
});

test('endpoint: ảnh lỗi server → hồ sơ vẫn lưu (không 5xx)', async () => {
  await withMock({ uploadOk: false }, async () => {
    const cookie = await newSession();
    const image = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
    const response = await postViolation(cookie, payload({ image }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, 'live');
  });
});

test('fallback: bảng live chưa migrate → ghi smtf_submit_records khi biển chưa có', async () => {
  await withMock({ liveTable: 'missing', seedRows: [] }, async (mock) => {
    const cookie = await newSession();
    const response = await postViolation(cookie, payload());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, mode: 'record' });
    const insert = mock.calls.find(item => item.path === '/rest/v1/smtf_submit_records' && item.method === 'POST');
    assert.ok(insert);
    const row = JSON.parse(insert.body);
    assert.equal(row.plate, '51K-888.88');
    assert.equal(row.summary, 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông');
    assert.equal(row.violation_code, 'RED-LIGHT');
    assert.equal(row.status, 'new');
    assert.equal(row.junction_id, 'Bac-02');
  });
});

test('fallback: biển đã có hồ sơ seed → 409 PLATE_EXISTS, không ghi đè', async () => {
  // Mô phỏng đua: bước kiểm tra chưa thấy biển nhưng INSERT bị unique của bảng records chặn.
  await withMock({ liveTable: 'missing', seedRows: [], seedConflict: true }, async (mock) => {
    const cookie = await newSession();
    await expectApiError(await postViolation(cookie, payload()), 409, 'PLATE_EXISTS');
    assert.equal(mock.calls.filter(item => item.path === '/rest/v1/smtf_submit_records' && item.method === 'POST').length, 1);
  });
});

test('union: lookup thấy vi phạm live khi biển chưa có trong seed', async () => {
  await withMock({
    seedRows: [],
    liveRows: [{
      plate: '51K-888.88', violation_code: 'SPEED', occurred_at: occurrence(), status: 'new',
      camera_id: 'CAM-BAC-002', junction_id: 'Bac-02', direction: 'Bắc → Nam',
      vehicle_class: 'car', evidence_path: null,
    }],
  }, async () => {
    const response = await call('GET', '/api/demo/lookup?plate=51K-888.88');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].code, 'SPEED');
    assert.equal(body.records[0].violationLabel, 'Chạy quá tốc độ quy định');
    assert.equal(body.records[0].cameraId, 'CAM-BAC-002');
  });
});

test('union: seed thắng khi cùng biển; officer gộp live không trùng biển', async () => {
  const live = {
    plate: '51K-888.88', violation_code: 'SPEED', occurred_at: occurrence(), status: 'new',
    camera_id: 'CAM-BAC-002', junction_id: 'Bac-02', direction: null, vehicle_class: 'car', evidence_path: null,
  };
  await withMock({
    seedRows: [{ plate: '51K-123.45', summary: 'Mẫu', status: 'confirmed', violation_code: 'RED-LIGHT' }],
    liveRows: [{ ...live, plate: '51K-123.45' }, { ...live, plate: '59-X9 999.99' }],
  }, async () => {
    const cookie = await newSession();
    const lookup = await (await call('GET', '/api/demo/lookup?plate=51K-123.45', cookie)).json();
    assert.equal(lookup.records.length, 1);
    assert.equal(lookup.records[0].code, 'RED-LIGHT');

    const officer = await (await call('GET', '/api/demo/officer', cookie)).json();
    const plates = officer.records.map(record => record.plate);
    assert.deepEqual(plates.sort(), ['51K-123.45', '59-X9 999.99'].sort());
    assert.equal(officer.records.find(record => record.plate === '51K-123.45').code, 'RED-LIGHT');
    assert.equal(officer.records.find(record => record.plate === '59-X9 999.99').code, 'SPEED');
  });
});

test('union: record/timeline của biển live trả hồ sơ + ảnh hoặc "chưa có ảnh"', async () => {
  const baseRow = {
    plate: '51K-888.88', violation_code: 'PARK', occurred_at: occurrence(), status: 'needs_review',
    camera_id: 'CAM-BAC-002', junction_id: 'Bac-02', direction: 'Lề đường', vehicle_class: 'motorbike',
    evidence_path: null,
  };
  await withMock({ seedRows: [], liveRows: [baseRow] }, async () => {
    const detail = await (await call('GET', '/api/demo/record?plate=51K-888.88')).json();
    assert.equal(detail.code, 'PARK');
    assert.deepEqual(detail.evidence, [], 'không có ảnh → mảng rỗng, drawer hiện "chưa có ảnh"');
    const timeline = await call('GET', '/api/demo/timeline?plate=51K-888.88');
    assert.equal(timeline.status, 200);
    assert.equal((await timeline.json()).occurredAt, baseRow.occurred_at);
  });

  await withMock({ seedRows: [], liveRows: [{ ...baseRow, evidence_path: 'live/x.jpg' }] }, async () => {
    const detail = await (await call('GET', '/api/demo/record?plate=51K-888.88')).json();
    assert.equal(detail.evidence.length, 1);
    assert.equal(detail.evidence[0].kind, 'after');
    assert.match(detail.evidence[0].url, /kind=live/);
  });
});

test('union: biển live chỉ tra cứu — khiếu nại/duyệt trả 409 rõ nghĩa, không 404', async () => {
  const baseRow = {
    plate: '51K-888.88', violation_code: 'PARK', occurred_at: occurrence(), status: 'needs_review',
    camera_id: 'CAM-BAC-002', junction_id: 'Bac-02', direction: null, vehicle_class: 'car', evidence_path: null,
  };
  await withMock({ seedRows: [], liveRows: [baseRow] }, async () => {
    const cookie = await newSession();
    const complaint = await handler(new Request('https://demo.test/api/demo/complaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ plate: '51K-888.88', kind: 'other', note: 'Kiểm tra lại giúp tôi' }),
    }));
    await expectApiError(complaint, 409, 'STATE_CONFLICT');

    const decision = await handler(new Request('https://demo.test/api/demo/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ plate: '51K-888.88', action: 'confirm' }),
    }));
    await expectApiError(decision, 409, 'STATE_CONFLICT');
  });
});
