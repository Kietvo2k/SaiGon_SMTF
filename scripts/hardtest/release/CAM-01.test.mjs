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
});
