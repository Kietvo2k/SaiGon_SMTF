import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBase32, loginStation32 } from '../station-client-32.js';

test('Docker dùng origin loopback 8088, dev giữ cổng 8900', () => {
  assert.equal(resolveApiBase32('', 'http://localhost:8088').baseUrl, 'http://localhost:8088');
  assert.equal(resolveApiBase32('', 'https://127.0.0.1:8088').wsUrl, 'wss://127.0.0.1:8088/ws/v1');
  assert.equal(resolveApiBase32('', 'http://127.0.0.1:8821').baseUrl, 'http://127.0.0.1:8900');
  assert.equal(resolveApiBase32('?api=/api/v1', 'http://localhost:8088').baseUrl, 'http://localhost:8088');
  assert.equal(resolveApiBase32('?api=https://evil.example', 'http://localhost:8088').baseUrl, 'http://localhost:8088');
  assert.equal(resolveApiBase32('', 'http://evil.example:8088').baseUrl, 'http://127.0.0.1:8900');
});

test('đăng nhập seed từ chối host ngoài loopback trước khi fetch', async () => {
  let called = false;
  await assert.rejects(loginStation32({ baseUrl: 'https://evil.example', fetchImpl: async () => { called = true; } }));
  assert.equal(called, false);
});
