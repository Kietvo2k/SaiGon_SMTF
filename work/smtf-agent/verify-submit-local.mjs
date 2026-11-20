import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from './pg-test/node_modules/@electric-sql/pglite/dist/index.js';
import app from '../../api/demo/[route].mjs';

const db = new PGlite();
const text = path => readFile(path, 'utf8');
const query = async (sql, params) => (await db.query(sql, params)).rows;
const pg = await query('select version()');
console.log(pg[0].version.split(' on ')[0]);
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
  create table storage.objects(bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, service_role;
  grant select, insert on storage.objects to anon, service_role;
  create policy unrelated_allow on storage.objects for select to anon using (true);
  insert into storage.objects values('other','other.jpg'),('smtf-submit-20261120','sample/test.jpg');`);
const migration = await text('supabase/migrations/20261120000000_smtf_submit.sql');
const seed = await text('supabase/seed.sql');
for (let i = 0; i < 2; i++) {
  await db.exec(migration);
  await db.exec(seed);
}
assert.deepEqual((await query('select count(*)::int as n from public.smtf_submit_junctions'))[0], {n: 10});
assert.deepEqual((await query('select count(*)::int as n from public.smtf_submit_cameras'))[0], {n: 15});
const canonical = JSON.parse(await text('outputs/smart-traffic/backend/app/seed/public-north/cameras.json'));
for (const camera of canonical) {
  const [actual] = await query('select junction_id,label from public.smtf_submit_cameras where camera_id=$1', [camera.camera_id]);
  assert.deepEqual(actual, {junction_id: camera.junction_id, label: camera.label});
}
await db.exec('set role anon');
await assert.rejects(query('select * from public.smtf_submit_records'), {code: '42501'});
await assert.rejects(query("select smtf_submit_claim_frame('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')"), {code: '42501'});
assert.deepEqual(await query('select bucket_id from storage.objects'), [{bucket_id:'other'}]);
await db.exec('set role service_role');
assert.equal((await query('select * from storage.objects')).length, 2);
console.log('PASS migration + seed x2, 10 nút / 15 camera, SQL grant và bucket RLS');

process.env.SUPABASE_URL = 'https://db.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only';
process.env.DEMO_SESSION_SECRET = 'fake-secret-for-local-test-only-32';
const jpeg = await readFile('supabase/samples/CAM-BAC-002.jpg');
const map = new Map([['/storage/v1/object/smtf-submit-20261120/sample/CAM-BAC-002.jpg', jpeg], ['/storage/v1/object/smtf-submit-20261120/sample/CAM-BAC-003.jpg', await readFile('supabase/samples/CAM-BAC-003.jpg')]]);
let unavailable = false;
const mockFetch = async (url, init) => {
  assert.equal(init.headers.get('apikey'), 'test-only');
  if (unavailable) return new Response(null, {status: 503});
  const params = url.searchParams;
  const route = url.pathname.split('/').at(-1);
  if (url.pathname.startsWith('/storage/')) {
    if (init.method === 'POST') {
      map.set(url.pathname, Buffer.from(init.body));
      return Response.json({});
    }
    const blob = map.get(url.pathname);
    return blob ? new Response(blob) : new Response(null, {status:404});
  }
  if (route === 'smtf_submit_claim_frame') {
    const {p_session, p_claim} = JSON.parse(init.body);
    return Response.json((await query('select smtf_submit_claim_frame($1, $2) as result', [p_session,p_claim]))[0].result);
  }
  if (route === 'smtf_submit_finish_frame') {
    const args = Object.values(JSON.parse(init.body));
    return Response.json((await query('select smtf_submit_finish_frame($1,$2,$3,$4,$5) as result', args))[0].result);
  }
  assert.match(route, /^smtf_submit_(?:records|kpi|cameras|sessions)$/);
  const select = params.get('select');
  assert.match(select, /^[a-z0-9_,]+$/);
  const where = [...params].filter(([,value]) => value.startsWith('eq.'));
  assert(where.every(([column]) => ['id','session_id','camera_id','plate'].includes(column)));
  const condition = where.map(([column], index) => column + '=$' + (index + 1)).join(' and ');
  return Response.json(await query('select ' + select + ' from public.' + route + (condition ? ' where ' + condition : ''),
    where.map(([,value]) => value.slice(3))));
};
globalThis.fetch = async (...args) => { try { return await mockFetch(...args); } catch (e) { console.log(e.message); throw e; } };
const base = 'https://submit.invalid/api/demo/';
const call = (path, cookie, options = {}) => app.fetch(new Request(base + path, {
  ...options, headers: { ...options.headers, ...(cookie ? {cookie} : {}) }
}));
const post = {method:'POST'};
const first = await call('session', null, post);
const cookieHeader = first.headers.get('set-cookie');
assert.equal(first.status, 200);
for (const attr of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=28800']) assert(cookieHeader.includes(attr));
const firstCookie = cookieHeader.split(';')[0];
const secondCookie = (await call('session', null, post)).headers.get('set-cookie').split(';')[0];
assert.notEqual(firstCookie, secondCookie);
assert.equal((await call('session', firstCookie, post)).headers.get('set-cookie'), null);
assert.equal((await call('officer', firstCookie.slice(0,-2) + 'xx')).status, 401);
const expired = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.1000000000';
const signed = createHmac('sha256', process.env.DEMO_SESSION_SECRET).update(expired).digest('base64url');
assert.equal((await call('officer', firstCookie.split('=')[0] + '=' + expired + '.' + signed)).status, 401);
assert.equal((await call('officer')).status, 401);
const officer = await (await call('officer', firstCookie)).json();
assert.equal(officer.kpi.source, 'sample');
assert.equal(officer.cameras.length, 15);
for (const plate of ['51K-123.45','51K12345']) {
  const lookup = await (await call('lookup?plate=' + plate)).json();
  assert.equal(lookup.plate, '51K-123.45');
  assert.deepEqual(lookup.records, officer.records);
}
assert.deepEqual((await (await call('lookup?plate=51K-987.65')).json()).records, []);
assert.equal((await (await call('lookup?plate=invalid')).json()).error.code, 'INVALID_PLATE');
unavailable = true;
assert.equal((await (await call('lookup?plate=51K12345')).json()).error.code, 'DATA_UNAVAILABLE');
unavailable = false;
console.log('PASS phiên ký, cookie hết hạn, dashboard và tra biển hai dạng, sai, rỗng, lỗi 503');

const camera = 'camera?cameraId=CAM-BAC-002';
const initial = await (await call(camera, firstCookie)).json();
assert.equal(initial.source, 'sample');
assert.equal(initial.junctionId, 'Bac-02');
assert.equal(initial.capturedAt, null);
assert.equal((await call(initial.imageUrl.split('/').at(-1))).status, 401);
assert.deepEqual(Buffer.from(await (await call(initial.imageUrl.split('/').at(-1), firstCookie)).arrayBuffer()), jpeg);
assert.equal((await (await call('camera?cameraId=CAM-HX-002', secondCookie)).json()).source, 'missing');
assert.equal((await (await call('camera?cameraId=CAM-BAC-004', secondCookie)).json()).source, 'missing');
assert.equal((await call('camera?cameraId=CAM-BAC-999', firstCookie)).status, 404);
const frame = 'frame?cameraId=CAM-BAC-002&frameId=';
const framePost = {method:'POST', headers:{'content-type':'image/jpeg'}, body:jpeg};
assert.equal((await call(frame + 'wrong-origin', firstCookie, {...framePost, headers:{...framePost.headers,origin:'https://other.invalid'}})).status,400);
assert.equal((await call(frame + 'oversize', firstCookie, {...framePost, body: Buffer.alloc(262145)})).status, 400);
assert.equal((await call(frame + 'fake', firstCookie, {...framePost, body: Buffer.from([255,216,255,0,0,0,255,217])})).status, 400);
const concurrent = await Promise.all([
  call(frame + 'cam-2', firstCookie, framePost),
  call('frame?cameraId=CAM-BAC-003&frameId=cam-3', firstCookie, framePost),
]);
assert.deepEqual(concurrent.map(x => x.status).sort(), [200,429]);
const selected = concurrent[0].ok ? 'CAM-BAC-002' : 'CAM-BAC-003';
const selectedPath = 'camera?cameraId=' + selected;
const live = await (await call(selectedPath, firstCookie)).json();
assert.equal(live.source, 'live');
assert(Date.now() - Date.parse(live.capturedAt) < 1_000);
const livePath = live.imageUrl.split('/').at(-1);
assert.equal((await call(livePath, secondCookie)).status, 404);
assert.deepEqual(Buffer.from(await (await call(livePath, firstCookie)).arrayBuffer()), jpeg);
await db.exec("update public.smtf_submit_sessions set captured_at = clock_timestamp() - interval '11 seconds', claimed_at = clock_timestamp() - interval '11 seconds'");
assert.equal((await call(livePath, firstCookie)).status, 404);
assert.equal((await (await call(selectedPath, firstCookie)).json()).source, 'sample');
assert.equal((await call(frame + 'cam-next', firstCookie, framePost)).status, 200);
assert.equal([...map.keys()].filter(path => path.includes('/live/')).length, 2);
assert.equal((await (await call(camera, firstCookie)).json()).frameId,'cam-next');
console.log('PASS ảnh mẫu đúng camera, giới hạn JPEG, tranh chấp cùng phiên, cách ly hai phiên, hết hạn và 2 slot');
await db.close();
