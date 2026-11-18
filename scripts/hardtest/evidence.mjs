import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const manualIds = ['CAM-01', 'USER-01', 'PERF-01'];

function boundDocument(file, name, commit, contractDigest) {
  if (!file) throw new Error(`Cần đặt ${name}.`);
  const path = realpathSync(file);
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes.toString('utf8'));
  if (value?.schemaVersion !== 1 || value.commit !== commit ||
      !contractDigest || value.contractDigest !== contractDigest) {
    throw new Error(`${name} sai phiên bản, commit hoặc dấu vân tay hợp đồng.`);
  }
  return { path, value, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function hashFile(path) {
  const hash = createHash('sha256');
  const descriptor = openSync(path, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    for (;;) {
      const size = readSync(descriptor, buffer);
      if (size === 0) return hash.digest('hex');
      hash.update(buffer.subarray(0, size));
    }
  } finally {
    closeSync(descriptor);
  }
}

function verifyManualEvidence(document) {
  const checks = document.value.checks;
  if (!Array.isArray(checks) || checks.length !== manualIds.length ||
      !manualIds.every(id => checks.some(check => check?.id === id))) {
    throw new Error(`Cần đủ một bản ghi cho mỗi ca: ${manualIds.join(', ')}.`);
  }
  const base = dirname(document.path);
  for (const { id, artifacts } of checks) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      throw new Error(`Ca ${id} thiếu tệp bằng chứng.`);
    }
    const seen = new Set();
    for (const artifact of artifacts) {
      if (typeof artifact?.path !== 'string' || !artifact.path || isAbsolute(artifact.path) ||
          !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '')) {
        throw new Error(`Ca ${id} có đường dẫn hoặc SHA-256 bằng chứng không hợp lệ.`);
      }
      const path = realpathSync(resolve(base, artifact.path));
      const rel = relative(base, path);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || seen.has(path)) {
        throw new Error(`Ca ${id} có bằng chứng trùng hoặc nằm ngoài thư mục bằng chứng.`);
      }
      seen.add(path);
      const stat = statSync(path);
      if (!stat.isFile() || stat.size === 0 || hashFile(path) !== artifact.sha256) {
        throw new Error(`Ca ${id} có tệp rỗng hoặc SHA-256 không khớp: ${artifact.path}.`);
      }
    }
  }
}

export function verifyReleaseInputs({ manifestPath, evidencePath, commit, contractDigest }) {
  const errors = [];
  let releaseManifestDigest = null;
  let evidenceDigest = null;
  try {
    const manifest = boundDocument(manifestPath, 'HARDTEST_RELEASE_MANIFEST', commit, contractDigest);
    releaseManifestDigest = manifest.sha256;
  } catch (error) {
    errors.push(error.message);
  }
  try {
    const evidence = boundDocument(evidencePath, 'HARDTEST_RELEASE_EVIDENCE', commit, contractDigest);
    verifyManualEvidence(evidence);
    evidenceDigest = evidence.sha256;
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, errors, releaseManifestDigest, evidenceDigest };
}
