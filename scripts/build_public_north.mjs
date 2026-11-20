#!/usr/bin/env node
/**
 * Sinh artifact dữ liệu public khu Bắc từ graph/cảnh 31A.
 * Bộ sinh giữ fragment cắt theo đa giác, node biên và mapping nguồn để các
 * sidecar không thể vô tình dùng lại chỉ mục của cảnh classic.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'outputs/hcmc-poc/data');
const OUT = join(DATA, 'public-north');
const SEED = join(ROOT, 'outputs/smart-traffic/backend/app/seed');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (path, value) => {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return { path: path.slice(ROOT.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) };
};

function inside(x, z, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segmentParam(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? Math.max(0, Math.min(1, t)) : null;
}

function clipPolyline(points, polygon) {
  const fragments = [];
  let current = [];
  const flush = () => { if (current.length > 1) fragments.push(current); current = []; };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i], b = points[i + 1], ts = [0, 1];
    for (let j = 0; j < polygon.length; j += 1) {
      const t = segmentParam(a, b, polygon[j], polygon[(j + 1) % polygon.length]);
      if (t !== null) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const unique = ts.filter((t, index) => index === 0 || Math.abs(t - ts[index - 1]) > 1e-8);
    for (let k = 0; k < unique.length - 1; k += 1) {
      const t0 = unique[k], t1 = unique[k + 1], mid = (t0 + t1) / 2;
      if (!inside(a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid, polygon)) { flush(); continue; }
      const p0 = [+(a[0] + (b[0] - a[0]) * t0).toFixed(6), +(a[1] + (b[1] - a[1]) * t0).toFixed(6)];
      const p1 = [+(a[0] + (b[0] - a[0]) * t1).toFixed(6), +(a[1] + (b[1] - a[1]) * t1).toFixed(6)];
      if (!current.length) current.push(p0);
      else if (Math.hypot(current.at(-1)[0] - p0[0], current.at(-1)[1] - p0[1]) > 1e-5) { flush(); current.push(p0); }
      if (Math.hypot(current.at(-1)[0] - p1[0], current.at(-1)[1] - p1[1]) > 1e-5) current.push(p1);
    }
  }
  flush();
  return fragments;
}

function flattenRoadPoints(road, nodeById) {
  return (road.nodes || []).map(id => nodeById.get(id)).filter(Boolean).map(node => [node.x, node.z]);
}

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const denominator = dx * dx + dz * dz;
  const t = denominator > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / denominator)) : 0;
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

function pointPolylineDistance(point, flat) {
  let best = Infinity;
  for (let index = 2; index < flat.length; index += 2) best = Math.min(best, pointSegmentDistance(point, [flat[index - 2], flat[index - 1]], [flat[index], flat[index + 1]]));
  return best;
}

function polylineLength(line) {
  let length = 0;
  for (let index = 1; index < line.length; index += 1) length += Math.hypot(line[index][0] - line[index - 1][0], line[index][1] - line[index - 1][1]);
  return length;
}

function addNode(state, point, sourceId = null, sourceIndex = null, layer = 0, y = 1) {
  const key = `${point[0].toFixed(5)}:${point[1].toFixed(5)}:${layer}:${y.toFixed(3)}`;
  const existing = state.nodeByKey.get(key);
  if (existing !== undefined) return existing;
  const sourceTaken = sourceId != null && state.nodes.some(node => node.id === sourceId);
  const id = sourceId != null && !sourceTaken ? sourceId : -(100000000 + state.nodes.length + 1);
  state.nodeByKey.set(key, id);
  state.nodes.push({ id, x: point[0], z: point[1], y, kind: sourceId == null ? 'boundary' : 'junction', source_id: sourceId, source_node_index: sourceIndex, layer, degree: 0, adj: [] });
  return id;
}

function buildGraph(source, polygon) {
  const nodeById = new Map(source.nodes.map(node => [node.id, node]));
  const sourceEdgesByRoad = new Map();
  for (const edge of source.edges || []) sourceEdgesByRoad.set(edge.road, [...(sourceEdgesByRoad.get(edge.road) || []), edge]);
  const state = { nodes: [], roads: [], edges: [], nodeByKey: new Map(), mapping: [] };
  for (const road of source.roads) {
    const points = flattenRoadPoints(road, nodeById);
    if (points.length < 2) continue;
    const fragments = clipPolyline(points, polygon);
    fragments.forEach((fragment, fragmentIndex) => {
      if (fragment.length < 2) return;
      const publicIndex = state.roads.length;
      const publicNodes = fragment.map((point, index) => {
        const original = points.findIndex(candidate => Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) < 1e-4);
        const sourceNode = original >= 0 ? road.nodes[original] : null;
        const node = sourceNode == null ? null : nodeById.get(sourceNode);
        return addNode(state, point, sourceNode, original >= 0 ? original : null, road.layer || 0, node?.y ?? 1);
      });
      const publicRoad = { index: publicIndex, id: road.id, part: road.part ?? 0, fragment: fragmentIndex, name: road.name, type: road.type, oneway: road.oneway, layer: road.layer || 0, highway: road.highway, bridge: road.bridge, tunnel: road.tunnel, lanes: road.lanes, lanesInferred: road.lanesInferred, elevationClass: road.elevationClass || 'ground', c: fragment.flat(), nodes: publicNodes, source_index: road.index };
      state.roads.push(publicRoad);
      state.mapping.push({ public_index: publicIndex, source_index: road.index, source_id: road.id, source_part: road.part ?? 0, fragment: fragmentIndex });
      const sourceEdges = sourceEdgesByRoad.get(road.index) || [];
      for (let i = 0; i < publicNodes.length - 1; i += 1) {
        const from = publicNodes[i], to = publicNodes[i + 1];
        const c = [fragment[i][0], fragment[i][1], fragment[i + 1][0], fragment[i + 1][1]];
        const midpoint = [(fragment[i][0] + fragment[i + 1][0]) / 2, (fragment[i][1] + fragment[i + 1][1]) / 2];
        const sourceEdge = sourceEdges.reduce((best, candidate) => {
          const distance = pointPolylineDistance(midpoint, candidate.c || []);
          return !best || distance < best.distance ? { edge: candidate, distance } : best;
        }, null)?.edge;
        const edge = { id: state.edges.length, from, to, road: publicIndex, way: road.id, v0: i, v1: i + 1, c, length: Math.hypot(fragment[i + 1][0] - fragment[i][0], fragment[i + 1][1] - fragment[i][1]), source_edge_id: sourceEdge?.id ?? null, oneway: road.oneway, lanes: road.lanes, layer: road.layer || 0, elevationClass: road.elevationClass || 'ground' };
        state.edges.push(edge);
      }
    });
  }
  const degree = new Map();
  state.edges.forEach(edge => { degree.set(edge.from, (degree.get(edge.from) || 0) + 1); degree.set(edge.to, (degree.get(edge.to) || 0) + 1); });
  state.nodes.forEach(node => { node.degree = degree.get(node.id) || 0; });
  const graph = {
    version: 'public-north-1', batch: 'public-demo-v1', region: 'bac', attribution: '© OpenStreetMap contributors, ODbL 1.0.',
    frame: source.frame, schema: { roads: 'roads[i] clipped source road', edges: 'directed clipped fragments', nodes: 'source or deterministic boundary nodes' },
    source: source.source, stats: { roads: state.roads.length, nodes: state.nodes.length, edges: state.edges.length, sourceRoads: source.roads.length },
    roads: state.roads, nodes: state.nodes, edges: state.edges,
  };
  return { graph, mapping: { schemaVersion: 1, region: 'bac', roads: state.mapping, sourceGraphVersion: source.version, sourceGraphSha256: sha256(readFileSync(join(DATA, 'road-graph-31.json'))) } };
}

function intersectsShape(shape, polygon) {
  if (!Array.isArray(shape)) return false;
  const visit = value => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number') return inside(value[0], value[1], polygon);
    return Array.isArray(value) && value.some(visit);
  };
  if (visit(shape)) return true;
  const lines = [];
  const collect = value => { if (Array.isArray(value) && value.length && Array.isArray(value[0]) && typeof value[0][0] === 'number') lines.push(value); else if (Array.isArray(value)) value.forEach(collect); };
  collect(shape);
  return lines.some(line => clipPolyline(line, polygon).length > 0);
}

const regionModule = await import(pathToFileURL(join(ROOT, 'outputs/hcmc-poc/city-region-31.js')).href);
const polygon = regionModule.regionPolygon('bac');
if (!polygon) throw new Error('Không tìm thấy đa giác khu bac');
const sourceGraphBytes = readFileSync(join(DATA, 'road-graph-31.json'));
const sourceSceneBytes = readFileSync(join(DATA, 'scene.json'));
const sourceGraph = JSON.parse(sourceGraphBytes);
const sourceScene = JSON.parse(sourceSceneBytes);
const { graph, mapping } = buildGraph(sourceGraph, polygon);
const sceneRoads = sourceScene.roads.flatMap(road => clipPolyline(road.c, polygon).map((fragment, fragmentIndex) => ({ ...road, c: fragment, source_id: road.id, fragment: fragmentIndex })));
const scene = {
  ...sourceScene,
  meta: { ...sourceScene.meta, region: 'bac', bbox: [Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1])), Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[1]))], renderedBuildings: sourceScene.buildings.filter(building => inside(building.center?.[0] ?? 0, building.center?.[1] ?? 0, polygon)).length, roads: sceneRoads.length, sourceSceneSha256: sha256(sourceSceneBytes) },
  buildings: sourceScene.buildings.filter(building => inside(building.center?.[0] ?? 0, building.center?.[1] ?? 0, polygon)),
  roads: sceneRoads,
  green: sourceScene.green.filter(shape => intersectsShape(shape, polygon)),
  water: sourceScene.water.filter(shape => intersectsShape(shape, polygon)),
  region: 'bac',
};
mkdirSync(OUT, { recursive: true });
// Older drafts emitted executable globals. Remove them so the public artifact
// has one deterministic JSON loading path and cannot accidentally copy classic data.
rmSync(join(OUT, 'scene.js'), { force: true });
rmSync(join(OUT, 'road-graph.js'), { force: true });
const files = [];
files.push(writeJson(join(OUT, 'road-graph.json'), graph));
files.push(writeJson(join(OUT, 'scene.json'), scene));
const sceneJs = `// Generated by scripts/build_public_north.mjs; source SHA ${sha256(sourceSceneBytes)}\nwindow.CITY_DATA=${JSON.stringify(scene)};`;
writeFileSync(join(OUT, 'scene.js'), sceneJs);
files.push({ path: 'outputs/hcmc-poc/data/public-north/scene.js', bytes: Buffer.byteLength(sceneJs), sha256: sha256(sceneJs) });
const sourceNodeMap = readJson(join(SEED, 'node_map.json'));
const sourceCameras = readJson(join(SEED, 'cameras.json'));
const bacNodes = [
  { node_id: 'Bac-01', osm_id: 12310895540, label: 'Phan Đăng Lưu ∩ Lê Quang Định', prefix: 'Bac', x: -1423, z: -2621, cluster_id: 'Bac-01', camera_id: 'CAM-BAC-001', has_vms: true },
  { node_id: 'Bac-02', osm_id: 366376129, label: 'Ung Văn Khiêm ∩ Nguyễn Gia Trí', prefix: 'Bac', x: 532, z: -3165, cluster_id: 'Bac-02', camera_id: 'CAM-BAC-002', has_vms: false },
  { node_id: 'Bac-03', osm_id: 366416151, label: 'Ung Văn Khiêm ∩ Nguyễn Văn Thương', prefix: 'Bac', x: 1116, z: -2731, cluster_id: 'Bac-03', camera_id: 'CAM-BAC-003', has_vms: false },
  { node_id: 'Bac-04', osm_id: 7975327079, label: 'Điện Biên Phủ ∩ Nguyễn Văn Thương', prefix: 'Bac', x: 706, z: -2303, cluster_id: 'Bac-04', camera_id: 'CAM-BAC-004', has_vms: false },
  { node_id: 'Bac-05', osm_id: 2028465981, label: 'Điện Biên Phủ ∩ Nguyễn Hữu Cảnh', prefix: 'Bac', x: 935, z: -2112, cluster_id: 'Bac-05', camera_id: 'CAM-BAC-005', has_vms: true },
];
const bacCameras = bacNodes.map((node, index) => ({ camera_id: node.camera_id, node_id: node.node_id, cluster_id: node.cluster_id, x: node.x + 18, z: node.z - 16, height_m: 10, yaw_deg: [132, 224, 314, 46, 136][index], pitch_deg: -24, fov_deg: 68, range_m: 80, label: `${node.label} · góc public ${index + 1}` }));
const junctions = [
  ...[...new Map(sourceNodeMap.map(node => [node.cluster_id, node])).entries()].map(([clusterId, node]) => ({ junction_id: clusterId, node_ids: sourceNodeMap.filter(item => item.cluster_id === clusterId).map(item => item.node_id), label: node.label.split(' ∩ ')[0], source: 'seed/node_map.json' })),
  ...bacNodes.map(node => ({ junction_id: node.cluster_id, node_ids: [node.node_id], label: node.label, source: 'builder:public-north' })),
];
const edgeMap = graph.edges.map(edge => {
  const road = graph.roads[edge.road];
  return { public_edge_id: edge.id, source_edge_id: edge.source_edge_id, source_road_index: road?.source_index ?? null, public_road_id: edge.road, from: edge.from, to: edge.to, length_m: edge.length, inside_length_m: edge.length };
});
const sourceEdgeById = new Map((sourceGraph.edges || []).map(edge => [edge.id, edge]));
for (const row of edgeMap) {
  const sourceEdge = sourceEdgeById.get(row.source_edge_id);
  if (!sourceEdge) continue;
  const clipped = clipPolyline(Array.from({ length: sourceEdge.c.length / 2 }, (_, index) => [sourceEdge.c[index * 2], sourceEdge.c[index * 2 + 1]]), polygon);
  row.inside_length_m = clipped.reduce((sum, line) => sum + polylineLength(line), 0);
  row.clipped_fragments = clipped.length;
}
const representedSourceEdges = new Set(edgeMap.map(row => row.source_edge_id).filter(id => id != null));
for (const sourceEdge of sourceGraph.edges || []) {
  if (representedSourceEdges.has(sourceEdge.id)) continue;
  const clipped = clipPolyline(Array.from({ length: sourceEdge.c.length / 2 }, (_, index) => [sourceEdge.c[index * 2], sourceEdge.c[index * 2 + 1]]), polygon);
  const insideLength = clipped.reduce((sum, line) => sum + polylineLength(line), 0);
  if (insideLength <= 0) continue;
  edgeMap.push({ public_edge_id: `source-${sourceEdge.id}`, source_edge_id: sourceEdge.id, source_road_index: sourceEdge.road, source_node_from: sourceEdge.from, source_node_to: sourceEdge.to, length_m: sourceEdge.length, inside_length_m: insideLength, clipped_fragments: clipped.length });
}
mapping.source = { graphSha256: sha256(sourceGraphBytes), sceneSha256: sha256(sourceSceneBytes), graph: 'outputs/hcmc-poc/data/road-graph-31.json', scene: 'outputs/hcmc-poc/data/scene.json', polygon };
mapping.edgeMap = edgeMap;
mapping.nodeMap = graph.nodes.map(node => ({ public_node_id: node.id, source_node_id: node.source_id, source_node_index: node.source_node_index, x: node.x, z: node.z, layer: node.layer, boundary: node.source_id == null }));
mapping.roadMap = graph.roads.map(road => ({ public_road_id: road.index, source_road_index: road.source_index, source_id: road.id, source_part: road.part, fragment: road.fragment }));
mapping.junctions = junctions;
const publicNodeMap = sourceNodeMap.map(node => ({ ...node, junction_id: node.cluster_id })).filter(node => ['HX-C1', 'HX-C2', 'HX-C3', 'HX-C4', 'HX-C5'].includes(node.cluster_id)).slice(0, 6);
const chosenHxCameras = ['CAM-HX-001', 'CAM-HX-005', 'CAM-HX-007', 'CAM-HX-009', 'CAM-HX-002'];
const hxCameras = sourceCameras.filter(camera => chosenHxCameras.includes(camera.camera_id)).map(camera => ({ ...camera, cluster_id: sourceNodeMap.find(node => node.node_id === camera.node_id)?.cluster_id, junction_id: sourceNodeMap.find(node => node.node_id === camera.node_id)?.cluster_id }));
const publicCameras = [...hxCameras, ...bacCameras.map(camera => ({ ...camera, junction_id: camera.cluster_id }))];
files.push(writeJson(join(OUT, 'mapping.json'), mapping));
files.push(writeJson(join(SEED, 'public-north/node_map.json'), [...publicNodeMap, ...bacNodes.map(node => ({ ...node, junction_id: node.cluster_id }))]));
files.push(writeJson(join(SEED, 'public-north/cameras.json'), publicCameras));
const manifest = { schemaVersion: 1, region: 'bac', build: 'public-demo-v1', source: { graph: 'outputs/hcmc-poc/data/road-graph-31.json', graphSha256: sha256(sourceGraphBytes), scene: 'outputs/hcmc-poc/data/scene.json', sceneSha256: sha256(sourceSceneBytes), polygon }, attribution: '© OpenStreetMap contributors, ODbL 1.0. Cao độ cầu là ước lượng minh họa, không khảo sát.', stats: { roads: graph.roads.length, nodes: graph.nodes.length, edges: graph.edges.length, buildings: scene.buildings.length, sceneRoads: scene.roads.length, sourceRoads: sourceGraph.roads.length, endpointOutsidePreserved: [23217, 23534].filter(id => edgeMap.some(row => Number(row.source_edge_id) === id)).length, junctions: junctions.length, cameras: publicCameras.length }, files };
files.push(writeJson(join(OUT, 'manifest.json'), manifest));
console.log(JSON.stringify({ region: 'bac', output: OUT, stats: manifest.stats, files }, null, 2));
