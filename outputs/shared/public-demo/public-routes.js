import { COMMAND_MS, LEASE_MS, SESSION_MS, fail, leaseOf, opaque, userOf, utc } from './public-store.js';

const READERS = ['officer', 'commander', 'admin'];
const WRITERS = ['commander', 'admin'];
const resultOf = command => ({ command_id: command.id, status: command.status,
  reason_code: command.reason_code, applied_t_sim: command.applied_t_sim });
const leaseView = lease => ({ station_id: lease.station_id, owner_id: lease.owner_id,
  generation: lease.generation, expires_at: utc(lease.expires_at), capability: lease.capability });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const valid = condition => { if (!condition) fail(422, 'VALIDATION', 'Dữ liệu không hợp lệ'); };
const commandId = segment => {
  try { return decodeURIComponent(segment); }
  catch { fail(422, 'VALIDATION', 'command_id mã hóa không hợp lệ'); }
};
const canonical = value => JSON.stringify(value, (_, v) => object(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

async function changed(tx) {
  const state = await tx.get('state', 'snapshot');
  state.value.revision++;
  await tx.put('state', state);
  await tx.event('snapshot.updated', { snapshot_version: 'public-demo-v1', revision: state.value.revision });
}

async function expire(tx) {
  for (const command of await tx.all('commands')) {
    if (command.status !== 'pending' || command.deadline_ms > Date.now()) continue;
    command.status = 'expired'; command.reason_code = 'COMMAND_EXPIRED';
    await tx.put('commands', command);
    await tx.audit({ username: 'system', role: 'system' }, 'command.expired', command.id, resultOf(command));
    await tx.event('command.updated', resultOf(command));
  }
}

async function dequeue(tx, lease) {
  await expire(tx);
  const commands = [];
  for (const command of await tx.all('commands')) {
    if (command.status !== 'pending' || command.delivered || command.generation !== lease.generation ||
        command.owner_id !== lease.owner_id || command.station_id !== lease.station_id) continue;
    command.delivered = true;
    await tx.put('commands', command);
    commands.push({ command_id: command.id, deadline_at: utc(command.deadline_ms), event: command.event, data: command.data });
  }
  return commands;
}

async function snapshot(tx, buildId) {
  await expire(tx);
  const state = await tx.get('state', 'snapshot');
  const lease = await tx.get('leases', 'station');
  const alive = lease && lease.expires_at > Date.now();
  const value = state.value;
  return { ...value, build_id: buildId, station: { status: alive ? 'active' : lease ? 'stale' : 'missing',
    id: lease?.station_id || null, last_seen_at: lease?.last_seen_at || null },
    cameras: value.cameras.map(camera => ({ ...camera, status: !camera.frame_id ? 'missing' : alive ? camera.status : 'stale' })) };
}

function control(path, body) {
  const data = { ...body }; delete data.command_id;
  if (path === '/officer/controls/signal-mode') {
    valid(['fixed', 'smart'].includes(data.mode) && Object.keys(data).every(k => k === 'mode'));
    return { event: 'cmd.signal-mode', data, compatible: { ok: true, mode: data.mode } };
  }
  if (path === '/officer/controls/signal-override') {
    valid(typeof data.node_id === 'string' && (data.group === null || [0, 1].includes(data.group)));
    valid(data.duration_s === undefined || Number.isFinite(data.duration_s) && data.duration_s > 0 && data.duration_s <= 600);
    data.duration_s ??= 60;
    return { event: 'cmd.signal-override', data, compatible: { ok: true, until_t_sim: data.until_t_sim ?? null, until_at: utc(Date.now() + data.duration_s * 1000) } };
  }
  if (path === '/officer/controls/scenario') {
    valid(['none', 'peak-hang-xanh', 'lane-block', 'flood-nhc', 'priority-run'].includes(data.scenario));
    valid(Object.keys(data).every(k => ['scenario', 'params'].includes(k)));
    valid(data.params === undefined || object(data.params));
    valid(JSON.stringify(data.params || {}).length <= 1000);
    valid(data.scenario !== 'priority-run' || ['ambulance', 'fire', 'police'].includes(data.params?.kind || 'ambulance'));
    return { event: 'cmd.scenario', data: { key: data.scenario, params: data.params || {}, scenario_id: data.scenario === 'none' ? null : opaque('SC-') },
      compatible: { ok: true, scenario: data.scenario } };
  }
  if (/^\/officer\/vms\/VMS-0[1-4]$/.test(path)) {
    valid(Object.keys(data).every(k => ['mode', 'text'].includes(k)));
    data.text = String(data.text || '').replace(/\s+/g, ' ').trim();
    valid(['auto', 'manual'].includes(data.mode) && data.text.length <= 60 && (data.mode !== 'manual' || data.text.length > 0));
    if (data.mode === 'auto') data.text = '';
    const vms_id = path.split('/').pop();
    return { event: 'cmd.vms', data: { ...data, vms_id, lines: data.text ? [data.text] : [] }, compatible: { ok: true, vms_id, mode: data.mode, text: data.text } };
  }
  return null;
}

async function enqueue(tx, input, user, route, body) {
  valid(body.command_id === undefined || typeof body.command_id === 'string' && body.command_id.length > 0 && body.command_id.length <= 128);
  const id = body.command_id || opaque('cmd-');
  const payload = { ...body }; delete payload.command_id;
  const old = await tx.get('commands', id);
  await expire(tx);
  if (old) {
    if (old.actor !== user.username || old.route !== input.path || old.payload !== canonical(payload))
      fail(409, 'CONFLICT', 'command_id đã được dùng cho yêu cầu khác');
    const saved = await tx.get('commands', id);
    return { ...saved.compatible, ...resultOf(saved) };
  }
  const lease = await tx.get('leases', 'station');
  if (!lease || lease.expires_at <= Date.now()) fail(409, 'STATION_UNAVAILABLE', 'Mở trang 3D để chạy trạm');
  const now = Date.now();
  const command = { id, actor: user.username, route: input.path, payload: canonical(payload),
    event: route.event, data: { ...route.data, by: user.username }, compatible: route.compatible,
    station_id: lease.station_id, owner_id: lease.owner_id, generation: lease.generation, delivered: false,
    status: 'pending', reason_code: null, applied_t_sim: null, created_at: utc(now), deadline_ms: now + COMMAND_MS };
  if (route.event === 'cmd.scenario') command.compatible.scenario_id = route.data.scenario_id;
  await tx.put('commands', command);
  const targetId = route.event === 'cmd.scenario' ? route.data.scenario_id
    : route.event === 'cmd.vms' ? route.data.vms_id : route.data.node_id || null;
  await tx.audit(user, route.event.slice(4), targetId, { ...payload, command_id: id, status: 'pending' });
  await tx.event('command.updated', resultOf(command));
  await tx.event(route.event, { ...command.data, command_id: id }, ['station']);
  return { ...command.compatible, ...resultOf(command) };
}

async function ack(tx, lease, id, body) {
  await expire(tx);
  const command = await tx.get('commands', id);
  if (!command) fail(404, 'NOT_FOUND', 'Không có lệnh');
  if (command.station_id !== lease.station_id || command.owner_id !== lease.owner_id || command.generation !== lease.generation)
    fail(403, 'FORBIDDEN', 'Lệnh thuộc lease khác');
  if (command.status !== 'pending') return resultOf(command);
  if (!command.delivered) fail(409, 'CONFLICT', 'Trạm chưa nhận lệnh');
  valid(['applied', 'rejected'].includes(body.status));
  valid(body.status !== 'applied' || Number.isFinite(body.applied_t_sim) && body.applied_t_sim >= 0);
  command.status = body.status;
  command.reason_code = body.status === 'rejected' ? body.reason_code || 'COMMAND_REJECTED' : null;
  command.applied_t_sim = body.status === 'applied' ? body.applied_t_sim : null;
  await tx.put('commands', command);
  if (body.status === 'applied') {
    const state = await tx.get('state', 'controls');
    const snap = await tx.get('state', 'snapshot');
    const data = command.data;
    if (command.event === 'cmd.signal-mode') state.value.mode = snap.value.simulation.mode = data.mode;
    if (command.event === 'cmd.signal-override') {
      state.value.overrides = state.value.overrides.filter(o => o.node_id !== data.node_id);
      if (data.group !== null) {
        state.value.overrides.push({ ...data, until_at: utc(Date.now() + data.duration_s * 1000),
          until_t_sim: command.applied_t_sim + data.duration_s });
      }
    }
    if (command.event === 'cmd.scenario') {
      state.value.scenario = data.key === 'none' ? null : { ...data, key: data.key, started_at: utc() };
      snap.value.simulation.scenario = data.key;
    }
    if (command.event === 'cmd.vms') {
      const vms = await tx.get('state', 'vms') || { id: 'vms', value: {} };
      vms.value[data.vms_id] = { ...data, set_by: command.actor, set_at: utc() };
      await tx.put('state', vms);
    }
    await tx.put('state', state); await tx.put('state', snap); await changed(tx);
  }
  await tx.audit(lease, 'command.' + body.status, id, resultOf(command));
  await tx.event('command.updated', resultOf(command));
  return resultOf(command);
}

export function createPublicRoutes(store, buildId) {
  const request = async input => {
    const url = new URL(input.path, 'https://public.invalid');
    const path = url.pathname.slice('/api/v1'.length);
    const body = input.body ?? {};
    let frame;
    let evidence;
    if (/^\/station\/violations\/[^/]+\/evidence$/.test(path) && input.method === 'POST') {
      valid(typeof FormData !== 'undefined' && body instanceof FormData);
      evidence = { kind: body.get('kind'), blob: body.get('file') };
      valid(['before', 'after', 'plate_crop'].includes(evidence.kind) && evidence.blob instanceof Blob);
    }
    if (path === '/station/frames' && input.method === 'POST') {
      valid(object(body) && typeof body.jpeg_base64 === 'string' && body.jpeg_base64.length < 70000000);
      try { frame = new Blob([Uint8Array.from(atob(body.jpeg_base64), c => c.charCodeAt(0))], { type: 'image/jpeg' }); }
      catch { fail(422, 'VALIDATION', 'jpeg_base64 không hợp lệ'); }
    }
    return store.transaction(async tx => {
      if (path === '/auth/login' && input.method === 'POST') {
        valid(object(body) && Object.keys(body).every(k => ['username', 'password'].includes(k)));
        const user = (await tx.all('users')).find(u => u.username === body.username && u.password === body.password && u.active);
        if (!user) fail(401, 'UNAUTHORIZED', 'Sai tài khoản hoặc mật khẩu');
        const token = opaque('session-');
        await tx.put('sessions', { id: token, user_id: user.id, role: user.role, expires_at: Date.now() + SESSION_MS });
        return { access_token: token, token_type: 'bearer', expires_in: SESSION_MS / 1000, role: user.role, display_name: user.display_name };
      }
      if (path === '/auth/logout' && input.method === 'POST') {
        await userOf(tx, input.token); await tx.delete('sessions', input.token); return { ok: true };
      }
      if (path === '/auth/me' && input.method === 'GET') {
        const user = await userOf(tx, input.token);
        return { id: user.id, username: user.username, display_name: user.display_name, role: user.role, plates: [] };
      }
      if (path === '/station/lease') {
        if (input.method === 'POST') {
          valid(object(body) && ['station_id', 'owner_id'].every(k => typeof body[k] === 'string' && body[k].length > 0 && body[k].length <= 128));
          const old = await tx.get('leases', 'station');
          if (old?.expires_at > Date.now()) fail(409, 'CONFLICT', 'Một tab trạm đang giữ lease');
          const lease = { id: 'station', station_id: body.station_id, owner_id: body.owner_id,
            generation: (old?.generation || 0) + 1, capability: opaque('station-'), expires_at: Date.now() + LEASE_MS, last_seen_at: utc() };
          await tx.put('leases', lease); await changed(tx); return leaseView(lease);
        }
        const lease = await leaseOf(tx, input.token);
        if (input.method === 'PUT') {
          lease.expires_at = Date.now() + LEASE_MS; lease.last_seen_at = utc();
          await tx.put('leases', lease); return leaseView(lease);
        }
        if (input.method === 'DELETE') {
          lease.expires_at = 0; lease.capability = null;
          await tx.put('leases', lease); await changed(tx); return { ok: true };
        }
      }
      if (path.startsWith('/station/')) {
        const lease = await leaseOf(tx, input.token);
        if (path === '/station/commands/pending' && input.method === 'GET') return { commands: await dequeue(tx, lease) };
        const match = path.match(/^\/station\/commands\/([^/]+)\/ack$/);
        if (match && input.method === 'POST') return ack(tx, lease, commandId(match[1]), body);
        if (path === '/station/heartbeat' && input.method === 'POST') return { ok: true, server_time: utc(), commands: await dequeue(tx, lease) };
        const evidenceMatch = path.match(/^\/station\/violations\/([^/]+)\/evidence$/);
        if (evidenceMatch && evidence) {
          const record = await tx.get('violations', evidenceMatch[1]);
          if (!record) fail(404, 'NOT_FOUND', 'Không có vi phạm');
          if (record.evidence.some(item => item.kind === evidence.kind)) fail(409, 'CONFLICT', 'Đã có bằng chứng cùng loại');
          const id = opaque('MD-');
          await tx.put('media', { id, violation_id: record.id, blob: evidence.blob, captured_at: utc() });
          record.evidence.push({ kind: evidence.kind, media_id: id, url: '/api/v1/media/' + id });
          await tx.put('violations', record); await tx.audit(lease, 'violation.evidence', record.id, { kind: evidence.kind, media_id: id });
          await tx.event('violation.evidence', { violation_id: record.id, kind: evidence.kind, media_id: id }); return { media_id: id };
        }
        if (path === '/station/snapshot' && input.method === 'POST') {
          const value = body.snapshot;
          valid(object(value) && object(value.simulation) && Number.isFinite(value.simulation.t_sim) && ['fixed', 'smart'].includes(value.simulation.mode));
          valid(['junctions', 'routes', 'cameras'].every(k => Array.isArray(value[k])) && object(value.kpi));
          const previous = await tx.get('state', 'snapshot');
          await tx.put('state', { id: 'snapshot', value: { ...value, snapshot_version: 'public-demo-v1', build_id: buildId, revision: previous.value.revision } });
          await changed(tx); return { ok: true };
        }
        if (path === '/station/metrics' && input.method === 'POST') {
          valid(object(body.kpi));
          const state = await tx.get('state', 'snapshot');
          const controls = await tx.get('state', 'controls');
          state.value.kpi = { ...state.value.kpi, ...body.kpi };
          const tSim = body.t_sim ?? body.t;
          if (Number.isFinite(tSim)) state.value.simulation.t_sim = tSim;
          if (['fixed', 'smart'].includes(body.signal_mode)) {
            controls.value.mode = state.value.simulation.mode = body.signal_mode;
          }
          if (Array.isArray(body.overrides)) controls.value.overrides = body.overrides;
          if (Array.isArray(body.signal_states)) controls.value.signals = body.signal_states;
          await tx.put('state', controls);
          await tx.put('state', state); await tx.audit(lease, 'station.metrics', lease.station_id, body); await changed(tx);
          await tx.event('kpi.update', { ...body.kpi, t: body.t, mode: body.signal_mode }); return { ok: true };
        }
        if (path === '/station/frames' && input.method === 'POST') {
          valid(typeof body.camera_id === 'string' && /^CAM-[A-Z]{2,3}-[0-9]{3}$/.test(body.camera_id));
          valid(Number.isFinite(body.w) && body.w > 0 && Number.isFinite(body.h) && body.h > 0 && !Number.isNaN(Date.parse(body.t)));
          await tx.put('media', { id: 'stream/' + body.camera_id, camera_id: body.camera_id, blob: frame, captured_at: body.t, width: body.w, height: body.h, frame_id: body.frame_id || `${lease.generation}-${body.seq}` });
          const state = await tx.get('state', 'snapshot');
          const old = state.value.cameras.find(camera => camera.camera_id === body.camera_id);
          const camera = { ...old, camera_id: body.camera_id, junction_id: old?.junction_id || null, label: old?.label || body.camera_id,
            frame_id: body.frame_id || `${lease.generation}-${body.seq}`, source: 'live', status: 'ready', captured_at: body.t, width: body.w, height: body.h };
          state.value.cameras = [...state.value.cameras.filter(c => c.camera_id !== body.camera_id), camera];
          await tx.put('state', state); await tx.audit(lease, 'station.frame', body.camera_id, { frame_id: camera.frame_id }); await changed(tx);
          await tx.event('stream.updated', { camera_id: body.camera_id, seq: body.seq }); return { ok: true };
        }
        if (path === '/station/violations' && input.method === 'POST') {
          valid(['violation_code', 'plate', 'vehicle_id', 'node_id'].every(k => typeof body[k] === 'string' && body[k].length > 0));
          const cycle_id = body.cycle_id ?? body.signal?.cycle_id; valid(Number.isFinite(cycle_id));
          const key = canonical([body.vehicle_id, body.node_id, cycle_id, body.violation_code]);
          const old = (await tx.all('violations')).find(v => v.dedup_key === key);
          if (old) fail(409, 'CONFLICT', 'Bản ghi trùng');
          const record = { ...body, cycle_id, id: opaque('VP-'), dedup_key: key, status: body.priority_flag || body.confidence < 0.85 ? 'needs_review' : 'new', occurred_at: utc(), evidence: [] };
          await tx.put('violations', record); await tx.audit(lease, 'violation.created', record.id, { status: record.status });
          await tx.event('violation.created', { id: record.id, status: record.status, plate: record.plate });
          return { id: record.id, status: record.status };
        }
        if (path === '/station/heat' && input.method === 'POST') {
          valid(Array.isArray(body.levels) && Array.isArray(body.alerts));
          await tx.put('state', { id: 'heat', value: body }); await tx.audit(lease, 'station.heat', lease.station_id, { t_sim: body.t_sim });
          await tx.event('heat.update', body); return { ok: true };
        }
        fail(404, 'NOT_FOUND', 'Route chưa được hiện thực');
      }
      if (path.startsWith('/officer/')) {
        const user = await userOf(tx, input.token, READERS);
        if (path === '/officer/snapshot' && input.method === 'GET') return snapshot(tx, buildId);
        const match = path.match(/^\/officer\/commands\/([^/]+)$/);
        if (match && input.method === 'GET') {
          await expire(tx); const command = await tx.get('commands', commandId(match[1]));
          if (!command) fail(404, 'NOT_FOUND', 'Không có lệnh');
          return resultOf(command);
        }
        if (path === '/officer/controls/state' && input.method === 'GET') {
          const { value } = await tx.get('state', 'controls');
          const now = Date.now();
          return { ...value, overrides: value.overrides.filter(o => !o.until_at || Date.parse(o.until_at) > now) };
        }
        if (['POST', 'PUT'].includes(input.method)) {
          await userOf(tx, input.token, WRITERS);
          valid(object(body));
          const route = control(path, body);
          if (route) return enqueue(tx, input, user, route, body);
        }
        if (path === '/officer/audit' && input.method === 'GET') {
          await userOf(tx, input.token, WRITERS);
          const items = (await tx.all('audit')).filter(row => !url.searchParams.get('target_id') || row.target_id === url.searchParams.get('target_id'));
          return { items, total: items.length };
        }
        if (path === '/officer/violations' && input.method === 'GET') {
          const items = await tx.all('violations'); return { items, total: items.length, page: 1 };
        }
        if (path === '/officer/kpi' && input.method === 'GET') return { ...(await tx.get('state', 'snapshot')).value.kpi, samples: [] };
        if (path === '/officer/streams' && input.method === 'GET') {
          const cameras = (await snapshot(tx, buildId)).cameras;
          return { streams: cameras.map(camera => ({ ...camera, fps: 2, url: '/api/v1/media/stream/' + camera.camera_id, active: camera.status === 'ready' })) };
        }
      }
      if (path.startsWith('/admin/')) {
        const actor = await userOf(tx, input.token, ['admin']);
        const safe = user => ({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, active: user.active });
        if (path === '/admin/users' && input.method === 'GET') {
          const users = await tx.all('users'); return { items: users.map(safe), total: users.length };
        }
        const match = path.match(/^\/admin\/users\/(\d+)\/(active|role)$/);
        if (match && input.method === (match[2] === 'active' ? 'POST' : 'PUT')) {
          const user = await tx.get('users', Number(match[1]));
          if (!user) fail(404, 'NOT_FOUND', 'Không có người dùng');
          if (user.id === actor.id) fail(403, 'FORBIDDEN', 'Không được tự khóa hoặc hạ quyền');
          if (!['officer', 'commander'].includes(user.role)) fail(403, 'FORBIDDEN', 'Chỉ quản lý tài khoản cán bộ');
          valid(match[2] === 'active' ? typeof body.active === 'boolean' : ['officer', 'commander'].includes(body.role));
          user[match[2]] = body[match[2]]; await tx.put('users', user);
          for (const session of await tx.all('sessions')) if (session.user_id === user.id) await tx.delete('sessions', session.id);
          await tx.audit(actor, 'user.' + match[2], String(user.id), body); return safe(user);
        }
      }
      fail(404, 'NOT_FOUND', 'Route chưa được hiện thực');
    }, input.signal);
  };
  const readMedia = (path, { token, signal } = {}) => store.transaction(async tx => {
    await userOf(tx, token, READERS);
    const media = await tx.get('media', decodeURIComponent(path.slice('/api/v1/media/'.length)));
    if (!media) fail(404, 'NOT_FOUND', 'Chưa có khung từ camera này');
    return media.blob;
  }, signal);
  return { request, readMedia };
}
