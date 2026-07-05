import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/data/local/kv";
import { buildBackup, wipeAllData, LOCAL_DATA_KEYS } from "@/data/local/backup";
import { createLocalMemberRepository } from "@/data/local/member-repository";
import { createLocalVenueRepository } from "@/data/local/venue-repository";

describe("local backup", () => {
  it("buildBackup snapshots every collection with schema metadata", async () => {
    const kv = createMemoryKV();
    await createLocalMemberRepository(kv).add({ name: "Alice", pin: "x" });
    await createLocalVenueRepository(kv).add("Park A", "x");

    const backup = await buildBackup(kv);
    expect(backup.schemaVersion).toBe(1);
    expect(typeof backup.exportedAt).toBe("string");
    expect(backup.collections.cs_members).toMatchObject([{ name: "Alice" }]);
    expect(backup.collections.cs_venues).toEqual(["Park A"]);
    // Every known key appears, even when empty — restore code can rely on it.
    for (const key of LOCAL_DATA_KEYS) {
      expect(backup.collections).toHaveProperty(key);
    }
  });

  it("wipeAllData clears every collection AND the id sequence", async () => {
    const kv = createMemoryKV();
    const members = createLocalMemberRepository(kv);
    await members.add({ name: "Alice", pin: "x" });
    await wipeAllData(kv);
    expect(await members.listAll()).toEqual([]);
    // Sequence must reset too — otherwise a "fresh" app starts ids at 2.
    const next = await members.add({ name: "Bob", pin: "x" });
    expect(next.id).toBe(1);
  });
});
