import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const bucket = 'smtf-submit-20261120';
const samples = new URL('../../supabase/samples/', import.meta.url);

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
  const filenames = (await readdir(samples)).sort();
  for (const filename of filenames) {
    if (!/^CAM-(?:HX|BAC)-\d{3}\.jpg$/.test(filename)) throw new Error('Tên ảnh mẫu không hợp lệ.');
    const bytes = await readFile(new URL(filename, samples));
    if (bytes.length > 256 * 1024) throw new Error(`Ảnh quá kích thước: ${filename}`);
    const path = `/storage/v1/object/${bucket}/sample/${filename}`;
    const result = await fetch(new URL(path, url), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error(`Tải ảnh mẫu lỗi: ${filename} · HTTP ${result.status}`);
    console.log(filename, createHash('sha256').update(bytes).digest('hex'));
  }
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof TypeError ? 'Không thể kết nối Storage demo.' : error.message);
  process.exitCode = 1;
}
