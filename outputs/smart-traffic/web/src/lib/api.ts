// Gọi API M6. Token chỉ nằm trong sessionStorage (theo từng web) hoặc trong state; không lưu mật khẩu.
import { ApiError, createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js';
import type { TrafficTransport, RequestInput } from '../../../../shared/public-demo/traffic-transport.js';
export { ApiError, createLocalTrafficTransport, createPublicTrafficTransport, createTrafficTransport } from '../../../../shared/public-demo/traffic-transport.js';
export type { TrafficTransport, RequestInput, EventEnvelope } from '../../../../shared/public-demo/traffic-transport.js';

export function resolveApiBase(configured?: string, pageOrigin = globalThis.location?.origin): string {
  return new URL(configured || 'http://127.0.0.1:8900/api/v1', pageOrigin || 'http://127.0.0.1:8900').href.replace(/\/$/, '');
}

export const API_BASE: string = resolveApiBase(import.meta.env.VITE_TRANSPORT_MODE === 'public' ? '/api/v1' : import.meta.env.VITE_API_BASE);
// Gốc máy chủ (bỏ /api/v1) để ghép URL bằng chứng `/api/v1/media/...`.
export const ORIGIN: string = API_BASE.replace(/\/api\/v1\/?$/, '');

export type Scope = 'officer' | 'citizen';
const TOKEN_KEY: Record<Scope, string> = { officer: 'smart_token_officer', citizen: 'smart_token_citizen' };

export function loadToken(scope: Scope): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY[scope]);
  } catch {
    return null;   // trình duyệt chặn bộ nhớ: phiên chỉ còn trong state
  }
}

export function saveToken(scope: Scope, token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY[scope], token);
    else sessionStorage.removeItem(TOKEN_KEY[scope]);
  } catch {
    /* bỏ qua: token vẫn nằm trong state của ứng dụng */
  }
}

let runtimeTransport: TrafficTransport | undefined;
export function getTrafficTransport(): TrafficTransport {
  if (!runtimeTransport) {
    const mode = import.meta.env.VITE_TRANSPORT_MODE || 'local';
    if (mode !== 'local' && mode !== 'public') throw new TypeError('VITE_TRANSPORT_MODE phải là local hoặc public');
    runtimeTransport = mode === 'public'
      ? createTrafficTransport({ mode: 'public', buildId: import.meta.env.VITE_BUILD_ID || 'public-demo-v1' })
      : createTrafficTransport({ mode: 'local', apiBase: API_BASE, wsUrl: import.meta.env.VITE_WS_URL });
  }
  return runtimeTransport;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Có lỗi xảy ra, vui lòng thử lại';
}

export interface Api {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  del<T = any>(path: string): Promise<T>;
}

// Lỗi chuẩn: {"error": {code, message, detail}}; 401 gọi onUnauthorized để đăng xuất có thông báo.
export function makeApi(token: string | null, onUnauthorized?: () => void): Api {
  const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    try {
      return await getTrafficTransport().request<T>({ method: method as RequestInput['method'],
        path: path.startsWith('/api/v1/') ? path : '/api/v1' + path, body, token: token || undefined });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized?.();
      throw error;
    }
  };
  return {
    get: <T = any>(path: string) => send<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => send<T>('POST', path, body ?? {}),
    put: <T = any>(path: string, body?: unknown) => send<T>('PUT', path, body ?? {}),
    del: <T = any>(path: string) => send<T>('DELETE', path),
  };
}

// Đăng nhập không kèm token; trả về token và vai trò (web tự kiểm tra lại qua /auth/me).
export async function login(username: string, password: string): Promise<{ access_token: string; role: string }> {
  return makeApi(null).post('/auth/login', { username, password });
}

export function mediaUrl(path: string): string {
  return ORIGIN + path;
}

export const streamUrl = (cameraId: string): string => `${API_BASE}/media/stream/${cameraId}`;
