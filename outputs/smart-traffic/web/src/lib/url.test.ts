import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './api';
import { resolveWsUrl } from './ws';

describe('URL triển khai', () => {
  it('giữ API dev mặc định và đổi API tương đối thành URL tuyệt đối', () => {
    expect(resolveApiBase(undefined, 'http://localhost:5173')).toBe('http://127.0.0.1:8900/api/v1');
    expect(resolveApiBase('/api/v1/', 'https://localhost:8088')).toBe('https://localhost:8088/api/v1');
    expect(resolveApiBase('http://localhost:8961/api/v1/', 'http://localhost:5173')).toBe('http://localhost:8961/api/v1');
  });
  it('WebSocket dùng ws/wss đúng origin và hỗ trợ URL cấu hình tương đối', () => {
    expect(resolveWsUrl(undefined, 'https://localhost:8088/api/v1')).toBe('wss://localhost:8088/ws/v1');
    expect(resolveWsUrl('/ws/v1', 'http://localhost:8088/api/v1')).toBe('ws://localhost:8088/ws/v1');
    expect(resolveWsUrl('wss://localhost:8961/ws/v1', 'http://localhost:8088/api/v1')).toBe('wss://localhost:8961/ws/v1');
  });
});
