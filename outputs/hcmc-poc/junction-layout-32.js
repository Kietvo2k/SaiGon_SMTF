// Gom các mã nút dữ liệu thành GIAO LỘ LOGIC 3/4/5/6 hướng trước khi dựng đèn.
// Lý do: một nút OSM có thể bị tách làm hai mã cách nhau vài chục mét (HX-01/HX-05), hoặc có
// nhánh hẻm chỉ đáng vẽ vạch chứ không đáng cắm đầu đèn. Hàm thuần, chạy được trong Node.
import { SIGNAL_PLAN_32 } from './signal-plan-32.js?v=32c';

export const JUNCTION_LAYOUT_32_VERSION = 'junction-layout-32a';
export const MINOR_ROAD_TYPES_32 = Object.freeze([
  'service', 'residential', 'living_street', 'unclassified',
  'track', 'path', 'footway', 'pedestrian', 'cycleway', 'steps'
]);

const ROAD_RANK_32 = {
  motorway: 9, motorway_link: 8.5, trunk: 8, trunk_link: 7.5, primary: 7, primary_link: 6.5,
  secondary: 6, secondary_link: 5.5, tertiary: 5, tertiary_link: 4.5,
  unclassified: 2, residential: 1.5, living_street: 1, service: 0.5
};

const TAU = Math.PI * 2;
export const normAngle32 = a => {
  const x = ((Number(a) || 0) + Math.PI) % TAU;
  return (x < 0 ? x + TAU : x) - Math.PI;
};
export const angleDiff32 = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function circMean32(list) {
  let sx = 0, sz = 0;
  for (const h of list) { sx += Math.cos(h); sz += Math.sin(h); }
  return (Math.abs(sx) + Math.abs(sz) < 1e-9) ? (list[0] || 0) : Math.atan2(sz, sx);
}

export function junctionType32(armCount) {
  const n = Number(armCount) || 0;
  if (n === 3) return { type: 'nga-ba', typeLabel: 'Ngã ba' };
  if (n === 4) return { type: 'nga-tu', typeLabel: 'Ngã tư' };
  if (n === 5) return { type: 'nga-nam', typeLabel: 'Ngã năm' };
  if (n === 6) return { type: 'nga-sau', typeLabel: 'Ngã sáu' };
  return { type: 'giao-lo', typeLabel: `${n} hướng` };
}

const isMinorRoad32 = (road, minorTypes) => {
  if (!road) return false;
  const type = String(road.type || road.highway || '');
  return minorTypes.includes(type);
};
const roadScore32 = road => {
  if (!road) return 0;
  const type = String(road.type || road.highway || '');
  return (ROAD_RANK_32[type] || 1) + Math.min(4, Number(road.lanes) || 0) * 0.08;
};

// Đầu đèn: đặt bên phải vạch dừng của làn vào ngoài cùng, mặt quay về xe đang tới.
function headOfArm32(net, geo, arm) {
  if (!geo || !arm.incomingLanes.length) return null;
  const best = arm.incomingLanes.slice().sort((a, b) => {
    const oa = net.lanes.offset[a.lane] || 0, ob = net.lanes.offset[b.lane] || 0;
    if (ob !== oa) return ob - oa;
    return (net.lanes.width[b.lane] || 0) - (net.lanes.width[a.lane] || 0);
  })[0];
  const l = best.lane, nodeIndex = best.nodeIndex;
  const stop = Math.max(0, (net.lanes.length[l] || 0) - (net.Rz?.[nodeIndex] || 0));
  const lat = (net.lanes.offset[l] || 0) + (net.lanes.width[l] || 0) / 2 + 0.8;
  const p = geo.lanePoint(l, stop, lat, {});
  const y = typeof geo.laneY === 'function' ? geo.laneY(l, stop) : 0;
  return {
    x: p.x, y, z: p.z,
    yaw: Math.atan2(-(p.tx || 1), -(p.tz || 0)),
    lane: l, nodeIndex,
    groupIdx: net.arriveGroup?.[net.lanes.st[l]] ?? arm.group
  };
}

/**
 * Dựng giao lộ logic từ net + node_map.
 * @param {{net:object,nodeMap:Array,geo?:object,mergeDeg?:number,minorTypes?:string[],includeMinor?:boolean}} opts
 * @returns {Array<object>} mỗi phần tử: id, name, type, typeLabel, armCount, arms[], nodeIds, indexes, x, z
 */
export function buildJunctionLayout32({ net, nodeMap = [], geo = null, mergeDeg = 22,
  minorTypes = MINOR_ROAD_TYPES_32, includeMinor = false } = {}) {
  if (!net || !net.signalPlan || !Array.isArray(net.signalPlan.clusters)) return [];
  const metaByIndex = new Map();
  for (const m of nodeMap) {
    const i = Number.isInteger(m.index) ? m.index : net.G.nodes.findIndex(n => Number(n.id) === Number(m.osm_id));
    if (i >= 0) metaByIndex.set(i, m);
  }
  const planByOsm = new Map(SIGNAL_PLAN_32.map(r => [Number(r.osm_id), r]));
  const mergeRad = Math.max(0, Number(mergeDeg) || 0) * Math.PI / 180;
  const out = [];

  for (const cluster of net.signalPlan.clusters) {
    const indexes = [...cluster.nodeIds];
    const members = new Set(indexes);
    const metas = indexes.map(i => metaByIndex.get(i)).filter(Boolean);
    const axisDeg = planByOsm.get(Number(net.G.nodes[indexes[0]]?.id))?.group_axis_deg || 0;
    const axis = axisDeg * Math.PI / 180;
    const arms = [];

    for (let l = 0; l < net.lanes.to.length; l++) {
      const from = net.lanes.from[l], to = net.lanes.to[l];
      const incoming = members.has(to) && !members.has(from);
      const outgoing = members.has(from) && !members.has(to);
      if (incoming === outgoing) continue;                  // nội bộ cụm hoặc làn ngoài cụm
      const st = net.lanes.st[l];
      if (net.signalPlan.internalSt?.has(st)) continue;
      const edge = net.E?.[net.lanes.edge[l]];
      const road = edge ? net.G.roads[edge.road] : null;
      // Hướng "ra khỏi giao lộ" của cùng một corridor: làn vào + π, làn ra lấy chiều ngược của nó + π.
      const heading = normAngle32(net.arriveHead(incoming ? st : (st ^ 1)) + Math.PI);
      const group = incoming ? (net.arriveGroup?.[st] ?? (Math.abs(Math.cos(heading - axis)) > 0.5 ? 0 : 1))
        : (Math.abs(Math.cos(heading - axis)) > 0.5 ? 0 : 1);
      let arm = arms.find(a => Math.abs(angleDiff32(a.heading, heading)) < mergeRad);
      if (!arm) {
        arm = { heading, headings: [heading], group, groupCounts: [0, 0], names: [], nameScores: new Map(),
          minor: true, roadScore: 0, incoming: false, outgoing: false, incomingLanes: [], outgoingLanes: [], laneIds: [] };
        arms.push(arm);
      } else {
        arm.headings.push(heading);
        arm.heading = circMean32(arm.headings);
      }
      arm.groupCounts[group] += incoming ? 1 : 0;
      if (incoming) { arm.incoming = true; arm.incomingLanes.push({ lane: l, nodeIndex: to }); }
      if (outgoing) { arm.outgoing = true; arm.outgoingLanes.push({ lane: l, nodeIndex: from }); }
      arm.laneIds.push(l);
      const name = road?.name || 'Nhánh đường';
      const score = roadScore32(road);
      if (!arm.names.includes(name)) arm.names.push(name);
      arm.nameScores.set(name, Math.max(arm.nameScores.get(name) || 0, score));
      if (score > arm.roadScore) { arm.roadScore = score; arm.roadType = road?.type || road?.highway || ''; }
      if (!isMinorRoad32(road, minorTypes)) arm.minor = false;
    }

    // Bỏ nhánh hẻm/dịch vụ khi giao lộ đã có từ 3 nhánh chính trở lên.
    let kept = arms;
    if (!includeMinor) {
      const major = arms.filter(a => !a.minor);
      if (major.length >= 3) kept = major;
    }
    kept.sort((a, b) => a.heading - b.heading);

    const armRows = kept.map((arm, i) => {
      if (arm.groupCounts[0] || arm.groupCounts[1]) arm.group = arm.groupCounts[1] > arm.groupCounts[0] ? 1 : 0;
      arm.names.sort((a, b) => (arm.nameScores.get(b) || 0) - (arm.nameScores.get(a) || 0));
      arm.head = headOfArm32(net, geo, arm);
      if (arm.head) {
        const meta = metaByIndex.get(arm.head.nodeIndex);
        arm.head.node_id = meta?.node_id || String(net.G.nodes[arm.head.nodeIndex]?.id ?? '');
      }
      return {
        heading: arm.heading, group: arm.group, names: [...arm.names], minor: arm.minor,
        incoming: arm.incoming, outgoing: arm.outgoing,
        laneIds: [...arm.laneIds], head: arm.head,
        label: `Hướng ${i + 1}: ${arm.names.join(' / ')}`
      };
    });
    const typ = junctionType32(armRows.length);
    const name = cluster.name || (metas.length === 1 ? metas[0].label
      : [...new Set(armRows.flatMap(a => a.names))].slice(0, 2).join(' × ')) || cluster.cluster_id;
    const x = metas.length ? metas.reduce((s, m) => s + m.x, 0) / metas.length : net.G.nodes[indexes[0]].x;
    const z = metas.length ? metas.reduce((s, m) => s + m.z, 0) / metas.length : net.G.nodes[indexes[0]].z;
    out.push({
      id: cluster.cluster_id, name, axisDeg, axis,
      type: typ.type, typeLabel: typ.typeLabel, armCount: armRows.length,
      nodeIds: metas.map(m => m.node_id), indexes,
      x, z, arms: armRows,
      // Khi chưa truyền geo (panel chỉ đọc), vẫn đếm được nhánh có làn vào = số đầu đèn sẽ dựng.
      headCount: armRows.filter(a => a.head || a.incoming).length
    });
  }
  return out;
}

// Danh sách đầu đèn 3D: mỗi nhánh tối đa một đầu, không nhân theo số làn.
export function junctionPlacements32(layout) {
  const out = [];
  for (const j of layout || []) {
    for (const arm of j.arms || []) {
      if (!arm.head) continue;
      out.push({
        ...arm.head,
        cluster: j.id, junction: j.name, junctionType: j.typeLabel,
        groupIdx: arm.head.groupIdx ?? arm.group,
        label: arm.names.join(' / ')
      });
    }
  }
  return out;
}
