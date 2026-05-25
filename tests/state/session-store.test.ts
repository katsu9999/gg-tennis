import { describe, expect, it, vi } from "vitest";
import { createSessionStore } from "@/state/session-store";
import type { PairHistory } from "@/engine/models";
import type { SessionRepository, SessionRow } from "@/data/session-repository";
import type { HistoryRepository } from "@/data/history-repository";
import type { MatchLogRepository } from "@/data/match-log-repository";

const emptyHist = (): PairHistory => ({ partnerW: new Map(), opponentW: new Map() });

function makeDeps() {
  const upsertedRows: SessionRow[] = [];
  const addedMatches: unknown[] = [];
  return {
    upsertedRows,
    addedMatches,
    sessionRepo: {
      loadOngoing: vi.fn().mockResolvedValue(null),
      loadPast: vi.fn().mockResolvedValue([]),
      loadById: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async (r: SessionRow) => {
        upsertedRows.push(r);
      }),
    } satisfies SessionRepository,
    historyRepo: {
      loadPairHistory: vi.fn().mockResolvedValue(emptyHist()),
      upsertPairWeights: vi.fn().mockResolvedValue(undefined),
      decayAll: vi.fn().mockResolvedValue(undefined),
    } satisfies HistoryRepository,
    matchLogRepo: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockImplementation(async (m: unknown) => {
        addedMatches.push(m);
        return m;
      }),
      deleteBySession: vi.fn().mockResolvedValue(undefined),
    } satisfies MatchLogRepository,
  };
}

const baseInput = {
  date: new Date("2026-05-25"),
  location: "GG Tennis Club",
  courtCount: 2,
  allowSingles: false,
  memberIds: [1, 2, 3, 4, 5, 6, 7, 8],
};

describe("session store", () => {
  // Test 1: session starts null
  it("session.value is null before any action", () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    expect(store.session.value).toBeNull();
  });

  // Test 2: startNewSession seeds attendees with todayNumbers 1..N
  it("startNewSession assigns todayNumbers 1..N in memberIds order", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);

    const s = store.session.value!;
    expect(s).not.toBeNull();
    expect(s.attendees).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(s.attendees[i]!.todayNumber).toBe(i + 1);
      expect(s.attendees[i]!.ref).toEqual({ kind: "member", memberId: baseInput.memberIds[i] });
    }
  });

  // Test 3: startNewSession persists once to sessionRepo.upsert
  it("startNewSession calls sessionRepo.upsert exactly once", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);

    expect(deps.sessionRepo.upsert).toHaveBeenCalledTimes(1);
    expect(deps.upsertedRows).toHaveLength(1);
    const row = deps.upsertedRows[0]!;
    expect(row.status).toBe("ongoing");
    expect(row.location).toBe("GG Tennis Club");
    expect(row.court_count).toBe(2);
  });

  // Test 4: nextRound throws if no active session
  it("nextRound throws if no session is active", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await expect(store.nextRound()).rejects.toThrow();
  });

  // Test 5: nextRound generates a Round with correct shape
  // N=8, courtCount=2, allowSingles=false → 2 doubles, 0 singles, 0 resters
  it("nextRound generates a Round with 2 doubles courts, 0 resters for 8 players 2 courts", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    await store.nextRound();

    const s = store.session.value!;
    expect(s.rounds).toHaveLength(1);
    const round = s.rounds[0]!;
    expect(round.index).toBe(0);
    expect(round.courts).toHaveLength(2);
    expect(round.courts.every(c => c.type === "doubles")).toBe(true);
    expect(round.resters).toHaveLength(0);
  });

  // Test 6: nextRound increments currentRoundIndex and persists
  it("nextRound increments currentRoundIndex and persists after each call", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    const upsertCountAfterStart = deps.upsertedRows.length; // 1

    await store.nextRound();
    expect(store.session.value!.currentRoundIndex).toBe(0);
    expect(deps.upsertedRows.length).toBe(upsertCountAfterStart + 1);

    await store.nextRound();
    expect(store.session.value!.currentRoundIndex).toBe(1);
    expect(deps.upsertedRows.length).toBe(upsertCountAfterStart + 2);
  });

  // Test 7: recordWinner appends a MatchResult to match log AND persists session
  it("recordWinner adds match log entry and persists session", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    await store.nextRound();

    const upsertCountBeforeRecord = deps.upsertedRows.length;
    await store.recordWinner(1, "A");

    // Match log was written
    expect(deps.matchLogRepo.add).toHaveBeenCalledTimes(1);
    const match = deps.addedMatches[0] as { winner: string; courtType: string };
    expect(match.winner).toBe("A");
    expect(match.courtType).toBe("doubles");

    // Session was persisted
    expect(deps.upsertedRows.length).toBe(upsertCountBeforeRecord + 1);
  });

  // Test 8: recordWinner does NOT call matchLogRepo when both teams have memberIds=[]
  it("recordWinner skips matchLogRepo.add when both teams are guests-only", async () => {
    const deps = makeDeps();
    // Use guest-only session
    const store = createSessionStore(deps);
    await store.startNewSession({
      ...baseInput,
      memberIds: [], // no member IDs → all guests
      courtCount: 1,
      allowSingles: true,
    });

    // Manually inject a round with guest-only courts so we can test the guard
    const s = store.session.value!;
    const guestRef = (id: string) => ({ kind: "guest" as const, guestId: id });
    // Directly mutate — we're testing the guard path
    const fakeRound = {
      index: 0,
      courts: [
        {
          number: 1,
          type: "singles" as const,
          teamA: [guestRef("g1")],
          teamB: [guestRef("g2")],
          winner: "none" as const,
        },
      ],
      resters: [],
    };
    s.rounds.push(fakeRound);
    s.currentRoundIndex = 0;

    await store.recordWinner(1, "A");

    expect(deps.matchLogRepo.add).not.toHaveBeenCalled();
  });

  // Test 9: endSession sets status=past, persists, and clears session.value
  it("endSession sets status to past, persists, and clears session signal", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);

    const upsertCountBefore = deps.upsertedRows.length;
    await store.endSession();

    // Persisted with status=past
    expect(deps.upsertedRows.length).toBe(upsertCountBefore + 1);
    const lastRow = deps.upsertedRows[deps.upsertedRows.length - 1]!;
    expect(lastRow.status).toBe("past");

    // Signal cleared
    expect(store.session.value).toBeNull();
  });

  // Bonus: endSession is a no-op when no session is active
  it("endSession returns silently when no session is active", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await expect(store.endSession()).resolves.toBeUndefined();
    expect(deps.sessionRepo.upsert).not.toHaveBeenCalled();
  });

  // Test 11: startNewSession → nextRound → endSession flushes pair history
  // The most critical data-persistence path: history accumulated during the
  // session MUST land in historyRepo.upsertPairWeights at endSession time, or
  // ranking drift accumulates across sessions silently.
  it("endSession flushes accumulated pair history via historyRepo.upsertPairWeights", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession({ ...baseInput, memberIds: [1, 2, 3, 4, 5, 6, 7, 8] });
    await store.nextRound();

    // A round of 8 players in 2 doubles courts produces:
    //  - 2 partner pairs (one per team per court ⇒ 4 partner pairs total, but
    //    since each court has 2 teams of 2, that's C(2,2)=1 partner pair per
    //    team × 4 teams = 4 partner pair-events; written into partnerW as 4 keys)
    //  - 4 × 4 = 16 cross-team opponent pair-events on the 2 courts (8 per court).
    // Exact counts don't matter — the test just asserts the flush happened with
    // non-empty data.
    await store.endSession();

    expect(deps.historyRepo.upsertPairWeights).toHaveBeenCalledTimes(1);
    const updates = (deps.historyRepo.upsertPairWeights as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(Array.isArray(updates)).toBe(true);
    expect((updates as unknown[]).length).toBeGreaterThan(0);
    // Each update row should have the canonical pair key shape (a < b)
    for (const u of updates as { a: number; b: number; partnerW: number; opponentW: number }[]) {
      expect(u.a).toBeLessThan(u.b);
      expect(typeof u.partnerW).toBe("number");
      expect(typeof u.opponentW).toBe("number");
    }
  });
});
