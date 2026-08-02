import { describe, expect, it } from "vitest";
import { createMemoryKV, createCollection } from "@/data/local/kv";

describe("createMemoryKV", () => {
  it("returns null for a missing key and round-trips values", async () => {
    const kv = createMemoryKV();
    expect(await kv.get("nope")).toBeNull();
    await kv.set("k", { a: 1 });
    expect(await kv.get("k")).toEqual({ a: 1 });
  });
});

describe("createCollection", () => {
  it("readRows returns [] when the key has never been written", async () => {
    const col = createCollection<{ id: number }>(createMemoryKV(), "cs_test");
    expect(await col.readRows()).toEqual([]);
  });

  it("mutateRows persists the returned rows and readRows sees them", async () => {
    const col = createCollection<{ id: number }>(createMemoryKV(), "cs_test");
    await col.mutateRows((rows) => [...rows, { id: 1 }]);
    await col.mutateRows((rows) => [...rows, { id: 2 }]);
    expect(await col.readRows()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("stamps schemaVersion=1 on the stored blob", async () => {
    const kv = createMemoryKV();
    const col = createCollection<{ id: number }>(kv, "cs_test");
    await col.mutateRows(() => [{ id: 1 }]);
    const blob = await kv.get<{ schemaVersion: number; rows: unknown[] }>("cs_test");
    expect(blob?.schemaVersion).toBe(1);
    expect(blob?.rows).toEqual([{ id: 1 }]);
  });

  it("serializes concurrent read-modify-writes on the same key (no lost update)", async () => {
    const col = createCollection<number>(createMemoryKV(), "cs_test");
    // Fire 20 concurrent appends WITHOUT awaiting in between. A naive
    // implementation reads stale rows and loses most of them.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => col.mutateRows((rows) => [...rows, i])),
    );
    const rows = await col.readRows();
    expect(rows).toHaveLength(20);
    expect(new Set(rows).size).toBe(20);
  });

  it("keeps writes serialized even when a mutation callback is async", async () => {
    const col = createCollection<number>(createMemoryKV(), "cs_test");
    await Promise.all([
      col.mutateRows(async (rows) => {
        await new Promise((r) => setTimeout(r, 10)); // slow writer first
        return [...rows, 1];
      }),
      col.mutateRows((rows) => [...rows, 2]),
    ]);
    expect(await col.readRows()).toEqual([1, 2]);
  });

  it("a throwing mutation does not corrupt the collection or jam the queue", async () => {
    const col = createCollection<number>(createMemoryKV(), "cs_test");
    await col.mutateRows(() => [1]);
    await expect(col.mutateRows(() => { throw new Error("boom"); })).rejects.toThrow("boom");
    await col.mutateRows((rows) => [...rows, 2]);
    expect(await col.readRows()).toEqual([1, 2]);
  });
});
