import { describe, expect, it, vi } from "vitest";
import { createPlannedSessionStore } from "@/state/planned-session-store";
import type { PlannedSessionRepository, PlannedSessionRow } from "@/data/planned-session-repository";

const PIN = "test-pin";

function makeRow(overrides: Partial<PlannedSessionRow> = {}): PlannedSessionRow {
  return {
    id: "ps-1",
    date: "2026-06-01",
    location: "Court A",
    court_count: 2,
    allow_singles: false,
    public_rsvp_token: "tok-abc",
    show_going_list_on_public: true,
    created_at: "2026-05-01T00:00:00Z",
    created_by: null,
    ...overrides,
  };
}

function makeRepo(): PlannedSessionRepository {
  const row = makeRow();
  return {
    list: vi.fn().mockResolvedValue([row]),
    loadById: vi.fn().mockResolvedValue(row),
    loadByToken: vi.fn().mockResolvedValue(row),
    loadNext: vi.fn().mockResolvedValue(row),
    create: vi.fn().mockImplementation(async (input) => makeRow({ ...input, id: "ps-new" })),
    rotateToken: vi.fn().mockResolvedValue("tok-new"),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("planned-session store", () => {
  it("starts with empty list and null next", () => {
    const store = createPlannedSessionStore(makeRepo());
    expect(store.list.value).toEqual([]);
    expect(store.next.value).toBeNull();
    expect(store.loading.value).toBe(false);
  });

  it("load() populates list and resets loading", async () => {
    const store = createPlannedSessionStore(makeRepo());
    await store.load();
    expect(store.list.value).toHaveLength(1);
    expect(store.list.value[0]!.id).toBe("ps-1");
    expect(store.loading.value).toBe(false);
  });

  it("loadNext() populates next", async () => {
    const store = createPlannedSessionStore(makeRepo());
    await store.loadNext();
    expect(store.next.value).not.toBeNull();
    expect(store.next.value?.id).toBe("ps-1");
  });

  it("create() appends to list, returns the created row, forwards PIN", async () => {
    const repo = makeRepo();
    const store = createPlannedSessionStore(repo);
    await store.load();
    const created = await store.create({
      date: "2026-07-01",
      location: "Court B",
      court_count: 1,
      allow_singles: true,
      public_rsvp_token: null,
      show_going_list_on_public: false,
      created_by: null,
    }, PIN);
    expect(created.id).toBe("ps-new");
    expect(store.list.value).toHaveLength(2);
    expect(store.list.value.find(r => r.id === "ps-new")).toBeDefined();
    expect(repo.create).toHaveBeenCalledWith(expect.any(Object), PIN);
  });

  it("rotateToken() updates the row's token in list and next", async () => {
    const repo = makeRepo();
    const store = createPlannedSessionStore(repo);
    await store.load();
    await store.loadNext();
    await store.rotateToken("ps-1", PIN);
    expect(store.list.value[0]!.public_rsvp_token).toBe("tok-new");
    expect(store.next.value?.public_rsvp_token).toBe("tok-new");
    expect(repo.rotateToken).toHaveBeenCalledWith("ps-1", PIN);
  });

  it("delete() removes the row from list and clears next if matched", async () => {
    const repo = makeRepo();
    const store = createPlannedSessionStore(repo);
    await store.load();
    await store.loadNext();
    await store.delete("ps-1", PIN);
    expect(store.list.value).toHaveLength(0);
    expect(store.next.value).toBeNull();
    expect(repo.delete).toHaveBeenCalledWith("ps-1", PIN);
  });
});
