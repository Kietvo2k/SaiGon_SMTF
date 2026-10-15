import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeat32, colorOf, HEAT_COLORS_32 } from '../heat-32.js';

test('level thấp khi thông, cao khi kẹt', () => {
  const h = createHeat32({ edgeCount: 2, edgeLen: [100,100], edgeSpeedLimit: [14,14], alpha: 0.5, windowS: 60, dayStartHour: 6 });
  h.ingest(0, [{edge:0,speed:14,stopped:0},{edge:0,speed:13,stopped:0}]);
  assert.ok(h.level(0) < 0.3, `thong level thap ${h.level(0)}`);
  for (let i = 0; i < 3; i++) h.ingest(i, [{edge:1,speed:0,stopped:1},{edge:1,speed:0,stopped:1},{edge:1,speed:0.2,stopped:1}]);
  assert.ok(h.level(1) > 0.7, `ket level cao ${h.level(1)}`);
});

test('EMA hội tụ dần về mức ổn định', () => {
  const h = createHeat32({ edgeCount: 1, edgeLen: [100], edgeSpeedLimit: [10], alpha: 0.2 });
  let prev = 0;
  for(let i=0;i<20;i++){
    h.ingest(i*5, [{edge:0,speed:0,stopped:1}]);
    const cur = h.level(0);
    assert.ok(cur >= prev - 1e-9, 'EMA khong giam khi lien tuc ket');
    prev = cur;
  }
  assert.ok(prev > 0.9, `hoi tu gan 1 ${prev}`);
  for(let i=0;i<20;i++){
    h.ingest(100+i*5, [{edge:0,speed:10,stopped:0}]);
  }
  assert.ok(h.level(0) < 0.3, `giam ve thap sau thong ${h.level(0)}`);
});

test('snapshot trả Float32Array đúng kích thước và clamp [0,1]', () => {
  const h = createHeat32({ edgeCount: 3, edgeLen: [100,100,100], edgeSpeedLimit: [10,10,10] });
  h.ingest(0, [{edge:0,speed:10,stopped:0}]);
  const s = h.snapshot();
  assert.ok(s instanceof Float32Array);
  assert.equal(s.length, 3);
  for(const v of s) assert.ok(v>=0 && v<=1);
});

test('hourly: tích lũy đúng ô giờ theo tSim và dayStartHour', () => {
  const h = createHeat32({ edgeCount: 1, edgeLen: [100], edgeSpeedLimit: [10], dayStartHour: 6 });
  for (let i = 0; i < 10; i++) h.ingest(i, [{edge:0,speed:0,stopped:1}]);
  for (let i = 0; i < 10; i++) h.ingest(3600+i, [{edge:0,speed:10,stopped:0}]);
  for (let i = 0; i < 10; i++) h.ingest(7200+i, [{edge:0,speed:0,stopped:1}]);
  const hourly = h.hourly();
  assert.ok(hourly instanceof Float32Array);
  assert.equal(hourly.length, 24*1);
  const g6 = hourly[6], g7 = hourly[7], g8 = hourly[8];
  assert.ok(g6 > 0.5, `gio 6 cao ${g6}`);
  assert.ok(g7 < 0.5, `gio 7 thap ${g7}`);
  assert.ok(g8 > 0.5, `gio 8 cao ${g8}`);
  assert.equal(hourly[0], 0);
});

test('hourly wrap quanh ngày (tSim lớn)', () => {
  const h = createHeat32({ edgeCount: 1, edgeLen: [100], edgeSpeedLimit: [10], dayStartHour: 0 });
  for (let i = 0; i < 10; i++) h.ingest(23*3600+i, [{edge:0,speed:10,stopped:0}]);
  for (let i = 0; i < 10; i++) h.ingest(24*3600+i, [{edge:0,speed:0,stopped:1}]);
  const hourly = h.hourly();
  assert.ok(hourly[23] < 0.4, `23 thap ${hourly[23]}`);
  assert.ok(hourly[0] > 0.6, `0 cao ${hourly[0]}`);
});

test('colorOf 5 nấc cố định xanh->vàng->cam->đỏ', () => {
  assert.equal(HEAT_COLORS_32.length, 5);
  for(const c of HEAT_COLORS_32) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(colorOf(0), HEAT_COLORS_32[0]);
  assert.equal(colorOf(0.1), HEAT_COLORS_32[0]);
  assert.equal(colorOf(0.3), HEAT_COLORS_32[1]);
  assert.equal(colorOf(0.5), HEAT_COLORS_32[2]);
  assert.equal(colorOf(0.7), HEAT_COLORS_32[3]);
  assert.equal(colorOf(0.9), HEAT_COLORS_32[4]);
  assert.equal(colorOf(1), HEAT_COLORS_32[4]);
  assert.equal(colorOf(-1), HEAT_COLORS_32[0]);
  assert.equal(colorOf(2), HEAT_COLORS_32[4]);
});

test('ingest không có sample giữ nguyên level (không NaN)', () => {
  const h = createHeat32({ edgeCount: 1, edgeLen: [100], edgeSpeedLimit: [10] });
  h.ingest(0, [{edge:0,speed:10,stopped:0}]);
  const a = h.level(0);
  h.ingest(5, []);
  assert.equal(h.level(0), a);
});

test('ingest với edge out-of-range không ném lỗi', () => {
  const h = createHeat32({ edgeCount: 1, edgeLen: [100], edgeSpeedLimit: [10] });
  h.ingest(0, [{edge:99,speed:0,stopped:1}]);
  assert.equal(h.level(0), 0);
});
