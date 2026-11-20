// Probe cổng /api/demo trên production — đối chiếu hiện trạng P0 (demo-v2).
// Không in khóa; chạy: node work/probe-demo-api.mjs [origin]
const origin = process.argv[2] || 'https://saigon-smtf-submit.vercel.app';
const out = [];
const log = (...a) => { const line = a.join(' '); out.push(line); console.log(line); };

const res0 = await fetch(`${origin}/api/demo/session`, { method: 'POST' });
const cookie = res0.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
log(`session: HTTP ${res0.status} cookie=${cookie ? 'có' : 'không'}`);

const officer = await fetch(`${origin}/api/demo/officer`, { headers: { cookie } });
const officerData = officer.ok ? await officer.json() : null;
log(`officer: HTTP ${officer.status} records=${officerData?.records?.length ?? '—'} cameras=${officerData?.cameras?.length ?? '—'} kpi.source=${officerData?.kpi?.source ?? '—'}`);
if (officerData?.records) for (const r of officerData.records) log(`  record: ${r.plate} | ${r.summary} | ${r.status} | keys=${Object.keys(r).join(',')}`);

for (const cameraId of ['CAM-BAC-001', 'CAM-BX-002', 'CAM-HX-002']) {
  const cam = await fetch(`${origin}/api/demo/camera?cameraId=${cameraId}`, { headers: { cookie } });
  if (cam.status !== 200) { log(`camera ${cameraId}: HTTP ${cam.status}`); continue; }
  const data = await cam.json();
  log(`camera ${cameraId}: source=${data.source} frameId=${data.frameId ?? 'null'} imageUrl=${data.imageUrl ? 'có' : 'không'}`);
  if (data.imageUrl) {
    const media = await fetch(`${origin}${data.imageUrl}`, { headers: { cookie } });
    log(`  media: HTTP ${media.status} bytes=${media.headers.get('content-length') ?? '—'} type=${media.headers.get('content-type') ?? '—'}`);
  }
}

const lookups = await Promise.all(['51K-123.45', '51K12345', '51K-987.65'].map(async plate => {
  const res = await fetch(`${origin}/api/demo/lookup?plate=${encodeURIComponent(plate)}`);
  return `lookup ${plate}: HTTP ${res.status}${res.ok ? ' records=' + (await res.json()).records.length : ''}`;
}));
for (const line of lookups) log(line);
log('PROBE DONE');
