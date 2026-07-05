import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/data/local/kv";
import { createLocalSessionRepository } from "@/data/local/session-repository";
import { createLocalPinStore } from "@/state/local/pin-store";
import { createLocalLiveSessionStore } from "@/state/local/live-session-store";
import {
  createStubPlannedSessionStore,
  createStubRsvpStore,
  createStubRankingStore,
} from "@/state/local/stub-stores";
import type { SessionRow } from "@/data/session-repository";

function sessionRow(): SessionRow {
  return {
    id: crypto.randomUUID(),
    status: "ongoing",
    planned_session_id: null,
    date: "2026-07-05",
    location: "Local Park",
    court_count: 2,
    allow_singles: false,
    attendees: [],
    rounds: [],
    today_stats: {},
    next_today_number: 1,
    current_round_index: -1,
    created_at: new Date().toISOString(),
    host_token: null,
    host_label: null,
  };
}

describe("createLocalPinStore", () => {
  it("is always unlocked: verify succeeds, getPin returns a string, lock is a no-op", async () => {
    const store = createLocalPinStore();
    expect(store.isUnlocked.value).toBe(true);
    expect(await store.verify("anything")).toBe(true);
    expect(typeof store.getPin()).toBe("string");
    store.lock();
    expect(store.isUnlocked.value).toBe(true);
    expect(store.getPin()).not.toBeNull();
  });

  it("setClubPin rejects loudly — there is no PIN to rotate locally", async () => {
    const store = createLocalPinStore();
    await expect(store.setClubPin("567890")).rejects.toThrow(/local/i);
  });
});

describe("createLocalLiveSessionStore", () => {
  it("refresh reads the ongoing session from the repo; subscribe/unsubscribe are safe no-ops", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    const store = createLocalLiveSessionStore(repo);
    expect(store.current.value).toBeNull();
    store.subscribe();
    store.unsubscribe();

    const row = sessionRow();
    await repo.upsert(row);
    await store.refresh();
    expect(store.current.value?.id).toBe(row.id);
  });
});

describe("stub stores (pages excluded from local flavour, but shared pages still call these on mount)", () => {
  it("plannedSessionStore: reads resolve empty, writes reject loudly", async () => {
    const store = createStubPlannedSessionStore();
    await store.load();
    await store.loadNext();
    expect(store.list.value).toEqual([]);
    expect(store.next.value).toBeNull();
    expect(store.loading.value).toBe(false);
    await expect(
      store.create({ date: "2026-07-05" } as never, "pin"),
    ).rejects.toThrow(/local/i);
    await expect(store.rotateToken("x", "pin")).rejects.toThrow(/local/i);
    await expect(store.delete("x", "pin")).rejects.toThrow(/local/i);
  });

  it("rsvpStore: reads resolve empty, counts are zero, writes reject loudly", async () => {
    const store = createStubRsvpStore();
    expect(await store.loadForSession("s1")).toEqual([]);
    expect(store.bySession.value.size).toBe(0);
    expect(store.countsFor("s1")).toEqual({ going: 0, not_going: 0, maybe: 0 });
    expect(store.goingMemberIds("s1")).toEqual([]);
    await expect(store.adminUpsert({} as never, "pin")).rejects.toThrow(/local/i);
    await expect(store.publicUpsertWithToken({} as never)).rejects.toThrow(/local/i);
  });

  it("rankingStore: load and setYear resolve without touching anything", async () => {
    const store = createStubRankingStore();
    await store.load();
    await store.setYear(2026);
    expect(store.ranking.value).toBeNull();
    expect(store.loading.value).toBe(false);
  });
});
