#!/usr/bin/env node
// Một bảng fragment duy nhất cấp graph, scene và mọi chỉ mục public.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { SIGNAL_PLAN_32 } from '../outputs/hcmc-poc/signal-plan-32.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let outRoot = ROOT, python = 'python';
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!value || !['--python', '--out-root'].includes(key)) throw new Error('Dùng --python <executable> --out-root <absolute-directory>');
  if (key === '--python') python = value;
  else { if (!isAbsolute(value)) throw new Error('--out-root phải là đường dẫn tuyệt đối'); outRoot = resolve(value); }
}
const P = 'outputs/hcmc-poc/', SEED = 'outputs/smart-traffic/backend/app/seed/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = new Map();
function read(path, expected) {
  const bytes = readFileSync(join(ROOT, path));
  const digest = sha(bytes);
  if (expected && digest !== expected) throw new Error(`Nguồn sai SHA-256: ${path}: ${digest}`);
  inputs.set(path, { path, bytes: bytes.length, sha256: digest });
  return bytes.toString('utf8');
}
const json = path => JSON.parse(read(path));
const source = JSON.parse(read(P + 'data/road-graph-31.json', '1da1f3d4cc8a0e9de2e050f21ee2bf4450cbe4fc9a23e16726f46ef03bdb6149'));
const sceneSource = JSON.parse(read(P + 'data/scene.json', '50b89a3b8035ddc23c81ce20590f1274737d7443657fc791f3a6c069cf96dfa2'));
const nodeSeed = json(SEED + 'node_map.json'), cameraSeed = json(SEED + 'cameras.json');
const furniture = json(P + 'data/street-furniture-31.json');
const corrections = json(P + 'data/bridge-corrections-31.json');
const signatures = json(P + 'data/signature-registry-31.json');
const heatSource = json(P + 'data/heat-history-32.json');
json(P + 'data/ba-son-bridge-detail.json'); json(P + 'data/bach-dang-footbridge.json');
function globalSource(file, name) { const context = { window: {} }; vm.runInNewContext(read(P + 'data/' + file), context); return JSON.parse(JSON.stringify(context.window[name])); }
const semantic = globalSource('semantic-materials-08.js', 'SEMANTIC_MATERIALS_08');
const webgpuCorrections = globalSource('webgpu-corrections-24.js', 'WEBGPU_CORRECTIONS_24');
read(P + 'city-region-31.js');
const { regionPolygon } = await import(pathToFileURL(join(ROOT, P + 'city-region-31.js')).href);
const polygon = regionPolygon('bac');
const zones = signatures.entries.filter(e => e.kind === 'zone');
const zoneShapes = zones.flatMap((e, i) => e.zone.polygons.map((r, j) => ({ id: `${i}:${j}`, r: [r] })));
const stairs = corrections.footbridges.ways.flatMap(w => w.stairs.map((s, j) => ({ ...s, key: `${w.way}:${j}` })));
const temporary = mkdtempSync(join(tmpdir(), 'smtf-north-build-'));
let clipped;
try {
  const request = { schemaVersion: 1, polygon, edges: [...source.edges, ...stairs.map((s, i) => ({ id: `stairs:${i}`, c: s.points.flat() }))],
    layers: { buildings: sceneSource.buildings, water: sceneSource.water, green: sceneSource.green, zones: zoneShapes } };
  writeFileSync(join(temporary, 'input.json'), JSON.stringify(request));
  const result = spawnSync(python, ['-X', 'utf8', join(ROOT, 'scripts/build_public_north.py'), '--input', join(temporary, 'input.json'), '--output', join(temporary, 'output.json')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Clip thất bại: ${result.error?.message || result.stderr || result.status}`);
  clipped = JSON.parse(readFileSync(join(temporary, 'output.json'), 'utf8'));
} finally { rmSync(temporary, { recursive: true, force: true }); }

const nodeSource = new Map(source.nodes.map((n, index) => [n.id, { n, index }]));
const nodeById = new Map(), nodes = [], edges = [], roads = [], sceneRoads = [], edgeMap = [], roadMap = [];
const bySourceRoad = new Map();
const lengthOf = c => { let total = 0; for (let i = 2; i < c.length; i += 2) total += Math.hypot(c[i] - c[i - 2], c[i + 1] - c[i - 1]); return total; };
const stationKey = s => Number(s.toFixed(8));
function endpoint(fragment, edge, atEnd) {
  const station = atEnd ? fragment.end_m : fragment.start_m;
  const unchanged = Math.abs(station - (atEnd ? fragment.source_planar_length_m : 0)) < 1e-7;
  const sourceId = unchanged ? (atEnd ? edge.to : edge.from) : null;
  const id = sourceId ?? `cut:${edge.id}:${stationKey(station)}`;
  if (!nodeById.has(id)) {
    const record = sourceId === null ? null : nodeSource.get(sourceId);
    assert(sourceId === null || record, `Source topology thiếu ${sourceId}`);
    const offset = atEnd ? fragment.c.length - 2 : 0;
    const y = fragment.y?.[atEnd ? fragment.y.length - 1 : 0] ?? source.frame.groundY;
    const node = record ? { ...record.n, adj: [], source_id: sourceId, source_node_id: sourceId, source_node_index: record.index }
      : { id, x: fragment.c[offset], z: fragment.c[offset + 1], y, kind: 'boundary', adj: [], source_id: null, source_node_id: null, source_node_index: null, source_edge_id: edge.id, source_station_m: station };
    node.layer = source.roads[edge.road].layer ?? 0;
    nodes.push(node); nodeById.set(id, node);
  }
  return id;
}
for (const fragment of clipped.fragments.filter(f => typeof f.source_edge_id === 'number')) {
  const srcEdge = source.edges[fragment.source_edge_id], srcRoad = source.roads[srcEdge.road];
  assert.equal(srcEdge.id, fragment.source_edge_id);
  const index = roads.length, c = fragment.c, length = lengthOf(c);
  const from = endpoint(fragment, srcEdge, false), to = endpoint(fragment, srcEdge, true);
  const srcStations = [0]; for (let i = 2; i < srcEdge.c.length; i += 2) srcStations.push(srcStations.at(-1) + Math.hypot(srcEdge.c[i] - srcEdge.c[i - 2], srcEdge.c[i + 1] - srcEdge.c[i - 1]));
  const shape = fragment.vertex_stations_m.map(station => {
    const k = srcStations.findIndex(s => Math.abs(s - station) < 1e-7);
    return k < 0 ? `cut:${srcEdge.id}:${stationKey(station)}` : srcRoad.nodes[srcEdge.v0 + k];
  });
  const publicRoad = { ...srcRoad, index, c: [...c], nodes: shape, edges: [index], boundaryVertices: [from, to].flatMap((id, i) => nodeById.get(id).kind === 'boundary' ? [i ? shape.length - 1 : 0] : []),
    source_index: srcEdge.road, source_road_index: srcEdge.road, source_edge_id: srcEdge.id, source_shape_node_ids: shape, fragment: fragment.fragment, source_station_start_m: fragment.start_m, source_station_end_m: fragment.end_m };
  const edge = { ...srcEdge, id: index, road: index, from, to, v0: 0, v1: c.length / 2 - 1, c: [...c], length,
    source_edge_id: srcEdge.id, source_road_index: srcEdge.road, fragment: fragment.fragment, source_station_start_m: fragment.start_m, source_station_end_m: fragment.end_m, layer: srcRoad.layer ?? 0 };
  if (fragment.profile) edge.profile = fragment.profile;
  if (fragment.y) edge.y = fragment.y;
  edges.push(edge); roads.push(publicRoad);
  sceneRoads.push({ ...sceneSource.roads[srcEdge.road], ...publicRoad, c: Array.from({ length: c.length / 2 }, (_, k) => c.slice(k * 2, k * 2 + 2)) });
  const publicIndices = bySourceRoad.get(srcEdge.road) || []; publicIndices.push(index); bySourceRoad.set(srcEdge.road, publicIndices);
  edgeMap.push({ public_edge_id: index, source_edge_id: srcEdge.id, public_road_id: index, source_road_index: srcEdge.road, fragment: fragment.fragment, from, to, length_m: length, inside_length_m: length, source_station_start_m: fragment.start_m, source_station_end_m: fragment.end_m });
  roadMap.push({ public_road_id: index, source_road_index: srcEdge.road, source_id: srcRoad.id, source_part: srcRoad.part, source_edge_id: srcEdge.id, fragment: fragment.fragment });
  const bearing = end => { const p = end ? c.length - 2 : 0; for (let k = end ? p - 2 : 2; end ? k >= 0 : k < c.length; k += end ? -2 : 2) { const dx = c[k] - c[p], dz = c[k + 1] - c[p + 1]; if (Math.hypot(dx, dz) > 1e-9) return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; } throw new Error('Edge zero'); };
  nodeById.get(from).adj.push([index, 0, bearing(false)]); nodeById.get(to).adj.push([index, 1, bearing(true)]);
}
for (const n of nodes) { n.degree = n.adj.length; if (n.kind !== 'boundary') n.kind = n.degree > 2 ? 'junction' : n.degree === 2 ? 'connector' : 'end'; }
const rampClusters = new Set(edges.filter(e => e.rampOf != null).map(e => e.rampOf));
const publicWayIds = new Set(roads.map(road => road.id));
const bridgeClusters = source.bridges.clusters.flatMap(cluster => {
  const publicRoads = cluster.roads.flatMap(r => bySourceRoad.get(r) || []);
  return publicRoads.length || rampClusters.has(cluster.id) ? [{ ...cluster, roads: publicRoads, wayIds: cluster.wayIds.filter(id => publicWayIds.has(id)), source_roads: cluster.roads, source_way_ids: cluster.wayIds }] : [];
});
const graph = { ...source, version: 'public-north-2', region: 'bac', roads, nodes, edges,
  bridges: { clusters: bridgeClusters, config: source.bridges.config, classPeakY: source.bridges.classPeakY, clearance: source.bridges.clearance, deckThicknessM: source.bridges.deckThicknessM },
  stats: { roads: roads.length, nodes: nodes.length, edges: edges.length, sourceRoads: source.roads.length } };
const buildingMap = [], buildings = [], byBuilding = new Map();
const allocatedIds = new Set(sceneSource.buildings.map(b => b.id)); let derivedId = 9000000000000;
const usedBuildingIds = new Set();
for (const part of clipped.layers.buildings) {
  const b = sceneSource.buildings[part.source_index];
  while (allocatedIds.has(derivedId)) derivedId++;
  const id = part.fragment || usedBuildingIds.has(b.id) ? derivedId++ : b.id; allocatedIds.add(id); usedBuildingIds.add(id);
  buildings.push({ ...b, id, r: part.r, center: part.center, source_id: b.id, source_index: part.source_index, fragment: part.fragment });
  buildingMap.push({ public_building_id: id, source_id: b.id, source_index: part.source_index, fragment: part.fragment });
  const ids = byBuilding.get(b.id) || []; ids.push(id); byBuilding.set(b.id, ids);
}
const bbox = points => [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
const scene = { ...sceneSource, region: 'bac', meta: { ...sceneSource.meta, region: 'bac', bbox: bbox(polygon), renderedBuildings: buildings.length, roads: roads.length, sourceSceneSha256: inputs.get(P + 'data/scene.json').sha256 }, roads: sceneRoads, buildings,
  water: clipped.layers.water.map(p => p.r), green: clipped.layers.green.map(p => p.r) };
const bac = [
  ['Bac-01', 12310895540, 'Phan Đăng Lưu × Lê Quang Định', 'Bac-01'],
  ['Bac-01-02', 2351201590, 'Phan Đăng Lưu × Lê Quang Định', 'Bac-01'],
  ['Bac-02', 366376129, 'Ung Văn Khiêm × Nguyễn Gia Trí', 'Bac-02'],
  ['Bac-03', 366416151, 'Ung Văn Khiêm × Nguyễn Văn Thương', 'Bac-03'],
  ['Bac-04', 7975327079, 'Điện Biên Phủ × Nguyễn Văn Thương', 'Bac-04'],
  ['Bac-05', 2028465981, 'Điện Biên Phủ × Nguyễn Hữu Cảnh', 'Bac-05']
];
const nodeMap = [...nodeSeed, ...bac.map(([node_id, osm_id, label, cluster_id]) => ({ node_id, osm_id, label, cluster_id, prefix: 'Bac', has_vms: ['Bac-01', 'Bac-05'].includes(cluster_id) }))].map(meta => {
  const n = nodeById.get(meta.osm_id); assert(n?.degree > 0, `Target thiếu cạnh thật: ${meta.osm_id}`);
  return { ...meta, x: n.x, z: n.z, index: nodes.indexOf(n), junction_id: meta.cluster_id };
});
const rank = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, unclassified: 1 };
function axisOf(osm) {
  const n = nodeSource.get(osm).n, candidates = new Map();
  for (const [e] of n.adj) { const edge = source.edges[e], road = source.roads[edge.road], list = candidates.get(edge.way) || []; list.push({ edge, road }); candidates.set(edge.way, list); }
  const best = [...candidates.values()].sort((a, b) => (rank[b[0].road.type.replace(/_link$/, '')] || 0) - (rank[a[0].road.type.replace(/_link$/, '')] || 0) || b.reduce((s, e) => s + e.edge.length, 0) - a.reduce((s, e) => s + e.edge.length, 0))[0];
  let x = 0, z = 0; for (const { edge } of best) { const c = edge.c, end = edge.to === osm, k = end ? c.length - 2 : 0, j = end ? k - 2 : 2, angle = Math.atan2(c[j + 1] - c[k + 1], c[j] - c[k]); x += Math.cos(angle * 2) * edge.length; z += Math.sin(angle * 2) * edge.length; }
  return (Math.atan2(z, x) * 90 / Math.PI + 180) % 180;
}
const signalRows = [...SIGNAL_PLAN_32, ...bac.map(([node_id, osm_id, name], i) => ({ node_id, osm_id, name, group_axis_deg: axisOf(osm_id), offset_s: i * 8 }))];
const cameras = cameraSeed.map(c => ({ ...c, cluster_id: nodeMap.find(n => n.node_id === c.node_id).cluster_id, junction_id: nodeMap.find(n => n.node_id === c.node_id).cluster_id }));
for (const [i, cluster] of [...new Set(bac.map(r => r[3]))].entries()) {
  const n = nodeMap.find(n => n.cluster_id === cluster), angle = axisOf(n.osm_id) * Math.PI / 180;
  const x = n.x + Math.cos(angle) * 24, z = n.z + Math.sin(angle) * 24;
  cameras.push({ camera_id: `CAM-BAC-${String(i + 1).padStart(3, '0')}`, node_id: n.node_id, cluster_id: cluster, junction_id: cluster, x, z, height_m: 14,
    yaw_deg: (Math.atan2(n.z - z, n.x - x) * 180 / Math.PI + 360) % 360, pitch_deg: -Math.atan2(14 - (nodeById.get(n.osm_id).y ?? 1), 24) * 180 / Math.PI, fov_deg: 68, range_m: 90, label: `${n.label} · góc quan sát Bắc`, pose_source: { osm_id: n.osm_id, target: [n.x, nodeById.get(n.osm_id).y ?? 1, n.z], method: 'source road axis; look at topology node' } });
}
const junctions = [...new Set(nodeMap.map(n => n.cluster_id))].map(id => ({ junction_id: id, node_ids: nodeMap.filter(n => n.cluster_id === id).map(n => n.node_id), label: nodeMap.find(n => n.cluster_id === id).label }));
const remapRoadRows = rows => rows.flatMap(row => (bySourceRoad.get(row.road) || []).filter(i => roads[i].id === row.way).map(road => ({ ...row, road, source_road_index: row.road })));
const remapBuildingRows = rows => rows.flatMap(row => (byBuilding.get(row.id) || []).map(id => ({ ...row, id, source_id: row.id })));
const publicFurniture = { ...furniture, crossings: remapRoadRows(furniture.crossings), hiddenFootways: remapRoadRows(furniture.hiddenFootways), generated: { script: 'scripts/build_public_north.mjs', source: inputs.get(P + 'data/street-furniture-31.json') } };
publicFurniture.stats = { crossings: publicFurniture.crossings.length, zebraCrossings: publicFurniture.crossings.filter(r => r.zebra).length, hiddenFootways: publicFurniture.hiddenFootways.length };
const publicCorrections = { ...corrections, buildings: remapBuildingRows(corrections.buildings), signatureSkipped: [], nguyenHueReported: [], generated: { script: 'scripts/build_public_north.mjs', source: inputs.get(P + 'data/bridge-corrections-31.json') },
  footbridges: { ...corrections.footbridges, ways: remapRoadRows(corrections.footbridges.ways).map(row => ({ ...row, stairs: row.stairs.flatMap(s => { const index = stairs.findIndex(t => t.key === `${row.way}:${row.stairs.indexOf(s)}`); return clipped.fragments.filter(f => f.source_edge_id === `stairs:${index}`).map(f => ({ ...s, points: Array.from({ length: f.c.length / 2 }, (_, k) => f.c.slice(k * 2, k * 2 + 2)), lengthM: f.length, fragment: f.fragment })); }) })) } };
publicCorrections.stats = { entries: publicCorrections.buildings.length, byAction: Object.fromEntries(['hide', 'raise-min'].map(k => [k, publicCorrections.buildings.filter(b => b.action === k).length])) };
const ways = new Set(roads.map(r => r.id));
const publicSignatures = { ...signatures, generated: { script: 'scripts/build_public_north.mjs', source: inputs.get(P + 'data/signature-registry-31.json') }, unresolved: [], entries: signatures.entries.flatMap(e => {
  if (e.kind === 'module') return [];
  if (e.kind === 'zone') { const zi = zones.indexOf(e), parts = clipped.layers.zones.filter(p => p.source_id.startsWith(`${zi}:`)), polygons = parts.map(p => p.r[0]); return polygons.length ? [{ ...e, zone: { ...e.zone, polygons, bbox: bbox(polygons.flat()) } }] : []; }
  const ids = e.kind === 'building' ? e.ids.flatMap(id => byBuilding.get(id) || []) : e.ids.filter(id => ways.has(id));
  return ids.length ? [{ ...e, ids, offScene: [] }] : [];
}) };
const records = Object.fromEntries(Object.entries(semantic.records).flatMap(([id, value]) => (byBuilding.get(Number(id)) || []).map(pid => [pid, value])));
const publicSemantic = { ...semantic, records, renderedBuildings: buildings.length, directTaggedBuildings: Object.keys(records).length, directCoveragePercent: Object.keys(records).length * 100 / buildings.length,
  directTagCounts: Object.fromEntries(Object.keys(semantic.directTagCounts).map(tag => [tag, Object.values(records).filter(record => record[tag] != null).length])), sourceSemanticSha256: semantic.sha256 };
delete publicSemantic.sha256;
const heatColumns = new Map(heatSource.edges.map((e, i) => [e, i]));
const heatEdges = edges.filter(e => heatColumns.has(e.source_edge_id));
const heat = { ...heatSource, ne: edges.length, edges: heatEdges.map(e => e.id), levels: Array.from({ length: heatSource.hours }, (_, h) => heatEdges.map(e => heatSource.levels[h * heatSource.edges.length + heatColumns.get(e.source_edge_id)])).flat(), method: 'Lịch sử nguồn classic được remap theo source edge; chưa phải benchmark mạng public.', source: inputs.get(P + 'data/heat-history-32.json') };
const provenance = [...inputs.values()];
const sourceMeta = { graph: P + 'data/road-graph-31.json', graphSha256: inputs.get(P + 'data/road-graph-31.json').sha256, scene: P + 'data/scene.json', sceneSha256: inputs.get(P + 'data/scene.json').sha256, polygon, sourceBytesRule: 'raw checkout bytes; no EOL normalization', inputs: provenance };
const sidecars = { schemaVersion: 1, region: 'bac', provenance, signalRows, nodeMapUrl: '../smart-traffic/backend/app/seed/public-north/node_map.json', camerasUrl: '../smart-traffic/backend/app/seed/public-north/cameras.json', heatHistoryUrl: 'data/public-north/heat-history-32.json', globals: { STREET_FURNITURE_31: publicFurniture, BRIDGE_CORRECTIONS_31: publicCorrections, SIGNATURE_REGISTRY_31: publicSignatures, SEMANTIC_MATERIALS_08: publicSemantic, WEBGPU_CORRECTIONS_24: { version: webgpuCorrections.version }, BA_SON_BRIDGE: null, BACH_DANG_FOOTBRIDGE: null } };
const mapping = { schemaVersion: 1, region: 'bac', source: sourceMeta, edgeMap, roadMap, nodeMap: nodes.map(n => ({ public_node_id: n.id, source_node_id: n.source_id, source_node_index: n.source_node_index, source_edge_id: n.source_edge_id, source_station_m: n.source_station_m, x: n.x, z: n.z, layer: n.layer, boundary: n.kind === 'boundary' })), buildingMap, junctions, repairs: clipped.repairs };
assert.equal(new Set(edges.map(e => e.source_edge_id)).size, 6815, 'Coverage source edge giao dương');
assert.equal(new Set(buildings.map(b => b.id)).size, buildings.length, 'Building part ID phải duy nhất');
assert.equal(roads.length, sceneRoads.length); assert.equal(junctions.length, 10); assert.equal(nodeMap.length, 12); assert(cameras.length >= 15);
for (const [i, e] of edges.entries()) { assert.equal(e.id, i); assert.equal(e.road, i); assert(nodeById.has(e.from) && nodeById.has(e.to)); assert.deepEqual(sceneRoads[i].c.flat(), e.c); assert.equal(roads[i].nodes.length, e.c.length / 2); }
const outputs = new Map();
const put = (path, value) => outputs.set(path, Buffer.from(JSON.stringify(value) + '\n'));
put(P + 'data/public-north/road-graph.json', graph); put(P + 'data/public-north/scene.json', scene);
outputs.set(P + 'data/public-north/scene.js', Buffer.from(`// Generated by scripts/build_public_north.mjs\nwindow.CITY_DATA=${JSON.stringify(scene)};\n`));
put(P + 'data/public-north/mapping.json', mapping); put(P + 'data/public-north/runtime-sidecars.json', sidecars); put(P + 'data/public-north/heat-history-32.json', heat);
put(SEED + 'public-north/node_map.json', nodeMap); put(SEED + 'public-north/cameras.json', cameras);
const files = [...outputs].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) }));
const manifest = { schemaVersion: 1, region: 'bac', build: 'public-demo-v1', source: sourceMeta, attribution: source.attribution, stats: { roads: roads.length, nodes: nodes.length, edges: edges.length, buildings: buildings.length, sceneRoads: sceneRoads.length, sourceRoads: source.roads.length, sourceEdges: 6815, junctions: junctions.length, cameras: cameras.length }, files };
put(P + 'data/public-north/manifest.json', manifest);
for (const [path, bytes] of outputs) { assert(bytes.length < 25 * 1024 * 1024, `Tệp vượt giới hạn Pages: ${path}`); const target = join(outRoot, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target + '.tmp', bytes); }
for (const [path] of outputs) { const target = join(outRoot, path); renameSync(target + '.tmp', target); }
console.log(JSON.stringify({ region: 'bac', stats: manifest.stats, files }, null, 2));
