import { cacheGet, cacheSet } from "@/data/local-cache";

/**
 * Storage seam for the local (device-only) flavour.
 *
 * Production uses idb-keyval (via local-cache.ts); tests inject a Map-backed
 * implementation — same pattern as capabilities/storage.ts.
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export function createIdbKV(): KV {
  return {
    get: cacheGet,
    set: cacheSet,
  };
}

export function createMemoryKV(): KV {
  const backing = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      const v = backing.get(key) as T | undefined;
      return v === undefined ? null : structuredClone(v);
    },
    async set(key, value) {
      // Structured clone matches IndexedDB semantics: callers must not be
      // able to mutate stored rows through retained references.
      backing.set(key, structuredClone(value));
    },
  };
}

/** Versioned blob stored under each collection key. */
interface CollectionBlob<T> {
  schemaVersion: number;
  rows: T[];
}

export const SCHEMA_VERSION = 1;

export interface Collection<T> {
  readRows(): Promise<T[]>;
  /** Serialized read-modify-write: mutations on the same key never interleave. */
  mutateRows(fn: (rows: T[]) => T[] | Promise<T[]>): Promise<void>;
}

// One queue per storage key. idb-keyval has no cross-call transactions, so a
// concurrent read-modify-write would lose updates; chaining promises per key
// makes each RMW atomic relative to the others.
const queues = new Map<string, Promise<unknown>>();

function enqueue<R>(key: string, task: () => Promise<R>): Promise<R> {
  const prev = queues.get(key) ?? Promise.resolve();
  // A failed task must not jam the queue for subsequent writers.
  const next = prev.then(task, task);
  queues.set(key, next.catch(() => undefined));
  return next;
}

export function createCollection<T>(kv: KV, key: string): Collection<T> {
  async function load(): Promise<T[]> {
    const blob = await kv.get<CollectionBlob<T>>(key);
    return blob?.rows ?? [];
  }
  return {
    readRows() {
      return enqueue(key, load);
    },
    mutateRows(fn) {
      return enqueue(key, async () => {
        const rows = await fn(await load());
        await kv.set<CollectionBlob<T>>(key, { schemaVersion: SCHEMA_VERSION, rows });
      });
    },
  };
}
