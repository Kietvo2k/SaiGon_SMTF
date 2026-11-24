globalThis.window = globalThis;
require('C:/Users/Admin/orca/workspaces/SaiGon_SMTF/smart-bac/outputs/hcmc-poc/data/road-graph-31.js');
const G = globalThis.ROAD_GRAPH_31;
function arcPoint(c, m, fromEnd, d) {
  // walk along polyline starting at point index fromEnd (0 or m-1) toward the other end, distance d
  let acc = 0;
  let i = fromEnd;
  const step = fromEnd === 0 ? 1 : -1;
  while (i + step >= 0 && i + step < m) {
    const ax = c[i*2], az = c[i*2+1], bx = c[(i+step)*2], bz = c[(i+step)*2+1];
    const seg = Math.hypot(bx-ax, bz-az);
    if (acc + seg >= d) {
      const t = (d - acc) / seg;
      return { x: ax + (bx-ax)*t, z: az + (bz-az)*t, dirToNode: Math.atan2(az - bz, ax - bx) };
    }
    acc += seg; i += step;
  }
  return { x: c[i*2], z: c[i*2+1], dirToNode: 0 };
}
const targets = { 'HX-01': 366390689, 'HX-06': 1497276515 };
const idxOf = new Map(G.nodes.map((n, i) => [n.id, i]));
for (const [name, osm] of Object.entries(targets)) {
  const n = G.nodes[idxOf.get(osm)];
  console.log(`\n=== ${name} osm=${osm} node=(${n.x.toFixed(1)},${n.z.toFixed(1)})`);
  G.edges.forEach((e, ei) => {
    if (e.from !== osm && e.to !== osm) return;
    const c = e.c, m = c.length / 2;
    const d0 = Math.hypot(c[0]-n.x, c[1]-n.z), d1 = Math.hypot(c[m*2-2]-n.x, c[m*2-1]-n.z);
    const fromEnd = d0 <= d1 ? 0 : m-1;
    const nearEnd = fromEnd === 0 ? 'c0' : `c${m-1}`;
    const road = G.roads[e.road] || {};
    const p20 = arcPoint(c, m, fromEnd, 20), p30 = arcPoint(c, m, fromEnd, 30), p40 = arcPoint(c, m, fromEnd, 40);
    console.log(`  edge=${ei} road=${e.road} "${road.name}" ${road.type} lanes=${road.lanes} from=${e.from} to=${e.to} nearEnd=${nearEnd} len>=${m>1}`);
    console.log(`     c0=(${c[0].toFixed(1)},${c[1].toFixed(1)}) cLast=(${c[m*2-2].toFixed(1)},${c[m*2-1].toFixed(1)})`);
    for (const [tag,p] of [['20',p20],['30',p30],['40',p40]]) {
      const yaw = (p.dirToNode*180/Math.PI+360)%360;
      console.log(`     d=${tag}m pos=(${p.x.toFixed(1)},${p.z.toFixed(1)}) yawToNode=${yaw.toFixed(1)}`);
    }
  });
}
