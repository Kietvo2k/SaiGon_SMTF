import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const limits = { vercel: 90 * 1024 ** 2, pagesFile: 25 * 1024 ** 2, pagesCount: 20_000 };
const privateFile = /(?:^|\/)(?:\.env[^/]*|\.git|\.vercel|\.wrangler|node_modules|research|work|var|__pycache__|accounts\.json|owners\.json)(?:\/|$)|\.(?:db|sqlite|sqlite3|pem|key)$/i;

export function describeArtifact(root, platform) {
  if (!lstatSync(root).isDirectory()) throw new Error(`Thư mục ${platform} không hợp lệ.`);
  const files = [];
  const diskNames = new Set();
  let totalBytes = 0;
  function walk(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      const prebuilt = platform === 'vercel'
        && (path === '.vercel' || path === '.vercel/output' || path.startsWith('.vercel/output/'));
      const inspectPath = prebuilt ? path.slice('.vercel'.length) : path;
      if (privateFile.test(inspectPath)) throw new Error(`Tệp phát hành bị cấm: ${path}`);
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, path + '/');
        continue;
      }
      if (!entry.isFile()) throw new Error(`Tài nguyên phải là tệp thường: ${path}`);
      if (diskNames.has(path.toLowerCase())) throw new Error(`Đường dẫn trùng: ${path}`);
      diskNames.add(path.toLowerCase());
      const { size } = lstatSync(absolute);
      if (platform === 'pages' && size >= limits.pagesFile) throw new Error(`Tài nguyên Pages vượt ngân sách: ${path}`);
      totalBytes += size;
      if (platform === 'vercel' && totalBytes >= limits.vercel) throw new Error('Gói Vercel vượt ngân sách 90 MiB.');
      if (platform === 'pages' && files.length === limits.pagesCount) throw new Error('Gói Pages vượt 20.000 tệp.');
      const bytes = readFileSync(absolute);
      if (size !== bytes.length) throw new Error(`Tệp thay đổi lúc kiểm tra: ${path}`);
      files.push({ path, bytes: size, sha256: digest(bytes) });
    }
  }
  walk(root, '');
  if (!files.length) throw new Error(`Gói ${platform} rỗng.`);
  files.sort((a, b) => (a.path > b.path) - (a.path < b.path));
  return { totalBytes, files };
}

export function verifyArtifacts(manifest, directories) {
  for (const platform of ['vercel', 'pages']) {
    const actual = describeArtifact(directories[platform], platform);
    const expected = manifest.artifacts?.[platform];
    if (actual.totalBytes !== expected?.totalBytes || actual.files.length !== expected?.files?.length) {
      throw new Error(`Danh mục ${platform} lệch manifest.`);
    }
    for (const [index, entry] of actual.files.entries()) {
      const planned = expected.files[index];
      if (entry.path !== planned?.path || entry.sha256 !== planned?.sha256 || entry.bytes !== planned?.bytes) {
        throw new Error(`Tài nguyên ${platform} khác manifest: ${entry.path}`);
      }
    }
  }
}
