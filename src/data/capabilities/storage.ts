export interface KVStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Web implementation of KVStorage.
 *
 * - If a `backing` Map is passed (tests), use it directly.
 * - Otherwise, in a browser, use `localStorage`.
 * - Otherwise (Node/SSR), use an in-memory Map (degrades gracefully).
 *
 * v1.5 Capacitor swaps this for `@capacitor/preferences`.
 */
export function createWebStorage(backing?: Map<string, string>): KVStorage {
  if (backing) {
    return {
      async get(k) { return backing.get(k) ?? null; },
      async set(k, v) { backing.set(k, v); },
      async remove(k) { backing.delete(k); },
    };
  }
  if (typeof localStorage !== "undefined") {
    return {
      async get(k) { return localStorage.getItem(k); },
      async set(k, v) { localStorage.setItem(k, v); },
      async remove(k) { localStorage.removeItem(k); },
    };
  }
  const mem = new Map<string, string>();
  return {
    async get(k) { return mem.get(k) ?? null; },
    async set(k, v) { mem.set(k, v); },
    async remove(k) { mem.delete(k); },
  };
}
