// WebSocket M6: gửi token trong tin nhắn đầu (không đặt token trên URL), tự nối lại với backoff 1→30 s.
import { API_BASE } from './api';

const WS_URL: string = import.meta.env.VITE_WS_URL || API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '/ws/v1');

export interface WsMessage {
  event: string;
  t?: string;
  seq?: number;
  data: any;
}

export function connectSmartWs(token: string, onEvent: (msg: WsMessage) => void): () => void {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;   // cờ dừng: không nối lại sau khi gỡ bỏ
  const open = () => {
    if (closed) return;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      backoff = 1000;
      ws?.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = ev => {
      try {
        onEvent(JSON.parse(ev.data) as WsMessage);
      } catch {
        /* bỏ qua tin không đọc được */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      timer = setTimeout(open, backoff);
      backoff = Math.min(30000, backoff * 2);
    };
  };
  open();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
