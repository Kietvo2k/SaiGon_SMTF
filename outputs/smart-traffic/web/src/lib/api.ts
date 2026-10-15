// Gọi API M6. Token chỉ nằm trong sessionStorage (theo từng web) hoặc trong state; không lưu mật khẩu.

export const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8900/api/v1';
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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
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
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ');
    }
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      const info = data?.error ?? data?.detail?.error ?? {};
      if (res.status === 401 && onUnauthorized) onUnauthorized();
      throw new ApiError(res.status, info.code ?? 'ERROR', info.message ?? `Lỗi ${res.status}`);
    }
    return data as T;
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
