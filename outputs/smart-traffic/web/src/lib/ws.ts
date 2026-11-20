// WebSocket M6: gửi token trong tin nhắn đầu (không đặt token trên URL), tự nối lại với backoff 1→30 s,
// đồng thời báo trạng thái kết nối ('live' | 'polling') để UI hiển thị trung thực khi WS rớt (A3).
import { API_BASE, getTrafficTransport } from './api';

export function resolveWsUrl(configured: string | undefined, apiBase: string): string {
  const url = new URL(configured || '/ws/v1', apiBase);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return url.href;
}

export interface WsMessage {
  event: string;
  t?: string;
  seq?: number;
  data: any;
}

export type WsStatus = 'live' | 'polling';

export interface ConnectWsOptions {
  onStatus?: (status: WsStatus) => void;
  mode?: 'local' | 'public';
  wsUrl?: string;
  wsImpl?: typeof WebSocket;
}

export function connectSmartWs(
  token: string,
  onEvent: (msg: WsMessage) => void,
  optionsOrStatus?: ConnectWsOptions | ((status: WsStatus) => void),
): () => void {
  const opts: ConnectWsOptions = typeof optionsOrStatus === 'function'
    ? { onStatus: optionsOrStatus }
    : (optionsOrStatus ?? {});

  let lastStatus: WsStatus | null = null;
  const emitStatus = (next: WsStatus) => {
    if (lastStatus === next) return;
    lastStatus = next;
    opts.onStatus?.(next);
  };

  const mode = opts.mode ?? (import.meta.env.VITE_TRANSPORT_MODE === 'public' ? 'public' : 'local');
  if (mode === 'public') {
    const stop = getTrafficTransport().subscribe(message => onEvent(message as WsMessage), token);
    emitStatus('live');
    return stop;
  }

  const WsCtor = opts.wsImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
  if (!WsCtor) {
    emitStatus('polling');
    return () => {};
  }

  const url = opts.wsUrl ?? resolveWsUrl(import.meta.env.VITE_WS_URL, API_BASE);
  let closed = false;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoff = 1000;

  const scheduleReconnect = () => {
    if (closed || timer !== undefined) return;
    const delay = backoff;
    backoff = Math.min(30000, backoff * 2);
    timer = setTimeout(() => {
      timer = undefined;
      open();
    }, delay);
  };

  const open = () => {
    if (closed) return;
    try {
      socket = new WsCtor(url);
    } catch {
      emitStatus('polling');
      scheduleReconnect();
      return;
    }
    const current = socket;
    current.onopen = () => {
      if (closed || current !== socket) return;
      backoff = 1000;
      try {
        current.send(JSON.stringify({ type: 'auth', token }));
        emitStatus('live');
      } catch {
        emitStatus('polling');
      }
    };
    current.onmessage = message => {
      if (closed) return;
      try {
        onEvent(JSON.parse(String(message.data)) as WsMessage);
      } catch {
        /* Tin hoặc listener lỗi không làm rơi kết nối. */
      }
    };
    current.onerror = () => {
      if (!closed) emitStatus('polling');
    };
    current.onclose = () => {
      if (closed || current !== socket) return;
      emitStatus('polling');
      scheduleReconnect();
    };
  };

  const onOffline = () => {
    if (!closed) emitStatus('polling');
  };
  const onOnline = () => {
    if (closed || timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    backoff = 1000;
    open();
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
  }

  emitStatus('polling');
  open();

  return () => {
    if (closed) return;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    }
    socket?.close();
  };
}
