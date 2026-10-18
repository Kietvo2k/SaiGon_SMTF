// Test cho resource-monitor-32.js (ngưỡng CPU 80 %, GPU 70 %, RAM 85 %, hysteresis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resourceSample32, resourceOver32, resourceUnder32, createResourceWatch32,
  RESOURCE_LIMITS_32, RESOURCE_MONITOR_KEY_32
} from '../resource-monitor-32.js?v=32a';

test('resourceSample32: RAM từ heap, CPU từ long-task, GPU từ thời gian khung', () => {
  assert.deepEqual(resourceSample32({}), { cpuPct: 0, gpuPct: 0, ramPct: 0 });
  const s = resourceSample32({ heapUsed: 850, heapLimit: 1000, longTasksPerSec: 4, frameMs: 20, capFps: 30 });
  assert.ok(Math.abs(s.ramPct - 85) < 1e-9, `ram=${s.ramPct}`);
  assert.equal(s.cpuPct, 80);
  // ngân sách khung ở 30 FPS = 33,33 ms; 20 ms → 60 %.
  assert.ok(Math.abs(s.gpuPct - 60) < 1e-6, `gpu=${s.gpuPct}`);
});

test('resourceSample32: heapLimit = 0 thì RAM = 0 (không phạt khi trình duyệt không hỗ trợ)', () => {
  const s = resourceSample32({ heapLimit: 0, longTasksPerSec: 10, frameMs: 100, capFps: 30 });
  assert.equal(s.ramPct, 0);
  assert.equal(s.cpuPct, 100);
});

test('resourceOver32 / resourceUnder32 theo ngưỡng 80/70/85', () => {
  const L = RESOURCE_LIMITS_32;
  assert.equal(resourceOver32({ cpuPct: 81, gpuPct: 10, ramPct: 10 }, L), true);
  assert.equal(resourceOver32({ cpuPct: 10, gpuPct: 71, ramPct: 10 }, L), true);
  assert.equal(resourceOver32({ cpuPct: 10, gpuPct: 10, ramPct: 86 }, L), true);
  assert.equal(resourceOver32({ cpuPct: 80, gpuPct: 70, ramPct: 85 }, L), false);   // đúng bằng ngưỡng chưa phạt
  assert.equal(resourceUnder32({ cpuPct: 74, gpuPct: 64, ramPct: 80 }, L), true);
  assert.equal(resourceUnder32({ cpuPct: 76, gpuPct: 60, ramPct: 80 }, L), false);  // CPU 76 > 80−5
});

test('createResourceWatch32: cần 3 mẫu vượt ngưỡng mới bật, 5 mẫu an toàn mới tắt', () => {
  const events = [];
  const store = { getItem: () => null, setItem: () => {} };
  const w = createResourceWatch32({
    autoPersist: store,
    onSave: () => events.push('save'), onNormal: () => events.push('normal')
  });
  const hot = { cpuPct: 90, gpuPct: 10, ramPct: 10 };
  const cool = { cpuPct: 50, gpuPct: 40, ramPct: 60 };
  const mid = { cpuPct: 78, gpuPct: 68, ramPct: 82 };   // không vượt và không an toàn → reset bộ đếm
  w.tick(hot); w.tick(hot);
  assert.equal(w.mode(), 'normal');
  assert.deepEqual(events, []);
  w.tick(hot);
  assert.equal(w.mode(), 'save');
  assert.deepEqual(events, ['save']);
  // 1 mẫu giữa chừng reset bộ đếm nhưng không tắt chế độ tiết kiệm
  w.tick(mid);
  assert.equal(w.mode(), 'save');
  w.tick(cool);
  for (let i = 0; i < 3; i++) w.tick(cool);
  assert.equal(w.mode(), 'save');
  w.tick(cool);
  assert.equal(w.mode(), 'normal');
  assert.deepEqual(events, ['save', 'normal']);
});

test('createResourceWatch32: mẫu ở giữa (không vượt không an toàn) reset bộ đếm', () => {
  const w = createResourceWatch32({ autoPersist: { getItem: () => null, setItem: () => {} } });
  const hot = { cpuPct: 95, gpuPct: 0, ramPct: 0 };
  const mid = { cpuPct: 78, gpuPct: 68, ramPct: 82 };   // 78 > 75, 68 > 65 → không dưới ngưỡng
  w.tick(hot); w.tick(hot);
  w.tick(mid); w.tick(hot); w.tick(hot);   // mid reset bộ đếm → chỉ còn 2 mẫu liên tiếp, chưa đủ 3
  assert.equal(w.mode(), 'normal');
  w.tick(hot);
  assert.equal(w.mode(), 'save');
});

test('createResourceWatch32: persist ghi localStorage khi tự bật/tắt', () => {
  const saved = [];
  const store = { getItem: () => null, setItem: (k, v) => saved.push([k, v]) };
  const w = createResourceWatch32({ autoPersist: store });
  const hot = { cpuPct: 95, gpuPct: 0, ramPct: 0 };
  for (let i = 0; i < 3; i++) w.tick(hot);
  const cool = { cpuPct: 50, gpuPct: 40, ramPct: 60 };
  for (let i = 0; i < 5; i++) w.tick(cool);
  assert.deepEqual(saved, [[RESOURCE_MONITOR_KEY_32, 'true'], [RESOURCE_MONITOR_KEY_32, 'false']]);
});
