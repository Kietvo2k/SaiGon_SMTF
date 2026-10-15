import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue32, createMemoryStore32, createIndexedDbStore32, QUEUE_MAX } from '../station-queue-32.js?v=32a';

// IndexedDB giả tối thiểu (open/upgrade/transaction/get/put) để kiểm adapter mà không cần trình duyệt.
function fakeIndexedDB() {
  const dbs = new Map();   // tên DB → Map(tên store → Map(key → value))
  return {
    open(name) {
      const request = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        const existed = dbs.has(name);
        if (!existed) dbs.set(name, new Map());
        const stores = dbs.get(name);
        request.result = {
          objectStoreNames: { contains: s => stores.has(s) },
          createObjectStore: s => { stores.set(s, new Map()); return {}; },
          transaction(storeName) {
            const data = stores.get(storeName);
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            tx.objectStore = () => ({
              get(key) {
                const r = { result: undefined, onsuccess: null, onerror: null };
                queueMicrotask(() => { r.result = structuredClone(data.get(key)); if (r.onsuccess) r.onsuccess(); });
                return r;
              },
              put(value, key) {
                queueMicrotask(() => { data.set(key, structuredClone(value)); queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); }); });
                return {};
              }
            });
            return tx;
          }
        };
        if (!existed && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

test('hằng số: QUEUE_MAX 2000; hàng đợi FIFO async, bỏ bản ghi cũ nhất khi vượt giới hạn', async () => {
  assert.equal(QUEUE_MAX, 2000);
  const q = createQueue32({ store: createMemoryStore32() });
  let dropped = 0;
  for (let i = 0; i < 2005; i++) dropped += await q.push({ id: i });
  assert.equal(dropped, 5);
  assert.equal(await q.size(), 2000);
  assert.equal((await q.shift()).id, 5);   // 5 bản ghi đầu đã bị bỏ
  assert.equal((await q.peekAll())[0].id, 6);
});

test('thao tác đồng thời vẫn giữ đúng thứ tự (khóa tuần tự) và ghi xuống store', async () => {
  const m = new Map();
  const slow = {
    get: async k => { await new Promise(r => setTimeout(r, 2)); return m.get(k); },
    set: async (k, v) => { await new Promise(r => setTimeout(r, 1)); m.set(k, structuredClone(v)); }
  };
  const q = createQueue32({ store: slow });
  await Promise.all([q.push({ n: 1 }), q.push({ n: 2 }), q.push({ n: 3 })]);
  const first = await q.shift();
  assert.equal(first.n, 1);
  assert.deepEqual(m.get('queue').map(x => x.n), [2, 3]);   // store phản ánh trạng thái sau cùng
});

test('shift trên hàng đợi rỗng trả undefined và không làm hỏng trạng thái', async () => {
  const q = createQueue32({ store: createMemoryStore32() });
  assert.equal(await q.shift(), undefined);
  assert.equal(await q.size(), 0);
});

test('adapter IndexedDB: ghi rồi đọc lại, và dữ liệu còn khi mở kết nối mới (qua khởi động lại trạm)', async () => {
  const prev = globalThis.indexedDB;
  globalThis.indexedDB = fakeIndexedDB();
  try {
    const q1 = createQueue32({ store: createIndexedDbStore32({ name: 'test-station-db' }) });
    await q1.push({ violation_code: 'RED-LIGHT', vehicle_id: 'V-000001' });
    await q1.push({ violation_code: 'RED-LIGHT', vehicle_id: 'V-000002' });
    const q2 = createQueue32({ store: createIndexedDbStore32({ name: 'test-station-db' }) });   // trạm khởi động lại
    assert.equal(await q2.size(), 2);
    assert.equal((await q2.shift()).vehicle_id, 'V-000001');
    assert.equal(await createIndexedDbStore32({ name: 'test-station-db' }).get('queue') instanceof Array, true);
  } finally {
    globalThis.indexedDB = prev;
  }
});

test('adapter IndexedDB: khóa chưa có trả undefined; set/get khóa khác nhau không lẫn', async () => {
  const prev = globalThis.indexedDB;
  globalThis.indexedDB = fakeIndexedDB();
  try {
    const s = createIndexedDbStore32({ name: 'test-keys' });
    assert.equal(await s.get('none'), undefined);
    await s.set('a', [1]);
    await s.set('b', [2, 3]);
    assert.deepEqual(await s.get('a'), [1]);
    assert.deepEqual(await s.get('b'), [2, 3]);
  } finally {
    globalThis.indexedDB = prev;
  }
});
