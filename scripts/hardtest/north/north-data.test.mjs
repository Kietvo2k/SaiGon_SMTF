import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  assertNorthOnlyRuntime,
  clippedLength,
  pointOutsideEndpoints,
  region,
  requireMapping,
  sha256,
} from './oracle.mjs';

const root = resolve('.');
const publicRoot = join(root, 'outputs/hcmc-poc/data/public-north');
const seedRoot = join(root, 'outputs/smart-traffic/backend/app/seed/public-north');
const required = ['manifest.json', 'road-graph.json', 'scene.json', 'mapping.json'];

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function must(path, label = path) { assert.ok(existsSync(path), `Thiếu ${label}: ${path}`); }

test('PUB-01 manifest public Bắc có hash/byte và không kéo nguồn thô', () => {
  must(join(publicRoot, 'manifest.json'));
  const manifest = readJson(join(publicRoot, 'manifest.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.region, 'bac');
  assert.ok(manifest.source?.graphSha256 && manifest.source?.sceneSha256);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= required.length);
  const paths = new Set();
  for (const file of manifest.files) {
    assert.ok(file.path && !file.path.includes('..'), `Đường dẫn manifest không an toàn: ${file.path}`);
    assert.ok(!/osm-raw|overture-region|accounts\.json|owners\.json|(?:^|\/)data\/scene\.js$|(?:^|\/)road-graph-31\.js$/.test(file.path), `Manifest kéo nguồn cấm: ${file.path}`);
    assert.ok(!paths.has(file.path), `Manifest trùng đường dẫn: ${file.path}`);
    paths.add(file.path);
    const absolute = join(root, file.path);
    must(absolute, `tài nguyên ${file.path}`);
    const bytes = readFileSync(absolute);
    assert.equal(bytes.length, file.bytes, `Byte lệch ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `Hash lệch ${file.path}`);
    assert.ok(bytes.length < 25 * 1024 ** 2, `Tệp Pages vượt 25 MiB: ${file.path}`);
  }
  for (const file of required) assert.ok(paths.has(`outputs/hcmc-poc/data/public-north/${file}`), `Manifest thiếu ${file}`);
});

test('PUB-01 entry/runtime không tải cảnh toàn vùng và không prewarm tất cả vùng', () => {
  const htmlPath = join(root, 'outputs/hcmc-poc/webgpu-materials-24.html');
  const runtimePath = join(root, 'outputs/hcmc-poc/webgpu-materials-24.js');
  must(htmlPath); must(runtimePath);
  assertNorthOnlyRuntime(readFileSync(htmlPath, 'utf8'), readFileSync(runtimePath, 'utf8'));
});

test('PUB-01 mapping đóng đủ tham chiếu graph/scene/sidecar', () => {
  const mapping = readJson(join(publicRoot, 'mapping.json'));
  requireMapping(mapping);
  assert.ok(mapping.source?.graphSha256 || mapping.graphSha256, 'Mapping thiếu provenance graph.');
  assert.ok(mapping.source?.sceneSha256 || mapping.sceneSha256, 'Mapping thiếu provenance scene.');
});

test('SIM-01 graph public có 10 cụm và 10 camera hợp lệ', () => {
  const graph = readJson(join(publicRoot, 'road-graph.json'));
  const mapping = readJson(join(publicRoot, 'mapping.json'));
  assert.ok(Array.isArray(graph.nodes) && graph.nodes.length > 0);
  assert.ok(Array.isArray(graph.edges) && graph.edges.length > 0);
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  for (const edge of graph.edges) {
    assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), `Cạnh tham chiếu node thiếu: ${edge.id}`);
    assert.ok(Array.isArray(edge.c) && edge.c.length >= 2, `Cạnh thiếu hình học: ${edge.id}`);
    assert.ok(edge.layer !== undefined || edge.elevationClass, `Cạnh thiếu layer/elevation: ${edge.id}`);
  }
  const junctions = mapping.junctions ?? mapping.clusters;
  assert.ok(Array.isArray(junctions), 'Mapping thiếu junctions/clusters.');
  const junctionIds = new Set(junctions.map(row => row.junction_id ?? row.cluster_id ?? row.id));
  for (const id of ['HX-C1', 'HX-C2', 'HX-C3', 'HX-C4', 'HX-C5', 'Bac-01', 'Bac-02', 'Bac-03', 'Bac-04', 'Bac-05']) {
    assert.ok(junctionIds.has(id), `Thiếu cụm ${id}`);
  }
  const cameras = readJson(join(seedRoot, 'cameras.json'));
  assert.ok(Array.isArray(cameras) && cameras.length === 10, 'Public Bắc phải có đúng 10 camera.');
  for (const camera of cameras) {
    assert.match(camera.camera_id, /^CAM-[A-Z0-9-]+-\d{3}$/);
    assert.ok(junctionIds.has(camera.junction_id ?? camera.cluster_id), `Camera ngoài registry: ${camera.camera_id}`);
  }
});

test('SIM-01 clip polyline giữ cạnh hai đầu ngoài xuyên vùng', () => {
  const source = readJson(join(root, 'outputs/hcmc-poc/data/road-graph-31.json'));
  const mapping = readJson(join(publicRoot, 'mapping.json'));
  const edgeRows = mapping.edgeMap.filter(row => [23217, 23534].includes(Number(row.source_edge_id ?? row.sourceEdgeId)));
  assert.equal(edgeRows.length, 2, 'Phải giữ mapping cho edge 23217 và 23534.');
  for (const sourceId of [23217, 23534]) {
    const original = source.edges.find(edge => Number(edge.id) === sourceId);
    assert.ok(original, `Thiếu source edge ${sourceId}`);
    assert.ok(pointOutsideEndpoints(original.c, region), `Fixture edge ${sourceId} phải có hai đầu ngoài.`);
    const expected = clippedLength(original.c, region);
    const fragments = edgeRows.filter(row => Number(row.source_edge_id ?? row.sourceEdgeId) === sourceId);
    const actual = fragments.reduce((sum, row) => sum + Number(row.inside_length_m ?? row.length_m ?? row.length ?? 0), 0);
    assert.ok(expected > 0, `Edge ${sourceId} phải giao vùng.`);
    assert.ok(actual > 0, `Edge ${sourceId} bị lọc theo endpoint.`);
    assert.ok(Math.abs(actual - expected) / expected < 0.08, `Độ dài clip edge ${sourceId} lệch oracle.`);
  }
});

test('CAM-01 mỗi camera có pose đủ dùng và nằm trong phạm vi Bắc', () => {
  const cameras = readJson(join(seedRoot, 'cameras.json'));
  for (const camera of cameras) {
    for (const key of ['x', 'z', 'height_m', 'yaw_deg', 'pitch_deg', 'fov_deg']) assert.equal(typeof camera[key], 'number', `${camera.camera_id} thiếu ${key}`);
    assert.ok(camera.height_m > 1 && camera.height_m < 50);
    assert.ok(camera.fov_deg > 20 && camera.fov_deg < 140);
  }
});

test('CAM-01 không dùng file scene classic toàn vùng làm tài nguyên public', () => {
  assert.ok(!existsSync(join(publicRoot, 'road-graph-31.js')), 'Không được copy graph classic nguyên file.');
  assert.ok(statSync(join(publicRoot, 'scene.json')).size < 25 * 1024 ** 2);
  assert.ok(statSync(join(publicRoot, 'scene.js')).size < 25 * 1024 ** 2);
});
