// URL WS suy từ VITE_API_BASE (không hardcode cổng 8900 — agent chạy song song tự đổi cổng).
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8900/api/v1';
const WS_URL = (import.meta as any).env?.VITE_WS_URL
  || API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1$/, '/ws/v1');

export function connectSmartWs(token: string, onEvent: (msg: any) => void) {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let closed = false;   // cờ dừng: không reconnect sau khi unmount
  const open = () => {
    if (closed) return;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      backoff = 1000;
      ws?.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = ev => {
      try { onEvent(JSON.parse(ev.data)); } catch { /* bỏ qua tin rác */ }
    };
    ws.onclose = () => {
      if (closed) return;
      setTimeout(open, backoff);
      backoff = Math.min(30000, backoff * 2);
    };
  };
  open();
  return () => { closed = true; ws?.close(); };
}
