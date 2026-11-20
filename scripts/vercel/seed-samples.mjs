import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const bucket = 'smtf-submit-20261120';
const samples = new URL('../../supabase/samples/', import.meta.url);

async function walk(dir, base) {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = `${dir.replace(/[\\/]+$/, '')}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(path, base));
    else if (entry.isFile() && entry.name.endsWith('.jpg')) out.push(path);
  }
  return out;
}

// Đường dẫn hợp lệ trong bucket: sample/CAM-XXX-000.jpg hoặc evidence/<biển>/before|after|plate.jpg
function checkPath(rel) {
  const parts = rel.split('/');
  if (parts.length === 2 && parts[0] === 'sample' && /^CAM-(?:HX|BAC)-\d{3}\.jpg$/.test(parts[1])) return true;
  if (parts.length === 3 && parts[0] === 'evidence' && /^evidence\/[0-9A-Za-z.\- ]+\/(?:before|after|plate)\.jpg$/.test(rel)) return true;
  return false;
}

async function seed() {
  const { values } = parseArgs({ options: { 'project-ref': { type: 'string' } } });
  const ref = values['project-ref'];
  const key = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !key || url?.replace(/\/$/, '') !== `https://${ref}.supabase.co`) {
    throw new Error('Cần SUPABASE_URL, SUPABASE_SECRET_KEY và --project-ref khớp đích đã duyệt.');
  }
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const root = new URL('../../supabase/samples/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const files = await walk(root);
  const seen = new Set();
  for (const file of files) {
    const rel = decodeURIComponent(file.slice(root.length).replace(/\\/g, '/'));
    if (seen.has(rel)) throw new Error(`Trùng tên ảnh: ${rel}`);
    seen.add(rel);
    if (!checkPath(rel)) throw new Error(`Đường dẫn ảnh mẫu không hợp lệ: ${rel}`);
    const bytes = await readFile(file);
    if (bytes.length > 256 * 1024) throw new Error(`Ảnh quá kích thước: ${rel}`);
    const path = `/storage/v1/object/${bucket}/${rel}`;
    const result = await fetch(new URL(path, url), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error(`Tải ảnh mẫu lỗi: ${rel} · HTTP ${result.status}`);
    console.log(rel, createHash('sha256').update(bytes).digest('hex'));
  }
  console.log(`Đã tải ${seen.size} ảnh vào bucket ${bucket}.`);
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof TypeError ? 'Không thể kết nối Storage demo.' : error.message);
  process.exitCode = 1;
}
