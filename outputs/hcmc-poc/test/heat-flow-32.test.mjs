// heat-flow-32.test.mjs — bản trình diễn v2 (P1-11): lớp mũi tên dòng xe theo chiều (thuần JS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowArrows32, laneDensityOf32, paintFlowArrows32, FLOW_ARROW_GAP_M_32, FLOW_DENSITY_CAP_32 } from '../heat-scene-32.js?v=32a';
import { HEAT_COLORS_32 } from '../heat-32.js?v=32a';

const palette = HEAT_COLORS_32.map(hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]);

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
  assert.equal(lane1.length, 1, 'lane 40 m → 1 mũi');
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
