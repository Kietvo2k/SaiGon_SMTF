import { test } from 'node:test';
import assert from 'node:assert/strict';

const context = await import('../scene-context-32.js').catch(() => null);

test('đổi Lite tự động giữ Smart, API, góc Bắc và ánh sáng; bỏ quality/density cũ', () => {
  assert.ok(context, 'Thiếu bộ giữ ngữ cảnh URL của cảnh');
  const query = context.sceneQuery32({ search: '?app=smart&api=http%3A%2F%2Flocalhost%3A8000&view=hx&region=nam&quality=presentation&density=full&backend=webgl', version: '31a', view: 'hx', region: 'nam', mode: 'lite', light: 'night' });
  assert.equal(query.get('app'), 'smart');
  assert.equal(query.get('api'), 'http://localhost:8000');
  assert.equal(query.get('v'), '32a');
  assert.equal(query.get('view'), 'hx');
  assert.equal(query.get('region'), 'bac');
  assert.equal(query.get('backend'), 'webgl');
  assert.equal(query.get('mode'), 'lite');
  assert.equal(query.get('light'), 'night');
  assert.equal(query.has('quality'), false);
  assert.equal(query.has('density'), false);
});

test('chọn góc Bắc giữ API và cấu hình chất lượng khi không đổi mode', () => {
  assert.ok(context, 'Thiếu bộ giữ ngữ cảnh URL của cảnh');
  const query = context.sceneQuery32({ search: '?app=smart&api=%2Fapi%2Fv1&mode=lite&quality=performance&density=light', version: '31a', view: 'csg' });
  assert.equal(query.get('view'), 'csg');
  assert.equal(query.get('api'), '/api/v1');
  assert.equal(query.get('quality'), 'performance');
  assert.equal(query.get('density'), 'light');
  assert.equal(query.get('mode'), 'lite');
  assert.equal(query.get('region'), 'bac');
  assert.equal(query.getAll('region').length, 1);
});

test('góc trung tâm hoặc góc không hợp lệ trong Smart quay về toàn khu Bắc', () => {
  assert.ok(context, 'Thiếu bộ giữ ngữ cảnh URL của cảnh');
  for (const view of ['materials', 'overview', 'toString', '', null]) {
    assert.equal(context.sceneView32(view, true), 'bac');
  }
  for (const view of ['hx', 'l81', 'csg', 'ctn', 'bac']) assert.equal(context.sceneView32(view, true), view);
});

test('classic vẫn giữ góc và khu hiện tại khi chuyển mode', () => {
  assert.ok(context, 'Thiếu bộ giữ ngữ cảnh URL của cảnh');
  const query = context.sceneQuery32({ search: '?view=bason&region=ven-song&quality=presentation', version: '31a', view: 'bason', region: 'ven-song', mode: 'lite', light: 'golden' });
  assert.equal(query.get('v'), '31a');
  assert.equal(query.get('view'), 'bason');
  assert.equal(query.get('region'), 'ven-song');
  assert.equal(query.has('app'), false);
  assert.equal(context.sceneView32('unknown', false), 'overview');
});
