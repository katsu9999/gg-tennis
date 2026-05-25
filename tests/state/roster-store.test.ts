import { describe, expect, it, vi } from "vitest";
import { createRosterStore } from "@/state/roster-store";
import type { Member } from "@/engine/models";
import type { MemberRepository } from "@/data/member-repository";

const members: Member[] = [
  { id: 1, name: "A", status: "active", createdAt: new Date("2026-01-01") },
  { id: 2, name: "B", status: "archived", createdAt: new Date("2026-01-02") },
];

const PIN = "test-pin";

function makeRepo(): MemberRepository {
  return {
    listAll: vi.fn().mockResolvedValue(members),
    listActive: vi.fn().mockResolvedValue(members.filter(m => m.status === "active")),
    add: vi.fn().mockImplementation(async ({ name }: { name: string; pin: string }) => ({
      id: 99,
      name,
      status: "active",
      createdAt: new Date(),
    })),
    rename: vi.fn().mockImplementation(async (id: number, name: string) => ({
      ...members[0]!,
      id,
      name,
    })),
    archive: vi.fn().mockImplementation(async (id: number) => ({
      ...members.find(m => m.id === id)!,
      status: "archived" as const,
    })),
    unarchive: vi.fn().mockImplementation(async (id: number) => ({
      ...members.find(m => m.id === id)!,
      status: "active" as const,
    })),
    hardDelete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("roster store", () => {
  it("starts with empty list", () => {
    const store = createRosterStore(makeRepo());
    expect(store.all.value).toEqual([]);
    expect(store.active.value).toEqual([]);
    expect(store.archived.value).toEqual([]);
  });

  it("load() populates active and archived", async () => {
    const store = createRosterStore(makeRepo());
    await store.load();
    expect(store.all.value).toHaveLength(2);
    expect(store.active.value).toHaveLength(1);
    expect(store.archived.value).toHaveLength(1);
  });

  it("add() appends the new member to all", async () => {
    const repo = makeRepo();
    const store = createRosterStore(repo);
    await store.load();
    await store.add("New", PIN);
    expect(store.active.value.map(m => m.name)).toContain("New");
    expect(repo.add).toHaveBeenCalledWith({ name: "New", pin: PIN });
  });

  it("rename() replaces the member in place", async () => {
    const repo = makeRepo();
    const store = createRosterStore(repo);
    await store.load();
    await store.rename(1, "A-renamed", PIN);
    expect(store.all.value.find(m => m.id === 1)?.name).toBe("A-renamed");
    expect(repo.rename).toHaveBeenCalledWith(1, "A-renamed", PIN);
  });

  it("archive() flips status to archived", async () => {
    const store = createRosterStore(makeRepo());
    await store.load();
    await store.archive(1, PIN);
    expect(store.active.value).toHaveLength(0);
    expect(store.archived.value).toHaveLength(2);
  });

  it("hardDelete() removes the member entirely", async () => {
    const repo = makeRepo();
    const store = createRosterStore(repo);
    await store.load();
    await store.hardDelete(1, PIN);
    expect(store.all.value).toHaveLength(1);
    expect(store.all.value.find(m => m.id === 1)).toBeUndefined();
    expect(repo.hardDelete).toHaveBeenCalledWith(1, PIN);
  });
});
