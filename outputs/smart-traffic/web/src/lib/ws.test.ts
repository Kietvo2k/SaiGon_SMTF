import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSmartWs, resolveWsUrl, type WsStatus } from './ws';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
  }

  triggerOpen() {
    this.onopen?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  triggerClose() {
    this.onclose?.();
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.useRealTimers();
});

describe('connectSmartWs và trạng thái trực tiếp / tải lại định kỳ (A3)', () => {
  it('resolveWsUrl đổi http/https sang ws/wss', () => {
    expect(resolveWsUrl(undefined, 'http://127.0.0.1:8900/api/v1')).toBe('ws://127.0.0.1:8900/ws/v1');
    expect(resolveWsUrl('/ws/v1', 'https://example.com/api/v1')).toBe('wss://example.com/ws/v1');
  });

  it('báo polling trước khi mở, live khi mở và gửi auth, về polling khi rớt WS rồi tự nối lại', () => {
    vi.useFakeTimers();
    const statuses: WsStatus[] = [];
    const events: string[] = [];

    const stop = connectSmartWs(
      'tok-123',
      msg => events.push(msg.event),
      {
        mode: 'local',
        wsUrl: 'ws://127.0.0.1:8900/ws/v1',
        wsImpl: FakeWebSocket as unknown as typeof WebSocket,
        onStatus: s => statuses.push(s),
      },
    );

    expect(statuses).toEqual(['polling']);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const first = FakeWebSocket.instances[0];
    first.triggerOpen();
    expect(JSON.parse(first.sent[0])).toEqual({ type: 'auth', token: 'tok-123' });
    expect(statuses).toEqual(['polling', 'live']);

    first.triggerMessage({ event: 'kpi.update', data: { queue_max: 5 } });
    first.triggerMessage('invalid-json{');
    expect(events).toEqual(['kpi.update']);

    // Rớt WebSocket -> chuyển ngay sang polling và hẹn nối lại sau 1 s
    first.triggerClose();
    expect(statuses).toEqual(['polling', 'live', 'polling']);

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.instances[1].triggerOpen();
    expect(statuses).toEqual(['polling', 'live', 'polling', 'live']);

    stop();
    expect(FakeWebSocket.instances[1].closed).toBe(true);
    // Sau khi stop() thì không đổi trạng thái hay nối lại nữa
    FakeWebSocket.instances[1].triggerClose();
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(statuses).toEqual(['polling', 'live', 'polling', 'live']);
  });

  it('xử lý an toàn khi thiếu WebSocket hoặc khởi tạo ném lỗi', () => {
    vi.useFakeTimers();
    const statuses: WsStatus[] = [];
    const ThrowingWs = function () {
      throw new Error('blocked');
    } as unknown as typeof WebSocket;

    const stop = connectSmartWs('tok', () => {}, {
      mode: 'local',
      wsUrl: 'ws://127.0.0.1:8900/ws/v1',
      wsImpl: ThrowingWs,
      onStatus: s => statuses.push(s),
    });
    expect(statuses).toEqual(['polling']);
    stop();
  });
});
