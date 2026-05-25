import { describe, expect, it, vi } from "vitest";
import { createRankingStore } from "@/state/ranking-store";
import type { MatchLogRepository } from "@/data/match-log-repository";
import type { SessionRepository, SessionRow } from "@/data/session-repository";
import type { MatchResult } from "@/engine/models";

const CURRENT_YEAR = new Date().getUTCFullYear();

function makeMatch(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    sessionId: "s-1",
    roundIndex: 0,
    courtType: "doubles",
    teamA: [1, 2],
    teamB: [3, 4],
    winner: "A",
    at: new Date(`${CURRENT_YEAR}-06-01T12:00:00Z`),
    ...overrides,
  };
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s-1",
    status: "past",
    planned_session_id: null,
    date: `${CURRENT_YEAR}-06-01`,
    location: "Court A",
    court_count: 2,
    allow_singles: false,
    attendees: [
      { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
      { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
    ],
    rounds: [],
    today_stats: {},
    next_today_number: 3,
    current_round_index: 0,
    created_at: `${CURRENT_YEAR}-06-01T10:00:00Z`,
    ...overrides,
  };
}

function makeRepos(
  matches: MatchResult[] = [],
  sessions: SessionRow[] = [],
): { matchLogRepo: MatchLogRepository; sessionRepo: SessionRepository } {
  return {
    matchLogRepo: {
      list: vi.fn().mockResolvedValue(matches),
      add: vi.fn(),
      deleteBySession: vi.fn(),
    },
    sessionRepo: {
      loadOngoing: vi.fn().mockResolvedValue(null),
      loadPast: vi.fn().mockResolvedValue(sessions),
      loadById: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("ranking store", () => {
  it("starts with null ranking and current year", () => {
    const store = createRankingStore(makeRepos());
    expect(store.ranking.value).toBeNull();
    expect(store.year.value).toBe(CURRENT_YEAR);
    expect(store.loading.value).toBe(false);
  });

  it("load() populates ranking and resets loading", async () => {
    const matches = [makeMatch()];
    const sessions = [makeSessionRow()];
    const store = createRankingStore(makeRepos(matches, sessions));
    await store.load();
    expect(store.ranking.value).not.toBeNull();
    expect(store.loading.value).toBe(false);
    // member 1 should have an Elo entry since they played
    expect(store.ranking.value!.elo.has(1)).toBe(true);
  });

  it("setYear() updates year signal AND triggers a reload", async () => {
    const repos = makeRepos([makeMatch()], [makeSessionRow()]);
    const store = createRankingStore(repos);
    expect(store.ranking.value).toBeNull();
    await store.setYear(2025);
    expect(store.year.value).toBe(2025);
    expect(store.ranking.value).not.toBeNull();
    // loadPast should have been called once (from setYear → load)
    expect(repos.sessionRepo.loadPast).toHaveBeenCalledTimes(1);
  });

  it("correctly filters matches outside the season window", async () => {
    // Season 2025 = 2025-01-01 to 2026-01-01
    const inWindow = makeMatch({ at: new Date("2025-06-15T12:00:00Z") });
    const outOfWindow = makeMatch({
      sessionId: "s-2",
      at: new Date("2024-06-15T12:00:00Z"),
      teamA: [5, 6],
      teamB: [7, 8],
    });

    const repos = makeRepos([inWindow, outOfWindow], []);
    const store = createRankingStore(repos);
    await store.setYear(2025);

    const { elo } = store.ranking.value!;
    // Players 1-4 played in-window → should have Elo entries
    expect(elo.has(1)).toBe(true);
    expect(elo.has(2)).toBe(true);
    // Players 5-8 played out-of-window → should NOT appear
    expect(elo.has(5)).toBe(false);
    expect(elo.has(6)).toBe(false);
  });
});
