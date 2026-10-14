// An in-memory stand-in for a Netlify Blobs store, for tests and the chat eval.
export function memoryStore() {
  const data = new Map();
  let n = 0;
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key).value) : null; },
    async getWithMetadata(key) {
      const e = data.get(key);
      return e ? { data: structuredClone(e.value), etag: e.etag, metadata: {} } : null;
    },
    async setJSON(key, value, opts = {}) {
      const cur = data.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      data.set(key, { value: structuredClone(value), etag: `e${++n}` });
      return { modified: true, etag: `e${n}` };
    },
    async list({ prefix = "" } = {}) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

export const memoryStores = () => ({ sessions: memoryStore(), usage: memoryStore(), settings: memoryStore() });
