// Hàng đợi vi phạm của trạm (đặc tả mục 8): FIFO bất đồng bộ, tối đa QUEUE_MAX bản ghi,
// bản ghi cũ nhất bị bỏ khi đầy. Store được inject (IndexedDB ở trình duyệt, Map trong test).
// Không dùng `process`; chạy được trong Node và trình duyệt.
export const QUEUE_32_VERSION = 'queue-32a';
export const QUEUE_MAX = 2000;

// Store bất đồng bộ: { get(key) -> Promise<any>, set(key, value) -> Promise<void> }.
// Mọi thao tác được xếp tuần tự (khóa chuỗi promise) nên push/shift không đè nhau khi store chậm.
export function createQueue32({ store, max = QUEUE_MAX, key = 'queue' } = {}) {
  if (!store) throw new TypeError('createQueue32 cần store');
  let items = null;            // null = chưa nạp từ store
  let chain = Promise.resolve();
  const locked = fn => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
  const load = async () => {
    if (items === null) {
      const saved = await store.get(key);
      items = Array.isArray(saved) ? saved : [];
    }
    return items;
  };
  return {
    max,
    // Trả về số bản ghi cũ nhất đã bị bỏ để nhường chỗ (0 khi còn chỗ).
    push: record => locked(async () => {
      await load();
      items.push(record);
      let dropped = 0;
      while (items.length > max) { items.shift(); dropped++; }
      await store.set(key, items);
      return dropped;
    }),
    shift: () => locked(async () => {
      await load();
      if (!items.length) return undefined;
      const head = items.shift();
      await store.set(key, items);
      return head;
    }),
    size: () => locked(async () => (await load()).length),
    peekAll: () => locked(async () => (await load()).slice())
  };
}

// Store trong bộ nhớ: dùng khi trình duyệt không có IndexedDB (chế độ riêng tư) và trong test.
export function createMemoryStore32() {
  const m = new Map();
  return {
    get: async k => (m.has(k) ? m.get(k) : undefined),
    set: async (k, v) => { m.set(k, v); }
  };
}

// Adapter IndexedDB thật: mở kết nối một lần (cache), mỗi thao tác là một transaction ngắn.
export function createIndexedDbStore32({ name = 'smart-station-32', storeName = 'kv' } = {}) {
  let dbP = null;
  const open = () => {
    if (!dbP) {
      dbP = new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(err => { dbP = null; throw err; });   // lỗi mở → lần sau thử lại
    }
    return dbP;
  };
  return {
    async get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async set(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB abort'));
      });
    }
  };
}
