import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { verifyArtifacts } from '../artifacts.mjs';

test('CAM-01 · artifact có dữ liệu Bắc và entry camera không kéo cảnh classic', () => {
  assert.ok(process.env.HARDTEST_RELEASE_MANIFEST, 'Cần manifest của ứng viên.');
  const manifestPath = resolve(process.env.HARDTEST_RELEASE_MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.commit, process.env.HARDTEST_COMMIT);
  const parent = dirname(manifestPath);
  verifyArtifacts(manifest, { vercel: join(parent, 'vercel'), pages: join(parent, 'pages') });
  const files = new Set(manifest.artifacts.pages.files.map(file => file.path));
  const northManifest = [...files].find(path => /(?:^|\/)public-north\/manifest\.json$/.test(path));
  const northScene = [...files].find(path => /(?:^|\/)public-north\/scene\.json$/.test(path));
  assert.ok(northManifest, 'Pages artifact thiếu manifest dữ liệu public-north.');
  assert.ok(northScene, 'Pages artifact thiếu scene public-north.');
  assert.ok(![...files].some(path => /(?:^|\/)data\/scene\.js$/.test(path)), 'Artifact không được chứa scene classic toàn vùng.');
  const pagesNorth = join(parent, 'pages', northManifest);
  assert.ok(existsSync(pagesNorth), `Thiếu tài nguyên Pages ${northManifest}.`);
  const payload = JSON.parse(readFileSync(pagesNorth, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(payload.region, 'bac');
  assert.ok(statSync(join(parent, 'pages', northScene)).size < 25 * 1024 ** 2);
  const find = suffix => {
    const path = [...files].find(path => path.endsWith(suffix));
    assert.ok(path, `Pages artifact thiếu ${suffix}`);
    return JSON.parse(readFileSync(join(parent, 'pages', path), 'utf8').replace(/^\uFEFF/, ''));
  };
  const scene = find('public-north/scene.json');
  const graph = find('public-north/road-graph.json');
  const config = find('public-north/runtime-sidecars.json');
  const cameras = find('public-north/cameras.json');
  const nodeMap = find('public-north/node_map.json');
  assert.ok(scene.roads?.length > 0 && scene.buildings?.length > 0, 'CAM artifact scene rỗng hoặc thiếu geometry');
  assert.ok(graph.edges?.length > 0 && graph.nodes?.length > 0, 'CAM artifact graph rỗng');
  assert.equal(scene.roads.length, graph.roads.length, 'CAM artifact graph/scene lệch road');
  const ids = new Set(graph.nodes.map(n => n.id));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to), 'CAM artifact thiếu topology endpoint');
    assert.deepEqual(scene.roads[edge.road]?.c.flat(), edge.c, 'CAM artifact scene/edge geometry lệch');
    assert.ok(graph.roads[edge.road]?.edges.includes(edge.id), 'CAM artifact road.edges thiếu');
  }
  assert.ok(graph.nodes.every(n => n.adj?.length > 0), 'CAM artifact adjacency rỗng');
  assert.equal(config.region, 'bac');
  assert.equal(config.signalRows?.length, 12, 'CAM artifact cần 12 signal rows');
  assert.equal(new Set(nodeMap.map(n => n.cluster_id)).size, 10, 'CAM artifact cần 10 cụm');
  for (const osm of [12310895540, 2351201590]) assert.ok(nodeMap.some(n => n.osm_id === osm), 'CAM artifact Bac-01 thiếu OSM');
  assert.ok(cameras.length >= 15, 'CAM artifact tối thiểu 15 camera');
  for (let n = 1; n <= 10; n++) assert.ok(cameras.some(c => c.camera_id === `CAM-HX-${String(n).padStart(3, '0')}`), 'CAM artifact mất camera cũ');
  for (let n = 1; n <= 5; n++) assert.ok(cameras.some(c => c.camera_id === `CAM-BAC-${String(n).padStart(3, '0')}`), 'CAM artifact mất góc Bắc');
});
