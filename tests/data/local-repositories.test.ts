import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/data/local/kv";
import { createLocalMemberRepository } from "@/data/local/member-repository";
import { createLocalVenueRepository } from "@/data/local/venue-repository";
import { createLocalHistoryRepository } from "@/data/local/history-repository";
import { createLocalSessionRepository } from "@/data/local/session-repository";
import { createLocalMatchLogRepository } from "@/data/local/match-log-repository";
import type { SessionRow } from "@/data/session-repository";

// Behavioural contract of the Supabase repositories, asserted against the
// local implementations. Only the local impls can run in CI (the Supabase
// ones need a live server), so this file IS the contract record.

const PIN = "ignored"; // local repos accept and ignore the pin argument

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
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
    ...overrides,
  };
}

describe("createLocalMemberRepository", () => {
  it("starts empty and adds members with sequential ids", async () => {
    const repo = createLocalMemberRepository(createMemoryKV());
    expect(await repo.listAll()).toEqual([]);
    const a = await repo.add({ name: "Alice", pin: PIN });
    const b = await repo.add({ name: "Bob", pin: PIN });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.status).toBe("active");
    expect(a.createdAt).toBeInstanceOf(Date);
  });

  it("listAll sorts by name; listActive excludes archived", async () => {
    const repo = createLocalMemberRepository(createMemoryKV());
    await repo.add({ name: "Zoe", pin: PIN });
    const bob = await repo.add({ name: "Bob", pin: PIN });
    await repo.archive(bob.id, PIN);
    expect((await repo.listAll()).map((m) => m.name)).toEqual(["Bob", "Zoe"]);
    expect((await repo.listActive()).map((m) => m.name)).toEqual(["Zoe"]);
  });

  it("rename / archive / unarchive round-trip", async () => {
    const repo = createLocalMemberRepository(createMemoryKV());
    const m = await repo.add({ name: "Alice", pin: PIN });
    expect((await repo.rename(m.id, "Alicia", PIN)).name).toBe("Alicia");
    expect((await repo.archive(m.id, PIN)).status).toBe("archived");
    expect((await repo.unarchive(m.id, PIN)).status).toBe("active");
  });

  it("does not reuse ids after a hardDelete", async () => {
    const repo = createLocalMemberRepository(createMemoryKV());
    await repo.add({ name: "Alice", pin: PIN });
    const b = await repo.add({ name: "Bob", pin: PIN });
    await repo.hardDelete(b.id, PIN);
    const c = await repo.add({ name: "Carol", pin: PIN });
    expect(c.id).toBe(3); // ids are permanent — pair history keys reference them
  });

  it("hardDelete cascades to pair history (mirrors the DB FK cascade)", async () => {
    const kv = createMemoryKV();
    const members = createLocalMemberRepository(kv);
    const history = createLocalHistoryRepository(kv);
    const a = await members.add({ name: "Alice", pin: PIN });
    const b = await members.add({ name: "Bob", pin: PIN });
    const c = await members.add({ name: "Carol", pin: PIN });
    await history.upsertPairWeights([
      { a: a.id, b: b.id, partnerW: 1, opponentW: 0 },
      { a: b.id, b: c.id, partnerW: 2, opponentW: 1 },
    ]);
    await members.hardDelete(a.id, PIN);
    const ph = await history.loadPairHistory();
    expect(ph.partnerW.has(`${a.id}:${b.id}`)).toBe(false);
    expect(ph.partnerW.get(`${b.id}:${c.id}`)).toBe(2);
  });
});

describe("createLocalVenueRepository", () => {
  it("lists names sorted and treats duplicate adds as no-ops", async () => {
    const repo = createLocalVenueRepository(createMemoryKV());
    expect(await repo.list()).toEqual([]);
    await repo.add("Park B", PIN);
    await repo.add("Park A", PIN);
    await repo.add("Park B", PIN); // duplicate — GG swallows unique violations
    expect(await repo.list()).toEqual(["Park A", "Park B"]);
  });
});

describe("createLocalHistoryRepository", () => {
  it("returns empty maps initially and round-trips pair weights (a/b normalized)", async () => {
    const repo = createLocalHistoryRepository(createMemoryKV());
    const empty = await repo.loadPairHistory();
    expect(empty.partnerW.size).toBe(0);
    // Deliberately pass a > b — the key must normalize to min:max.
    await repo.upsertPairWeights([{ a: 9, b: 2, partnerW: 1.5, opponentW: 0.5 }]);
    const ph = await repo.loadPairHistory();
    expect(ph.partnerW.get("2:9")).toBe(1.5);
    expect(ph.opponentW.get("2:9")).toBe(0.5);
  });

  it("upsert overwrites existing pairs; decayAll multiplies every weight", async () => {
    const repo = createLocalHistoryRepository(createMemoryKV());
    await repo.upsertPairWeights([
      { a: 1, b: 2, partnerW: 2, opponentW: 4 },
      { a: 2, b: 3, partnerW: 1, opponentW: 1 },
    ]);
    await repo.upsertPairWeights([{ a: 1, b: 2, partnerW: 3, opponentW: 4 }]);
    await repo.decayAll(0.5);
    const ph = await repo.loadPairHistory();
    expect(ph.partnerW.get("1:2")).toBe(1.5);
    expect(ph.opponentW.get("1:2")).toBe(2);
    expect(ph.partnerW.get("2:3")).toBe(0.5);
  });
});

describe("createLocalSessionRepository", () => {
  it("loadOngoing returns null when nothing is ongoing", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    expect(await repo.loadOngoing()).toBeNull();
    expect(await repo.loadPast()).toEqual([]);
  });

  it("upsert stores an ongoing session and loadOngoing/loadById find it", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    const row = sessionRow();
    await repo.upsert(row);
    expect((await repo.loadOngoing())?.id).toBe(row.id);
    expect((await repo.loadById(row.id))?.id).toBe(row.id);
    expect(await repo.loadById("missing")).toBeNull();
  });

  it("upsert with the same id replaces, not duplicates", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    const row = sessionRow();
    await repo.upsert(row);
    await repo.upsert({ ...row, current_round_index: 3 });
    const loaded = await repo.loadOngoing();
    expect(loaded?.current_round_index).toBe(3);
  });

  it("ending a session (status past via update) moves it out of ongoing into past", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    const row = sessionRow();
    await repo.upsert(row);
    await repo.update({ ...row, status: "past" });
    expect(await repo.loadOngoing()).toBeNull();
    const past = await repo.loadPast();
    expect(past.map((s) => s.id)).toEqual([row.id]);
    expect((await repo.loadById(row.id))?.status).toBe("past");
  });

  it("loadPast returns sessions ordered by date ascending", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    await repo.upsert(sessionRow({ status: "past", date: "2026-07-05" }));
    await repo.upsert(sessionRow({ status: "past", date: "2026-06-01" }));
    expect((await repo.loadPast()).map((s) => s.date)).toEqual(["2026-06-01", "2026-07-05"]);
  });

  it("when multiple ongoing rows exist, loadOngoing adopts the most recent (GG parity)", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    await repo.upsert(sessionRow({ created_at: "2026-07-01T10:00:00Z" }));
    const newer = sessionRow({ created_at: "2026-07-05T10:00:00Z" });
    await repo.upsert(newer);
    expect((await repo.loadOngoing())?.id).toBe(newer.id);
  });

  it("deleteById removes from either bucket and ignores the pin", async () => {
    const repo = createLocalSessionRepository(createMemoryKV());
    const ongoing = sessionRow();
    const past = sessionRow({ status: "past" });
    await repo.upsert(ongoing);
    await repo.upsert(past);
    await repo.deleteById(ongoing.id, PIN);
    await repo.deleteById(past.id, PIN);
    expect(await repo.loadOngoing()).toBeNull();
    expect(await repo.loadPast()).toEqual([]);
  });
});

describe("createLocalMatchLogRepository (no-op stub — winner recording is cut from local v1)", () => {
  it("satisfies the interface without persisting anything", async () => {
    const repo = createLocalMatchLogRepository();
    const added = await repo.add({
      sessionId: "s1",
      roundIndex: 0,
      courtType: "doubles",
      teamA: [1, 2],
      teamB: [3, 4],
      winner: "A",
    });
    expect(added.at).toBeInstanceOf(Date);
    expect(await repo.list()).toEqual([]);
    await repo.deleteBySession("s1");
    await repo.deleteByRoundCourt("s1", 0, [1, 2]);
    await repo.editPastCourtWinner({
      pin: PIN,
      sessionId: "s1",
      roundIndex: 0,
      teamA: [1, 2],
      teamB: [3, 4],
      courtType: "doubles",
      winner: "B",
      rounds: [],
    });
  });
});
