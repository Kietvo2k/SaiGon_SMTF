// Test road-fix A cho cầu: nối deck hai chiều (B-01/B-02) và mố đầu deck cụt (B-03).
// city-bridges-31.js import 'three/webgpu'; map specifier sang vendor giống hardtest để test Node thuần.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three' || specifier === 'three/webgpu') return { url: pathToFileURL(join(process.cwd(), 'outputs/hcmc-poc/vendor/three186/three.webgpu.js')).href, shortCircuit: true };
    if (specifier === 'three/tsl') return { url: pathToFileURL(join(process.cwd(), 'outputs/hcmc-poc/vendor/three186/three.tsl.js')).href, shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const bridges = await import('../city-bridges-31.js?v=31a');
const { planDeckLinks31, planDeckAbutments31, DECK_LINK_MAX_GAP_M } = bridges;

const piece = (road, line, { y = 5, bottom = 4.1, hw = 7.5 } = {}) => ({
  road,
  center: Float32Array.from(line.flatMap(([x, z]) => [x, y, z])),
  halfWidth: hw,
  bottoms: Float32Array.from(line.map(() => bottom))
});

test('hằng số nối deck hợp lý', () => {
  assert.equal(DECK_LINK_MAX_GAP_M, 6);
});

test('B-01: hai dải song song cách 18 m, nửa rộng 7,5 → có bản nối khe 3 m', () => {
  const A = piece(267, [[500, -2380], [500, -2330]]);
  const B = piece(316, [[518, -2380], [518, -2330]]);
  const links = planDeckLinks31([A, B]);
  assert.ok(links.length >= 2, `links ${links.length}`);
  assert.ok(links.every(l => Math.abs(l.gap - 3) < 0.05), JSON.stringify(links));
  assert.ok(links.every(l => l.top < 5 && l.bottom < l.top));
  // Bản nối nằm giữa hai mép deck: x trong [506,5 … 511,5].
  assert.ok(links.every(l => l.ax >= 506 && l.ax <= 508 && l.bx >= 509 && l.bx <= 512), JSON.stringify(links[0]));
});

test('deck chồng nhau / vuông góc / xa nhau / lệch cao độ → không nối', () => {
  const A = piece(1, [[0, 0], [0, 50], [0, 100]]);
  assert.equal(planDeckLinks31([A, piece(2, [[8, 0], [8, 50], [8, 100]])]).length, 0, 'chồng nhau (8 m < 15 m)');
  assert.equal(planDeckLinks31([A, piece(3, [[-10, 50], [0, 50], [10, 50]])]).length, 0, 'vuông góc');
  assert.equal(planDeckLinks31([A, piece(4, [[40, 0], [40, 50], [40, 100]])]).length, 0, 'khe 25 m > 6 m');
  assert.equal(planDeckLinks31([A, piece(5, [[18, 0], [18, 50], [18, 100]], { y: 9 }) ]).length, 0, 'lệch 4 m');
});

test('B-03: đầu deck cụt trên đất → mố từ đáy deck xuống nền; có đường nối cùng cao độ → không mố', () => {
  const p = piece(287, [[0, 0], [0, 100]], { y: 5, bottom: 4.1 });
  const noRoad = planDeckAbutments31([p], { surfaceAt: () => [], groundY: 1, baseY: -1.05 });
  assert.equal(noRoad.length, 2, JSON.stringify(noRoad));
  for (const a of noRoad) {
    assert.ok(Math.abs(a.top - 4.1) < 1e-3, `top ${a.top}`);
    assert.equal(a.bottom, -1.05);
    assert.equal(a.halfWidth, 7.5);
  }
  // Đầu z=100 quay ra +z; mố dài 5 m lùi vào trong.
  const end1 = noRoad.find(a => a.end === 1);
  assert.ok(end1.az === 100 && Math.abs(end1.bz - 95) < 1e-9, JSON.stringify(end1));
  const end0 = noRoad.find(a => a.end === 0);
  assert.ok(end0.az === 0 && Math.abs(end0.bz - 5) < 1e-9, JSON.stringify(end0));
  const connected = planDeckAbutments31([p], { surfaceAt: () => [5], groundY: 1, baseY: -1.05 });
  assert.equal(connected.length, 0);
  const water = planDeckAbutments31([p], { surfaceAt: () => [], groundY: 1, baseY: -1.05, allowedAt: () => false });
  assert.equal(water.length, 0);
});

test('deck thấp sát nền (dốc dẫn) không sinh mố', () => {
  const ramp = piece(999, [[0, 0], [0, 100]], { y: 2.0, bottom: 1.2 });
  assert.equal(planDeckAbutments31([ramp], { surfaceAt: () => [], groundY: 1, baseY: -1.05 }).length, 0);
});

test('dốc dẫn thấp sát nền không nối bản (chỉ nối deck cầu thật)', () => {
  const A = piece(11, [[0, 0], [0, 50], [0, 100]], { y: 2, bottom: 1.1 });
  const B = piece(12, [[18, 0], [18, 50], [18, 100]], { y: 2, bottom: 1.1 });
  assert.equal(planDeckLinks31([A, B], { groundY: 1 }).length, 0);
  assert.ok(planDeckLinks31([piece(13, [[0, 0], [0, 100]]), piece(14, [[18, 0], [18, 100]])], { groundY: 1 }).length > 0, 'deck cầu cao vẫn nối');
});
