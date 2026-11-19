import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyReleaseInputs } from './evidence.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'smtf-evidence-test-'));
  const commit = '1'.repeat(40);
  const contractDigest = '2'.repeat(64);
  const artifactPath = join(dir, 'capture.txt');
  const manifestPath = join(dir, 'manifest.json');
  const evidencePath = join(dir, 'evidence.json');
  t.after(() => {
    for (const file of [artifactPath, manifestPath, evidencePath]) rmSync(file, { force: true });
    rmdirSync(dir);
  });
  const identity = { schemaVersion: 1, commit, contractDigest };
  const capture = 'synthetic test evidence';
  const artifacts = [{ path: 'capture.txt', sha256: createHash('sha256').update(capture).digest('hex') }];
  const evidence = {
    ...identity,
    releaseManifestDigest: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    checks: ['CAM-01', 'USER-01', 'PERF-01'].map(id => ({ id, artifacts })),
  };
  const writeEvidence = () => writeFileSync(evidencePath, JSON.stringify(evidence));
  writeFileSync(artifactPath, capture);
  writeFileSync(manifestPath, JSON.stringify(identity));
  writeEvidence();
  return { artifactPath, evidence, writeEvidence, input: { manifestPath, evidencePath, commit, contractDigest } };
}

test('binds both release inputs and their referenced nonempty artifacts', t => {
  const { input } = fixture(t);
  const result = verifyReleaseInputs(input);
  assert.equal(result.ok, true);
  assert.match(result.releaseManifestDigest, /^[0-9a-f]{64}$/);
  assert.match(result.evidenceDigest, /^[0-9a-f]{64}$/);
});

test('rejects an evidence record from another commit', t => {
  const { input, evidence, writeEvidence } = fixture(t);
  evidence.commit = 'f'.repeat(40);
  writeEvidence();
  assert.equal(verifyReleaseInputs(input).ok, false);
});

test('rejects evidence reused for different artifacts from the same commit', t => {
  const { input, evidence } = fixture(t);
  writeFileSync(input.manifestPath, JSON.stringify({
    schemaVersion: 1, commit: evidence.commit, contractDigest: evidence.contractDigest, build: 'second',
  }));
  assert.match(verifyReleaseInputs(input).errors.join(' '), /SHA-256 của manifest/);
});

test('rejects a missing manual check and an artifact changed after capture', t => {
  const { artifactPath, input, evidence, writeEvidence } = fixture(t);
  writeFileSync(artifactPath, 'change after capture');
  assert.equal(verifyReleaseInputs(input).ok, false);
  evidence.checks.pop();
  writeEvidence();
  assert.equal(verifyReleaseInputs(input).ok, false);
});
