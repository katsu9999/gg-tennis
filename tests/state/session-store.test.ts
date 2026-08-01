import { describe, expect, it, vi } from "vitest";
import { createSessionStore } from "@/state/session-store";
import type { PairHistory } from "@/engine/models";
import type { SessionRepository, SessionRow } from "@/data/session-repository";
import type { HistoryRepository } from "@/data/history-repository";
import type { MatchLogRepository } from "@/data/match-log-repository";
import { selectResters } from "@/engine/rester-selector";

// Pass-through spy — behaviour identical, but calls are observable so we can
// assert the store wires session opponent coverage (metDegree) into the
// rester selection.
vi.mock("@/engine/rester-selector", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/engine/rester-selector")>();
  return { ...mod, selectResters: vi.fn(mod.selectResters) };
});

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
      update: vi.fn().mockImplementation(async (r: SessionRow) => {
        upsertedRows.push(r);
      }),
      deleteById: vi.fn().mockResolvedValue(undefined),
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
      deleteByRoundCourt: vi.fn().mockResolvedValue(undefined),
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

  it("recordWinner(null) clears court.winner and deletes the match log row", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    await store.nextRound();

    await store.recordWinner(1, "A");
    expect(store.session.value!.rounds[0]!.courts[0]!.winner).toBe("A");
    expect(deps.matchLogRepo.add).toHaveBeenCalledTimes(1);

    await store.recordWinner(1, null);
    expect(store.session.value!.rounds[0]!.courts[0]!.winner).toBe("none");
    expect(deps.matchLogRepo.deleteByRoundCourt).toHaveBeenCalled();
  });

  it("recordWinner switching A→B replaces the match log row", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    await store.nextRound();

    await store.recordWinner(1, "A");
    await store.recordWinner(1, "B");

    expect(store.session.value!.rounds[0]!.courts[0]!.winner).toBe("B");
    expect(deps.matchLogRepo.add).toHaveBeenCalledTimes(2);
    // Each set call deletes any prior row for this court before inserting.
    expect(deps.matchLogRepo.deleteByRoundCourt).toHaveBeenCalledTimes(2);
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

  // ----- resume from DB (phone-lock / PWA reload recovery) -----

  it("resume is a no-op when sessionStore already has a session", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    const before = store.session.value;
    await store.resume();
    expect(store.session.value).toBe(before);
    expect(deps.sessionRepo.loadOngoing).not.toHaveBeenCalled();
  });

  it("resume hydrates session from sessionRepo.loadOngoing when memory is empty", async () => {
    const deps = makeDeps();
    // Pre-populate the repo with an ongoing row that includes a round
    const persistedRow = {
      id: "sess-resume",
      status: "ongoing" as const,
      planned_session_id: null,
      date: "2026-05-31",
      location: "Hendon",
      court_count: 2,
      allow_singles: false,
      attendees: [
        { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
        { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
        { ref: { kind: "member", memberId: 3 }, todayNumber: 3, isGuest: false },
        { ref: { kind: "member", memberId: 4 }, todayNumber: 4, isGuest: false },
      ],
      rounds: [
        {
          index: 0,
          courts: [
            {
              number: 1,
              type: "doubles",
              teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
              teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 4 }],
              winner: "A",
            },
          ],
          resters: [],
        },
      ],
      today_stats: {
        '{"kind":"member","memberId":1}': { play: 1, rest: 0 },
        '{"kind":"member","memberId":2}': { play: 1, rest: 0 },
        '{"kind":"member","memberId":3}': { play: 1, rest: 0 },
        '{"kind":"member","memberId":4}': { play: 1, rest: 0 },
      },
      next_today_number: 5,
      current_round_index: 0,
      created_at: "2026-05-31T08:00:00Z",
      host_token: "tok-abc",
      host_label: "Katsu",
    };
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue(persistedRow);

    const store = createSessionStore(deps);
    expect(store.session.value).toBeNull();

    await store.resume();

    const s = store.session.value;
    expect(s).not.toBeNull();
    expect(s!.id).toBe("sess-resume");
    expect(s!.location).toBe("Hendon");
    expect(s!.rounds).toHaveLength(1);
    expect(s!.rounds[0]!.courts[0]!.winner).toBe("A");
    expect(s!.currentRoundIndex).toBe(0);
    expect(s!.attendees).toHaveLength(4);
    expect(s!.hostLabel).toBe("Katsu");
    // today_stats was JSONB Record; should be rebuilt into a Map
    expect(s!.todayStats.size).toBe(4);
    // Pair history should be loaded so the next round-builder call has data
    expect(deps.historyRepo.loadPairHistory).toHaveBeenCalled();
  });

  it("resume is a silent no-op when no ongoing session exists in DB", async () => {
    const deps = makeDeps();
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue(null);
    const store = createSessionStore(deps);
    await store.resume();
    expect(store.session.value).toBeNull();
  });

  it("resume → nextRound continues from currentRoundIndex+1, not from R1", async () => {
    const deps = makeDeps();
    // Persisted session sitting at R2 (index 1) of 2 rounds.
    const round = (idx: number) => ({
      index: idx,
      courts: [
        {
          number: 1,
          type: "doubles",
          teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
          teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 4 }],
          winner: "none",
        },
      ],
      resters: [],
    });
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue({
      id: "sess-x",
      status: "ongoing",
      planned_session_id: null,
      date: "2026-05-31",
      location: "Hendon",
      court_count: 1,
      allow_singles: false,
      attendees: [1, 2, 3, 4].map((id) => ({
        ref: { kind: "member", memberId: id },
        todayNumber: id,
        isGuest: false,
      })),
      rounds: [round(0), round(1)],
      today_stats: {},
      next_today_number: 5,
      current_round_index: 1,
      created_at: "2026-05-31T08:00:00Z",
      host_token: null,
      host_label: null,
    });

    const store = createSessionStore(deps);
    await store.resume();
    expect(store.session.value!.currentRoundIndex).toBe(1);
    expect(store.session.value!.rounds).toHaveLength(2);

    await store.nextRound();
    // Already at the latest persisted round → nextRound generates R3 (index 2)
    expect(store.session.value!.rounds).toHaveLength(3);
    expect(store.session.value!.currentRoundIndex).toBe(2);
  });

  it("nextRound passes session opponent coverage (metDegree) to selectResters", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput); // 8 players, 2 courts → all seated

    vi.mocked(selectResters).mockClear();
    await store.nextRound(); // R1: nobody has met anyone yet
    let metDegree = vi.mocked(selectResters).mock.calls.at(-1)![5]!;
    expect(metDegree).toBeInstanceOf(Map);
    expect(metDegree.size).toBe(0);

    await store.nextRound(); // R2: R1 was 2 doubles courts → everyone faced exactly 2
    metDegree = vi.mocked(selectResters).mock.calls.at(-1)![5]!;
    expect(metDegree.size).toBe(8);
    for (const id of baseInput.memberIds) {
      expect(metDegree.get(id)).toBe(2);
    }
  });
});
