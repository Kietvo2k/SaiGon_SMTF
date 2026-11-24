globalThis.window = globalThis;
require('C:/Users/Admin/orca/workspaces/SaiGon_SMTF/smart-bac/outputs/hcmc-poc/data/road-graph-31.js');
const G = globalThis.ROAD_GRAPH_31;
const targets = { 'HX-01': 366390689, 'HX-06': 1497276515, 'HX-02': 366440827, 'HX-05': 701671562 };
const idxOf = new Map(G.nodes.map((n, i) => [n.id, i]));
for (const [name, osm] of Object.entries(targets)) {
  const n = G.nodes[idxOf.get(osm)];
  console.log(`\n=== ${name} osm=${osm} x=${n.x.toFixed(1)} z=${n.z.toFixed(1)}`);
  const inc = [];
  G.edges.forEach((e, ei) => {
    const from = e.from, to = e.to;
    if (from !== osm && to !== osm) return;
    const c = e.c, m = c.length / 2;
    // full polyline length
    let len = 0;
    for (let k = 1; k < m; k++) len += Math.hypot(c[k*2]-c[(k-1)*2], c[k*2+1]-c[(k-1)*2+1]);
    const road = G.roads[e.road] || {};
    // heading into node
    let head;
    if (to === osm) head = Math.atan2(c[m*2-1]-c[m*2-3], c[m*2-2]-c[m*2-4]);
    else head = Math.atan2(c[3]-c[1], c[2]-c[0]);
    const deg = (head * 180 / Math.PI + 360) % 360;
    // direction pointing away from node toward the "back" (approach tail)
    // tail node coordinate:
    const tailX = to === osm ? c[0] : c[m*2-2];
    const tailZ = to === osm ? c[1] : c[m*2-1];
    inc.push({ ei, road: e.road, name: road.name, type: road.type, lanes: road.lanes, oneway: road.oneway, len: +len.toFixed(1), intoDeg: +deg.toFixed(1), tail: [ +tailX.toFixed(1), +tailZ.toFixed(1) ], distTail: +Math.hypot(tailX-n.x, tailZ-n.z).toFixed(1) });
  });
  inc.sort((a,b) => a.intoDeg - b.intoDeg);
  for (const r of inc) console.log(`  road=${r.road} "${r.name}" type=${r.type} lanes=${r.lanes} oneway=${r.oneway} len=${r.len} intoDeg=${r.intoDeg} tail=${r.tail} distTail=${r.distTail}`);
}
