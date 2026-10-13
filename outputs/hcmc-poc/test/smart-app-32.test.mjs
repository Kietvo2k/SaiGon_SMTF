import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BANNED_STRINGS, SMART_LABELS_32, sanitizeStatusText32, applySmartLabels32, lockRegions32, SMART_APP_32_VERSION } from '../smart-app-32.js?v=32a';

const fakeDom = () => {
  const mk = text => ({ textContent: text, setAttribute(k, v) { this[k] = v; }, disabled: false, hidden: false });
  const regionTitle = mk('Khu mô phỏng');
  const floodSpan = mk('Chạy mô phỏng 1D/2D');
  const floodStateSpan = mk('Không nạp được registry · mô phỏng đã khóa');
  const story = mk('panel'); story.id = 'story';
  const btnBac = mk('Phía bắc'); btnBac.dataset = { region: 'bac' };
  const btnAll = mk('Toàn bộ'); btnAll.dataset = { region: 'all' };
  const btnNam = mk('Phía nam'); btnNam.dataset = { region: 'nam' };
  const bySel = { '#regionTitle': regionTitle, '#runFloodScenario span': floodSpan, '#floodState span': floodStateSpan, '#floodState': floodStateSpan, '#story': story };
  return {
    regionTitle, floodSpan, floodStateSpan, story, btnBac, btnAll, btnNam,
    querySelector: sel => bySel[sel] || null,
    querySelectorAll: sel => sel === '[data-region]' ? [btnBac, btnAll, btnNam] : []
  };
};

test('sanitizeStatusText32 loại chuỗi cấm, giữ câu sạch', () => {
  assert.equal(SMART_APP_32_VERSION, 'smart-app-32a');
  assert.ok(BANNED_STRINGS.includes('mô phỏng'));
  const clean = sanitizeStatusText32('Khu vực · Chạy tính toán 1D/2D');
  assert.equal(clean, 'Khu vực · Chạy tính toán 1D/2D');
  const dirty = sanitizeStatusText32('giao thông minh họa (illustrative) trên đồ thị');
  for (const bad of BANNED_STRINGS) assert.ok(!dirty.toLowerCase().includes(bad), bad);
});

test('applySmartLabels32 ghi đè đúng 3 nhãn mục 9.3 (selector THẬT #floodState span)', () => {
  const dom = fakeDom();
  const n = applySmartLabels32(dom);
  assert.equal(n, 3);
  assert.equal(dom.regionTitle.textContent, 'Khu vực');
  assert.equal(dom.floodSpan.textContent, 'Chạy tính toán 1D/2D');
  assert.ok(!dom.floodStateSpan.textContent.includes('mô phỏng'));
  for (const item of SMART_LABELS_32) assert.ok(item.from && item.to);
});

test('lockRegions32: giữ bac, khóa mọi lựa chọn khác, ẩn panel cổ điển #story', () => {
  const dom = fakeDom();
  lockRegions32(dom);
  assert.equal(dom.btnBac.disabled, false);
  assert.equal(dom.btnAll.disabled, true);
  assert.equal(dom.btnNam.disabled, true);
  assert.equal(dom.btnNam['aria-disabled'], 'true');
  assert.equal(dom.story.hidden, true);
});
