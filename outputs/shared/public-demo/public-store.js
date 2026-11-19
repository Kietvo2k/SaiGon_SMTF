import { SAMPLE_ACCOUNTS, emptySnapshot } from './sample-seed.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code;
  }
}

export const LEASE_MS = 6000;
export const COMMAND_MS = 10000;
export const SESSION_MS = 30 * 60 * 1000;
const STORES = ['meta', 'users', 'sessions', 'leases', 'commands', 'state', 'violations', 'media', 'audit', 'events'];
const unavailable = () => new ApiError(503, 'STORAGE_UNAVAILABLE', 'Trình duyệt chưa cấp kho lưu trữ');
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
export const opaque = prefix => `${prefix}${globalThis.crypto.randomUUID()}`;
export const utc = value => new Date(value ?? Date.now()).toISOString();
export const aborted = signal => { if (signal?.aborted) throw new DOMException('Đã hủy yêu cầu', 'AbortError'); };

export async function userOf(tx, token, roles) {
  const session = token && await tx.get('sessions', token);
  const user = session && await tx.get('users', session.user_id);
  if (!session || session.expires_at <= Date.now() || !user?.active || user.role !== session.role)
    fail(401, 'UNAUTHORIZED', 'Phiên không hợp lệ hoặc đã hết hạn');
  if (roles && !roles.includes(user.role)) fail(403, 'FORBIDDEN', 'Không đủ quyền');
  return user;
}

export async function leaseOf(tx, capability) {
  const lease = await tx.get('leases', 'station');
  if (!lease || !capability || lease.capability !== capability || lease.expires_at <= Date.now())
    fail(403, 'FORBIDDEN', 'Lease trạm đã hết hiệu lực');
  return lease;
}

export function createPublicStore(buildId) {
  let opening;
  let channel;
  const listeners = new Set();
  const open = () => {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(unavailable()); return; }
      let request;
      try { request = indexedDB.open('smtf-public-demo-v1', 1); } catch { reject(unavailable()); return; }
      request.onupgradeneeded = () => {
        for (const name of STORES) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onerror = request.onblocked = () => reject(unavailable());
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  };

  const transaction = async (operation, signal) => {
    aborted(signal);
    const db = await open();
    aborted(signal);
    return new Promise((resolve, reject) => {
      let native;
      try { native = db.transaction(STORES, 'readwrite'); } catch { reject(unavailable()); return; }
      let result, failure, callerAborted = false;
      const events = [];
      const request = req => new Promise((yes, no) => {
        req.onsuccess = () => yes(req.result); req.onerror = () => no(req.error);
      });
      const tx = {
        get: (name, id) => request(native.objectStore(name).get(id)),
        all: name => request(native.objectStore(name).getAll()),
        put: (name, value) => request(native.objectStore(name).put(value)),
        delete: (name, id) => request(native.objectStore(name).delete(id)),
        async event(event, data, roles = ['officer', 'commander', 'admin']) {
          const meta = await tx.get('meta', 'sequence') || { id: 'sequence', value: 0 };
          const seq = ++meta.value;
          const envelope = { event, t: utc(), seq, data };
          const entry = { id: seq, roles, envelope };
          await tx.put('meta', meta); await tx.put('events', entry); events.push(entry);
          return envelope;
        },
        async audit(actor, action, target_id, payload) {
          await tx.put('audit', { id: opaque('audit-'), actor: actor.username || actor.owner_id,
            role: actor.role || 'station', action, target_id, payload, created_at: utc() });
        }
      };
      const abort = () => { callerAborted = true; failure = new DOMException('Đã hủy yêu cầu', 'AbortError'); try { native.abort(); } catch { /* Đã commit. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      native.onabort = () => {
        signal?.removeEventListener('abort', abort);
        reject(failure instanceof ApiError || callerAborted ? failure : unavailable());
      };
      native.onerror = () => { /* onabort nhận lỗi và giữ tính nguyên tử. */ };
      native.oncomplete = () => {
        signal?.removeEventListener('abort', abort);
        // Chỉ transaction complete mới cho phép quan sát mutation thành công.
        for (const entry of events) {
          deliver(entry);
          try {
            const producer = channel || (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('smtf-public-demo-v1') : null);
            producer?.postMessage({ id: entry.id });
            if (producer && producer !== channel) producer.close();
          } catch { /* Commit đã bền vững; mất thông báo được khôi phục bằng snapshot. */ }
        }
        resolve(result);
      };
      (async () => {
        if (!await tx.get('meta', 'schema')) {
          for (const user of SAMPLE_ACCOUNTS) await tx.put('users', user);
          await tx.put('state', { id: 'snapshot', value: emptySnapshot(buildId) });
          await tx.put('state', { id: 'controls', value: { mode: 'fixed', overrides: [], scenario: null, signals: [] } });
          await tx.put('meta', { id: 'schema', version: 'public-demo-v1' });
        }
        result = await operation(tx);
      })().catch(error => {
        failure = error;
        try { native.abort(); }
        catch { reject(failure instanceof ApiError || callerAborted ? failure : unavailable()); }
      });
    });
  };

  const deliver = entry => {
    for (const sub of listeners) {
      if (sub.seen.has(entry.id)) continue;
      sub.seen.add(entry.id);
      transaction(async tx => {
        if (!entry.roles.length) return true;
        if (entry.roles.includes('station') && sub.token?.startsWith('station-')) {
          await leaseOf(tx, sub.token); return true;
        }
        const user = await userOf(tx, sub.token);
        return entry.roles.includes(user.role);
      }).then(allowed => {
        if (allowed && listeners.has(sub)) {
          try { sub.listener(entry.envelope); } catch { /* Un subscriber không cản subscriber khác. */ }
        }
      }).catch(() => {});
    }
  };

  return {
    transaction,
    subscribe(listener, token) {
      const sub = { listener, token, seen: new Set() };
      listeners.add(sub);
      if (!channel && typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('smtf-public-demo-v1');
        channel.onmessage = message => {
          const id = message.data?.id;
          if (!Number.isSafeInteger(id)) return;
          transaction(tx => tx.get('events', id)).then(entry => { if (entry) deliver(entry); }).catch(() => {});
        };
      }
      return () => {
        listeners.delete(sub);
        if (!listeners.size && channel) { channel.close(); channel = undefined; }
      };
    }
  };
}
