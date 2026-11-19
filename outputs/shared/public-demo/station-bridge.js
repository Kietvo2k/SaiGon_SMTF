import { ApiError, opaque } from './public-store.js';

const capabilities = new WeakMap();
// Chỉ producer nội bộ dùng hàm này; giao diện UI vẫn đúng ba phương thức.
export function stationRequest(transport, input) {
  const token = capabilities.get(transport);
  if (!token) return Promise.reject(new ApiError(409, 'STATION_UNAVAILABLE', 'Tab này chưa giữ lease trạm'));
  return transport.request({ ...input, token });
}

export function createStationBridge({ transport, stationId, applyCommand, readSnapshot }) {
  if (!transport || !stationId || typeof applyCommand !== 'function' || typeof readSnapshot !== 'function')
    throw new TypeError('Station bridge cần transport, stationId và hai callback');
  const ownerId = opaque('owner-');
  let lease, stopped = true, timer, unsubscribe, ticking, processing;
  let epoch = 0;
  const clearLease = () => {
    if (lease && capabilities.get(transport) === lease.capability) capabilities.delete(transport);
    lease = undefined; unsubscribe?.(); unsubscribe = undefined;
  };
  const send = (method, path, body, token = lease?.capability) => transport.request({ method, path: '/api/v1/station/' + path, body, token });
  const holds = (held, version) => !stopped && epoch === version && held &&
    lease?.capability === held.capability && Date.parse(lease.expires_at) > Date.now();
  const apply = async (command, held, version) => {
    if (!holds(held, version) || Date.parse(command.deadline_at) <= Date.now()) return;
    let result;
    try {
      result = await applyCommand(command);
      if (!result || !['applied', 'rejected'].includes(result.status) || result.status === 'applied' && !Number.isFinite(result.applied_t_sim))
        result = { status: 'rejected', reason_code: 'COMMAND_REJECTED' };
    } catch { result = { status: 'rejected', reason_code: 'COMMAND_REJECTED' }; }
    if (!holds(held, version) || Date.parse(command.deadline_at) <= Date.now()) return;
    await send('POST', 'commands/' + encodeURIComponent(command.command_id) + '/ack', result, held.capability);
  };
  const tick = () => {
    if (stopped) return Promise.resolve();
    const version = epoch;
    if (ticking?.version === version) return ticking.promise;
    const run = { version };
    ticking = run;
    run.promise = (async () => {
      if (!lease) {
        const claimed = await send('POST', 'lease', { station_id: stationId, owner_id: ownerId }, undefined);
        if (stopped || epoch !== version) {
          await send('DELETE', 'lease', undefined, claimed.capability); return;
        }
        lease = claimed; capabilities.set(transport, lease.capability);
        unsubscribe = transport.subscribe(message => { if (message.event.startsWith('cmd.')) tick(); }, lease.capability);
      } else {
        const held = lease;
        const renewed = await send('PUT', 'lease', { station_id: stationId, owner_id: ownerId, generation: held.generation }, held.capability);
        if (stopped || epoch !== version || lease?.capability !== held.capability) return;
        lease = renewed;
      }
      if (stopped || epoch !== version) return;
      const value = await readSnapshot();
      if (stopped || epoch !== version) return;
      await send('POST', 'snapshot', { snapshot: value });
      if (processing?.version !== version) {
        const pending = await send('GET', 'commands/pending');
        const held = lease;
        if (!holds(held, version)) return;
        const job = { version };
        processing = job;
        job.promise = (async () => {
          for (const command of pending.commands || []) await apply(command, held, version);
        })().catch(error => {
          if (epoch === version && [401, 403].includes(error?.status)) clearLease();
        }).finally(() => { if (processing === job) processing = undefined; });
      }
    })().catch(error => {
      if (epoch === version && [401, 403].includes(error?.status)) clearLease();
      if (![401, 403, 409].includes(error?.status)) throw error;
    }).finally(() => {
      if (ticking === run) ticking = undefined;
      if (!stopped && epoch === version) { clearTimeout(timer); timer = setTimeout(() => { tick().catch(() => {}); }, 1000); }
    });
    return run.promise;
  };
  const wake = () => { tick().catch(() => {}); };
  return {
    async start() {
      if (!stopped) return ticking?.promise;
      stopped = false; epoch++;
      globalThis.addEventListener?.('focus', wake);
      globalThis.document?.addEventListener('visibilitychange', wake);
      await tick();
    },
    async stop() {
      if (stopped) return;
      stopped = true; epoch++; clearTimeout(timer);
      globalThis.removeEventListener?.('focus', wake);
      globalThis.document?.removeEventListener('visibilitychange', wake);
      const held = lease; clearLease();
      if (held) { try { await send('DELETE', 'lease', undefined, held.capability); } catch { /* Crash cũng được xử lý bằng expiry. */ } }
    }
  };
}
