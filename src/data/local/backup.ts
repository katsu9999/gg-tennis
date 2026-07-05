import { createCollection, createCounter, type KV, SCHEMA_VERSION } from "@/data/local/kv";

/**
 * Whole-device backup/wipe for the local flavour's settings page.
 * The JSON export is the ONLY backup path for device-local data.
 */

export const LOCAL_DATA_KEYS = [
  "cs_members",
  "cs_venues",
  "cs_sessions",
  "cs_session_ongoing",
  "cs_history",
] as const;

/** Counter keys that must also reset on wipe (via the queue, never raw kv). */
const COUNTER_KEYS = ["cs_member_seq"] as const;

export interface LocalBackup {
  schemaVersion: number;
  exportedAt: string;
  collections: Record<(typeof LOCAL_DATA_KEYS)[number], unknown[]>;
}

export async function buildBackup(kv: KV): Promise<LocalBackup> {
  const collections = {} as LocalBackup["collections"];
  for (const key of LOCAL_DATA_KEYS) {
    collections[key] = await createCollection<unknown>(kv, key).readRows();
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    collections,
  };
}

export async function wipeAllData(kv: KV): Promise<void> {
  for (const key of LOCAL_DATA_KEYS) {
    await createCollection<unknown>(kv, key).mutateRows(() => []);
  }
  for (const key of COUNTER_KEYS) {
    await createCounter(kv, key).reset();
  }
}
