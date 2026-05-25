import { get, set, del } from "idb-keyval";

/**
 * Read a value from IndexedDB (or any browser KV store backing idb-keyval).
 * Returns null (not undefined) when the key is missing, to make
 * "no cached snapshot" branching trivial in callers.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const v = await get<T | undefined>(key);
  return v ?? null;
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  await set(key, value);
}

export async function cacheDelete(key: string): Promise<void> {
  await del(key);
}
