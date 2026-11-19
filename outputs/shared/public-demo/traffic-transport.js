import { ApiError, aborted, createPublicStore } from './public-store.js';
import { createPublicRoutes } from './public-routes.js';
export { ApiError } from './public-store.js';

function pathOf(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/v1/') || path.includes('\\'))
    throw new ApiError(422, 'VALIDATION', 'Đường dẫn phải bắt đầu bằng /api/v1/');
  const url = new URL(path, 'https://transport.invalid');
  if (url.origin !== 'https://transport.invalid' || !url.pathname.startsWith('/api/v1/'))
    throw new ApiError(422, 'VALIDATION', 'Đường dẫn không hợp lệ');
  return url.pathname + url.search;
}

export function createLocalTrafficTransport({ apiBase, wsUrl } = {}) {
  if (!apiBase) throw new TypeError('Chế độ local cần apiBase');
  const base = new URL(apiBase, globalThis.location?.origin);
  if (!['http:', 'https:'].includes(base.protocol)) throw new TypeError('apiBase phải là HTTP(S)');
  const origin = base.href.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  const socketUrl = new URL(wsUrl || '/ws/v1', base);
  socketUrl.protocol = ['https:', 'wss:'].includes(socketUrl.protocol) ? 'wss:' : 'ws:';
  const send = async (input, blob) => {
    const path = pathOf(input.path);
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(input.method)) throw new ApiError(422, 'VALIDATION', 'Method không hợp lệ');
    aborted(input.signal);
    const headers = {};
    if (input.token) headers.Authorization = 'Bearer ' + input.token;
    let body = input.body;
    if (body !== undefined && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'; body = JSON.stringify(body);
    }
    let response;
    try { response = await fetch(origin + path, { method: input.method || 'GET', headers, body, signal: input.signal }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const error = data?.error || data?.detail?.error || {};
      throw new ApiError(response.status, error.code || 'ERROR', error.message || `Lỗi ${response.status}`);
    }
    return blob ? response.blob() : response.json().catch(() => null);
  };
  return {
    request: input => send(input, false),
    readMedia: (path, options = {}) => send({ method: 'GET', path, ...options }, true),
    subscribe(listener, token) {
      let closed = false, socket, timer, backoff = 1000;
      const open = () => {
        if (closed) return;
        socket = new WebSocket(socketUrl.href);
        const current = socket;
        current.onopen = () => { backoff = 1000; current.send(JSON.stringify({ type: 'auth', token })); };
        current.onmessage = message => {
          if (closed) return;
          try { listener(JSON.parse(message.data)); } catch { /* Tin hoặc listener lỗi không làm rơi kết nối. */ }
        };
        current.onerror = () => {};
        current.onclose = () => {
          if (!closed) { timer = setTimeout(open, backoff); backoff = Math.min(30000, backoff * 2); }
        };
      };
      open();
      return () => { if (closed) return; closed = true; clearTimeout(timer); socket?.close(); };
    }
  };
}

export function createPublicTrafficTransport({ buildId } = {}) {
  if (!buildId) throw new TypeError('Chế độ public cần buildId');
  const store = createPublicStore(buildId);
  const routes = createPublicRoutes(store, buildId);
  return {
    request(input) { return Promise.resolve().then(() => {
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(input.method)) throw new ApiError(422, 'VALIDATION', 'Method không hợp lệ');
      return routes.request({ ...input, path: pathOf(input.path) });
    }); },
    subscribe: (listener, token) => store.subscribe(listener, token),
    readMedia: (path, options) => Promise.resolve().then(() => routes.readMedia(pathOf(path), options))
  };
}

export function createTrafficTransport(options) {
  if (options?.mode === 'local') return createLocalTrafficTransport(options);
  if (options?.mode === 'public') return createPublicTrafficTransport(options);
  throw new TypeError('Chọn mode local hoặc public tường minh');
}
