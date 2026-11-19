import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { verifyArtifacts } from '../artifacts.mjs';

test('PUB-01 · gói tĩnh đúng manifest, đủ lối vào và ghim phiên bản Pages', () => {
  assert.ok(process.env.HARDTEST_RELEASE_MANIFEST, 'Cần manifest của ứng viên.');
  const manifestPath = resolve(process.env.HARDTEST_RELEASE_MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.commit, process.env.HARDTEST_COMMIT);
  assert.equal(manifest.contractDigest, process.env.HARDTEST_CONTRACT_DIGEST);
  assert.match(manifest.pagesOrigin, /^https:\/\/[a-f0-9]{8,}\.[a-z\d-]+\.pages\.dev$/,
    'Dùng URL deployment theo hash, không dùng alias của nhánh.');

  const parent = dirname(manifestPath);
  const vercel = join(parent, 'vercel');
  verifyArtifacts(manifest, { vercel, pages: join(parent, 'pages') });
  const prebuilt = join(vercel, '.vercel/output/static');
  const staticRoot = existsSync(prebuilt) ? prebuilt : vercel;
  for (const file of ['index.html', 'hcmc-poc/index.html', 'index-officer.html', 'index-citizen.html']) {
    assert.ok(existsSync(join(staticRoot, file)), `Gói web thiếu điểm vào ${file}.`);
  }
});
