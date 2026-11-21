// Kiểm hàm thuần của POST /api/demo/complaint — không gọi Supabase.
// Chạy: node --test scripts/api-demo/complaint-validation.test.mjs
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const apiUrl = pathToFileURL(join(import.meta.dirname, '..', '..', 'api', 'demo', '[route].mjs')).href;
const { validateComplaintInput, validateComplaintKind } = await import(apiUrl);

function expectError(fn, status, code) {
  assert.throws(fn, error => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0, 'thông điệp lỗi phải có nội dung');
    return true;
  });
}

test('note rỗng bị từ chối 400 NOTE_REQUIRED', () => {
  expectError(() => validateComplaintInput('confirmed', ''), 400, 'NOTE_REQUIRED');
});

test('note toàn khoảng trắng/xuống dòng bị từ chối 400 NOTE_REQUIRED', () => {
  expectError(() => validateComplaintInput('confirmed', '   \n\t  '), 400, 'NOTE_REQUIRED');
});

test('note null bị từ chối 400 NOTE_REQUIRED', () => {
  expectError(() => validateComplaintInput('confirmed', null), 400, 'NOTE_REQUIRED');
});

test('note undefined bị từ chối 400 NOTE_REQUIRED', () => {
  expectError(() => validateComplaintInput('confirmed', undefined), 400, 'NOTE_REQUIRED');
});

test('note không phải chuỗi bị từ chối 400 NOTE_REQUIRED', () => {
  expectError(() => validateComplaintInput('confirmed', 123), 400, 'NOTE_REQUIRED');
});

test('note 1 ký tự hợp lệ', () => {
  assert.equal(validateComplaintInput('confirmed', 'a'), 'a');
});

test('note 500 ký tự hợp lệ và giữ nguyên', () => {
  const note = 'a'.repeat(500);
  assert.equal(validateComplaintInput('confirmed', note), note);
});

test('note 501 ký tự bị cắt còn 500 (nhất quán với UI maxLength)', () => {
  const result = validateComplaintInput('confirmed', 'a'.repeat(501));
  assert.equal(result.length, 500);
  assert.equal(result, 'a'.repeat(500));
});

test('note được trim trước khi cắt 500', () => {
  assert.equal(validateComplaintInput('confirmed', '  ghi chú  '), 'ghi chú');
});

test('hồ sơ dismissed bị từ chối 409 STATE_CONFLICT', () => {
  assert.throws(() => validateComplaintInput('dismissed', 'lý do hợp lệ'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STATE_CONFLICT');
    assert.match(error.message, /kết thúc/);
    return true;
  });
});

test('hồ sơ paid bị từ chối 409 STATE_CONFLICT', () => {
  assert.throws(() => validateComplaintInput('paid', 'lý do hợp lệ'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STATE_CONFLICT');
    assert.match(error.message, /kết thúc/);
    return true;
  });
});

test('hồ sơ disputed bị từ chối 409 STATE_CONFLICT', () => {
  assert.throws(() => validateComplaintInput('disputed', 'lý do hợp lệ'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STATE_CONFLICT');
    assert.match(error.message, /đang chờ xử lý/);
    return true;
  });
});

test('trạng thái lạ bị từ chối 409 STATE_CONFLICT', () => {
  expectError(() => validateComplaintInput('unknown', 'lý do hợp lệ'), 409, 'STATE_CONFLICT');
});

test('note rỗng được báo 400 trước cả khi trạng thái đã đóng', () => {
  expectError(() => validateComplaintInput('dismissed', '   '), 400, 'NOTE_REQUIRED');
});

for (const status of ['new', 'pending', 'needs_review', 'confirmed', 'notified']) {
  test(`hồ sơ ${status} còn mở nhận khiếu nại`, () => {
    assert.equal(validateComplaintInput(status, 'lý do hợp lệ'), 'lý do hợp lệ');
  });
}

for (const kind of ['priority_yield', 'wrong_plate', 'other']) {
  test(`kind ${kind} hợp lệ`, () => {
    assert.doesNotThrow(() => validateComplaintKind(kind));
  });
}

test('kind ngoài whitelist bị từ chối 400 INVALID_INPUT', () => {
  expectError(() => validateComplaintKind('bogus'), 400, 'INVALID_INPUT');
  expectError(() => validateComplaintKind(''), 400, 'INVALID_INPUT');
  expectError(() => validateComplaintKind(undefined), 400, 'INVALID_INPUT');
});
