// WebSocket M6: gửi token trong tin nhắn đầu (không đặt token trên URL), tự nối lại với backoff 1→30 s.
import { getTrafficTransport } from './api';

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

export function connectSmartWs(token: string, onEvent: (msg: WsMessage) => void): () => void {
  return getTrafficTransport().subscribe(message => onEvent(message as WsMessage), token);
}
