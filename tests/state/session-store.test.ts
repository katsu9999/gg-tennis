import { describe, expect, it, vi } from "vitest";
import { createSessionStore } from "@/state/session-store";
import type { PairHistory } from "@/engine/models";
import { DEFAULT_SHUFFLE_CONFIG } from "@/engine/shuffle-config";
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
      update: vi.fn().mockImplementation(async (r: SessionRow) => {
        upsertedRows.push(r);
      }),
      deleteById: vi.fn().mockResolvedValue(undefined),
      deleteOngoing: vi.fn().mockResolvedValue(undefined),
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
      editPastCourtWinner: vi.fn().mockResolvedValue(undefined),
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
    // startNewSession itself checks for a stale ongoing row; resume must not
    // hit the repo again once a session is in memory.
    const callsAfterStart = vi.mocked(deps.sessionRepo.loadOngoing).mock.calls.length;
    const before = store.session.value;
    await store.resume();
    expect(store.session.value).toBe(before);
    expect(vi.mocked(deps.sessionRepo.loadOngoing).mock.calls.length).toBe(callsAfterStart);
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

  it("resume replays persisted rounds into pair history so endSession flushes them", async () => {
    const deps = makeDeps();
    // Ongoing row with one already-played round: 1&2 vs 3&4.
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue({
      id: "sess-replay",
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
      today_stats: {},
      next_today_number: 5,
      current_round_index: 0,
      created_at: "2026-05-31T08:00:00Z",
      host_token: null,
      host_label: null,
    });

    const store = createSessionStore(deps);
    await store.resume();
    await store.endSession();

    // The pre-reload round MUST reach pair history at endSession, or
    // cross-session fairness silently degrades after every phone-lock reload.
    expect(deps.historyRepo.upsertPairWeights).toHaveBeenCalledTimes(1);
    const updates = (deps.historyRepo.upsertPairWeights as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { a: number; b: number; partnerW: number; opponentW: number }[];
    const p12 = updates.find((u) => u.a === 1 && u.b === 2);
    const p34 = updates.find((u) => u.a === 3 && u.b === 4);
    const o13 = updates.find((u) => u.a === 1 && u.b === 3);
    expect(p12?.partnerW ?? 0).toBeGreaterThan(0);
    expect(p34?.partnerW ?? 0).toBeGreaterThan(0);
    expect(o13?.opponentW ?? 0).toBeGreaterThan(0);
  });

  it("nextRound ignores a second call while the first is still in flight (double-tap)", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);

    // Slow the persist so the second tap lands while the first is awaiting.
    deps.sessionRepo.upsert = vi
      .fn()
      .mockImplementation(() => new Promise<void>((res) => setTimeout(res, 20)));

    const p1 = store.nextRound();
    expect(store.generating?.value).toBe(true);
    const p2 = store.nextRound(); // double-tap — must be a no-op
    await Promise.all([p1, p2]);

    expect(store.session.value!.rounds).toHaveLength(1);
    expect(store.session.value!.currentRoundIndex).toBe(0);
    expect(store.generating?.value).toBe(false);
  });

  it("startNewSession rejects when an ongoing session already exists in DB", async () => {
    const deps = makeDeps();
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue({
      id: "sess-stale",
      status: "ongoing",
      planned_session_id: null,
      date: "2026-05-30",
      location: "Hendon",
      court_count: 2,
      allow_singles: false,
      attendees: [],
      rounds: [],
      today_stats: {},
      next_today_number: 1,
      current_round_index: -1,
      created_at: "2026-05-30T08:00:00Z",
      host_token: null,
      host_label: null,
    });

    const store = createSessionStore(deps);
    await expect(store.startNewSession(baseInput)).rejects.toThrow(/未終了/);
    // Must not create a second ongoing row.
    expect(deps.sessionRepo.upsert).not.toHaveBeenCalled();
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
});

// ---------------------------------------------------------------------------
// created_at preservation + discardSession (2026-08-02: four same-day rows on
// 2026-07-18 — created_at was rewritten on every save, and never-played
// sessions piled up as junk 'past' rows)
// ---------------------------------------------------------------------------

describe("created_at preservation", () => {
  it("keeps the same created_at across start, rounds, and endSession", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    const created = deps.upsertedRows[0]!.created_at;
    expect(created).toBeTruthy();

    await store.nextRound();
    await store.recordWinner(1, "A");
    await store.endSession();

    for (const row of deps.upsertedRows) {
      expect(row.created_at).toBe(created);
    }
  });

  it("resume preserves the DB row's created_at on subsequent saves", async () => {
    const deps = makeDeps();
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue({
      id: "sess-ca",
      status: "ongoing",
      planned_session_id: null,
      date: "2026-05-31",
      location: "Hendon",
      court_count: 2,
      allow_singles: false,
      attendees: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
        ref: { kind: "member", memberId: id },
        todayNumber: id,
        isGuest: false,
      })),
      rounds: [],
      today_stats: {},
      next_today_number: 9,
      current_round_index: -1,
      created_at: "2026-05-31T08:00:00Z",
      host_token: null,
      host_label: null,
    });
    const store = createSessionStore(deps);
    await store.resume();
    await store.nextRound();

    expect(deps.upsertedRows.at(-1)!.created_at).toBe("2026-05-31T08:00:00Z");
  });
});

describe("discardSession", () => {
  it("deletes the ongoing row and does NOT flush pair history", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    await store.nextRound();
    const id = store.session.value!.id;

    await store.discardSession();

    expect(deps.sessionRepo.deleteOngoing).toHaveBeenCalledWith(id);
    expect(deps.historyRepo.upsertPairWeights).not.toHaveBeenCalled();
    // No ongoing→past update either — the row is gone, not archived.
    expect(deps.sessionRepo.update).not.toHaveBeenCalled();
    expect(store.session.value).toBeNull();
  });

  it("keeps the in-memory session when the delete is rejected", async () => {
    const deps = makeDeps();
    deps.sessionRepo.deleteOngoing = vi.fn().mockRejectedValue(new Error("discard_blocked"));
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);

    await expect(store.discardSession()).rejects.toThrow("discard_blocked");
    expect(store.session.value).not.toBeNull();
  });

  it("is a silent no-op without an active session", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.discardSession();
    expect(deps.sessionRepo.deleteOngoing).not.toHaveBeenCalled();
  });
});

describe("shuffle config + gender (v1.6)", () => {
  it("snapshots shuffleConfig + genders at start and persists shuffle_config", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession({
      ...baseInput,
      memberIds: [1, 2, 3, 4],
      shuffleConfig: { genderBalance: true, genderStrength: "strong", pairStrength: "mid", oppStrength: "mid" },
      memberGenders: new Map([
        [1, "male"],
        [2, "male"],
        [3, "female"],
        [4, "female"],
      ]),
    });
    const s = store.session.value!;
    expect(s.shuffleConfig.genderBalance).toBe(true);
    expect(s.attendees.find(a => a.ref.kind === "member" && a.ref.memberId === 3)?.gender).toBe("female");
    const last = deps.upsertedRows[deps.upsertedRows.length - 1]!;
    expect(last.shuffle_config).toMatchObject({ genderBalance: true, genderStrength: "strong" });
  });

  it("defaults to DEFAULT_SHUFFLE_CONFIG and unknown genders when input omits them", async () => {
    const deps = makeDeps();
    const store = createSessionStore(deps);
    await store.startNewSession(baseInput);
    const s = store.session.value!;
    expect(s.shuffleConfig).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(s.attendees[0]!.gender).toBe("unknown");
  });

  it("defaults shuffleConfig for legacy rows on resume", async () => {
    const deps = makeDeps();
    deps.sessionRepo.loadOngoing = vi.fn().mockResolvedValue({
      id: "sess-legacy",
      status: "ongoing" as const,
      planned_session_id: null,
      date: "2026-05-31",
      location: "Hendon",
      court_count: 2,
      allow_singles: false,
      attendees: [
        { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
        { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
      ],
      rounds: [],
      today_stats: {
        '{"kind":"member","memberId":1}': { play: 0, rest: 0 },
        '{"kind":"member","memberId":2}': { play: 0, rest: 0 },
      },
      next_today_number: 3,
      current_round_index: -1,
      created_at: "2026-05-31T08:00:00Z",
      host_token: null,
      host_label: null,
      // no shuffle_config key — pre-v1.6 row
    });
    const store = createSessionStore(deps);
    await store.resume();
    expect(store.session.value!.shuffleConfig).toEqual(DEFAULT_SHUFFLE_CONFIG);
  });
});
