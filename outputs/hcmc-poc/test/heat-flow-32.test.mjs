// heat-flow-32.test.mjs — bản trình diễn v2 (P1-11): lớp mũi tên dòng xe theo chiều (thuần JS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlowArrows32, laneDensityOf32, paintFlowArrows32, buildRibbon32, ribbonBandsOf32,
  queueByEdgeDir32, flowByEdgeDir32, heatQueueClass32, paintRibbon32,
  FLOW_ARROW_GAP_M_32, FLOW_DENSITY_CAP_32, HEAT_QUEUE_COLORS_32, HEAT_QUEUE_LABELS_32
} from '../heat-scene-32.js?v=32a';
import { HEAT_COLORS_32 } from '../heat-32.js?v=32a';

const palette = HEAT_COLORS_32.map(hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]);
const queuePalette = HEAT_QUEUE_COLORS_32.map(hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]);

function fixture({ lanesLength = [130, 40], rank = [3, 3], inside = [1, 1] } = {}) {
  const net = {
    NL: lanesLength.length, NE: 2,
    lanes: {
      edge: [0, 1], dir: [1, -1], length: lanesLength, offset: [0, 0], width: [6, 6], n: [2, 2],
      rank, st: [0, 1], to: [10, 11], from: [11, 10]
    }
  };
  const sim = { insideLaneOf: l => !!inside[l], N: 3, active: [1, 1, 1], lane: [0, 0, 1] };
  return { net, sim };
}

test('P1-11: buildFlowArrows32 — mỗi làn đủ hạng một mũi mỗi FLOW_ARROW_GAP_M_32 m', () => {
  const { net, sim } = fixture();
  const arrows = buildFlowArrows32({ net, sim });
  const lane0 = arrows.filter(a => a.lane === 0), lane1 = arrows.filter(a => a.lane === 1);
  assert.equal(lane0.length, Math.ceil(130 / FLOW_ARROW_GAP_M_32), 'lane 130 m → 3 mũi');
  assert.equal(lane1.length, Math.ceil(40 / FLOW_ARROW_GAP_M_32), 'lane 40 m đúng số mũi theo khoảng cách cấu hình');
  // làn hạng thấp bị loại
  const low = fixture({ rank: [1, 1] });
  assert.equal(buildFlowArrows32({ net: low.net, sim: low.sim }).length, 0, 'hạng < tertiary không vẽ');
  // làn ngoài khu bị loại
  const out = fixture({ inside: [1, 0] });
  assert.equal(buildFlowArrows32({ net: out.net, sim: out.sim }).filter(a => a.lane === 1).length, 0);
});

test('P1-11: laneDensityOf32 đếm xe theo đúng làn đang chạy', () => {
  const { net, sim } = fixture();
  const density = laneDensityOf32(sim, net);
  assert.equal(density[0], 2);
  assert.equal(density[1], 1);
  assert.equal(laneDensityOf32(null, net)[0], 0, 'không có sim → mật độ 0');
});

test('P1-11: paintFlowArrows32 — mũi hướng theo chiều lane, chiều đông xe đậm và to hơn', () => {
  const { net, sim } = fixture({ lanesLength: [60, 60] });
  const arrows = buildFlowArrows32({ net, sim });
  const positions = new Float32Array(arrows.length * 9), colors = new Float32Array(arrows.length * 9);
  // lanePoint giả: isometric dọc trục x — hướng (1,0), độ cao 0.
  const lanePoint = (l, s, offset) => ({ x: s, z: offset, tx: 1, tz: 0, y: 0 });
  const levelOf = () => 0.1;   // cùng mức nhiệt cho mọi cạnh → so sánh chỉ theo mật độ
  const density = new Float32Array([FLOW_DENSITY_CAP_32, 0]);   // lane 0 đông, lane 1 vắng
  const count = paintFlowArrows32({ net, arrows, positions, colors, density, levelOf, lanePoint, palette });
  assert.equal(count, arrows.length);
  const tri = i => [positions[i * 9], positions[i * 9 + 1], positions[i * 9 + 2], positions[i * 9 + 3], positions[i * 9 + 6]];
  // mũi tên lane 0 (đông): đỉnh tiến dương theo trục x (theo chiều lane), đuôi phía sau.
  const a0 = arrows.findIndex(a => a.lane === 0);
  const t0 = tri(a0);
  assert.ok(t0[0] > t0[3] && t0[0] > t0[4], 'đỉnh mũi tiến theo chiều xe (trục +x)');
  const a1 = arrows.findIndex(a => a.lane === 1);
  const t1 = tri(a1);
  // chiều đông to hơn chiều vắng: khoảng cách đỉnh–đuôi dài hơn.
  const len = t => Math.hypot(t[0] - (t[3] + t[4]) / 2);
  assert.ok(len(t0) > len(t1), `mũi chiều đông to hơn (${len(t0)} > ${len(t1)})`);
  // màu: cùng palette cell nhưng chiều đông sáng/đậm hơn (brightness theo mật độ).
  const c0 = colors[a0 * 9], c1 = colors[a1 * 9];
  assert.ok(c0 > c1, `độ đậm màu theo mật độ (${c0} > ${c1})`);
});

test('thang màu theo hàng chờ: 0/2 xe xanh, 5 vàng, 10 cam, 20 đỏ; tím chỉ cho làn đóng', () => {
  assert.deepEqual([0, 2, 5, 10, 20].map(q => heatQueueClass32(q)), [0, 0, 1, 2, 3]);
  assert.equal(heatQueueClass32(2.01), 1, 'trên 2 xe sang vàng');
  assert.equal(heatQueueClass32(5.01), 2, 'trên 5 xe sang cam');
  assert.equal(heatQueueClass32(10.01), 3, 'trên 10 xe sang đỏ');
  assert.equal(heatQueueClass32(0.95), 0, '0,95 xe vẫn xanh, không tím');
  assert.equal(heatQueueClass32(NaN), 0, 'NaN không sinh màu nóng');
  assert.equal(heatQueueClass32(1, true), 4, 'làn đóng/chặn mới dùng tím');
  assert.equal(HEAT_QUEUE_COLORS_32.length, 5);
  assert.equal(HEAT_QUEUE_LABELS_32.length, 4, 'legend chỉ 4 nấc hàng chờ');
  assert.match(HEAT_QUEUE_COLORS_32[1], /^#[0-9a-f]{6}$/);
  // Vàng nhiệt là lục-vàng, tách khỏi vàng đèn giao thông #f1c40f.
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const a = rgb(HEAT_QUEUE_COLORS_32[1]), b = rgb('#f1c40f');
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.25, 'vàng heat khác vàng đèn');
});

test('hàng chờ theo cạnh+chiều: xe dừng hoặc trong 25 m tới vạch có đèn', () => {
  const net = {
    NE: 2, NL: 2, signal: [0, 1, 0],
    E: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
    lanes: { edge: [0, 1], dir: [1, -1], length: [100, 100], offset: [0, 0], width: [3, 3] }
  };
  const sim = { N: 3, active: [1, 1, 1], lane: [0, 1, 0], s: [90, 5, 20], v: [0, 0, 5] };
  const q = queueByEdgeDir32(sim, net);
  assert.equal(q[0], 1, 'cạnh 0 chiều + có 1 xe chờ');
  assert.equal(q[3], 1, 'cạnh 1 chiều − có 1 xe chờ');
  assert.equal(q[1], 0, 'chiều ngược lại không bị cộng nhầm');
  assert.equal(q[2], 0);
  // lưu lượng theo làn để phân biệt free-flow với đoạn không có dữ liệu
  const f = flowByEdgeDir32(sim, net);
  assert.equal(f[0], 2, 'hai xe đang chạy trên cạnh 0 chiều +');
  assert.equal(f[3], 1, 'một xe trên cạnh 1 chiều −');
  assert.equal(f[1] + f[2], 0);
});

test('ribbon dùng offset làn/chiều và cắt Rz: tâm dải = tâm cụm làn, không tràn nút', () => {
  const net = {
    NE: 1, NL: 2,
    E: [{ c: [0, 0, 100, 0], from: 1, to: 2 }],
    lanes: { edge: [0, 0], dir: [1, -1], length: [100, 100], offset: [2, 2], width: [3, 3], n: [1, 1], rank: [3, 3] }
  };
  const bands = ribbonBandsOf32(net, 0);
  assert.equal(bands.length, 2, 'cạnh hai chiều có hai dải theo chiều');
  assert.equal(bands[0].dir, 1); assert.equal(bands[0].offset, 2);
  assert.equal(bands[1].dir, -1); assert.equal(bands[1].offset, -2);
  const built = buildRibbon32({
    net, edges: [0], yOf: () => 0, bandsOf: e => ribbonBandsOf32(net, e),
    trimOf: () => ({ from: 10, to: 20 }), lift: 0.1
  });
  assert.equal(built.ranges.length, 2);
  assert.equal(built.indices.length, 12, '2 dải × 1 đoạn × 6 chỉ số');
  for (const r of built.ranges) {
    assert.ok(Math.abs(r.s0 - 10) < 1e-6, `bắt đầu sau Rz: ${r.s0}`);
    assert.ok(Math.abs(r.s1 - 80) < 1e-6, `kết thúc trước Rz: ${r.s1}`);
    assert.equal(r.trimOver, 0, 'không chạm vùng nút');
    assert.ok(r.delta <= 0.3, `tâm dải lệch tâm cụm làn ${r.delta} m`);
  }
  // tâm dải +2 / −2, hai dải không chồng qua tim đường; không có NaN.
  const zs = [];
  for (let i = 0; i < built.positions.length; i += 3) { assert.ok(Number.isFinite(built.positions[i + 2])); zs.push(built.positions[i + 2]); }
  assert.ok(zs.filter(z => z > 0).every(z => z >= 0.5), 'dải chiều + nằm trong cụm làn bên phải');
  assert.ok(zs.filter(z => z < 0).every(z => z <= -0.5), 'dải chiều − nằm trong cụm làn bên trái');
  for (const idx of built.indices) assert.ok(idx < built.positions.length / 3);
  // tô màu theo hạng hàng chờ, không theo mức nhiệt 0–1.
  paintRibbon32(built.colors, built.ranges, (e, dir) => (dir > 0 ? 0 : 3), queuePalette);
  assert.ok(Math.abs(built.colors[0] - queuePalette[0][0]) < 1e-6);
  assert.ok(Math.abs(built.colors[12] - queuePalette[3][0]) < 1e-6);
});
