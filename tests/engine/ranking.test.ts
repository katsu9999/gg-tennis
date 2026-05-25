import { describe, expect, it } from "vitest";
import { computeRankings, ELO_INITIAL } from "@/engine/ranking";
import type { MatchResult } from "@/engine/models";

const m = (a: number[], b: number[], winner: "A" | "B", isoDate: string): MatchResult => ({
  sessionId: "s1", roundIndex: 0, courtType: "doubles",
  teamA: a, teamB: b, winner, at: new Date(isoDate),
});

describe("rankings (§6.5)", () => {
  it("initial Elo is 1500", () => {
    expect(ELO_INITIAL).toBe(1500);
  });

  it("season window restricts the set of matches considered", () => {
    const matches: MatchResult[] = [
      m([1, 2], [3, 4], "A", "2025-06-01"),
      m([1, 2], [3, 4], "A", "2026-06-01"),
    ];
    const r2026 = computeRankings(matches, [], {
      from: new Date("2026-01-01"), to: new Date("2027-01-01"),
    });
    expect(r2026.record.get(1)?.win).toBe(1);
    expect(r2026.record.get(3)?.win).toBeFalsy();
  });

  it("Elo of winner goes up; loser goes down; symmetric magnitude (provisional)", () => {
    const matches: MatchResult[] = [m([1], [2], "A", "2026-06-01")];
    const r = computeRankings(matches, [], {
      from: new Date("2026-01-01"), to: new Date("2027-01-01"),
    });
    const winner = r.elo.get(1)!;
    const loser = r.elo.get(2)!;
    expect(winner).toBeGreaterThan(ELO_INITIAL);
    expect(loser).toBeLessThan(ELO_INITIAL);
    expect(winner - ELO_INITIAL).toBeCloseTo(ELO_INITIAL - loser, 4);
  });

  it("replay is deterministic", () => {
    const matches: MatchResult[] = [
      m([1, 2], [3, 4], "A", "2026-06-01"),
      m([1, 3], [2, 4], "B", "2026-06-02"),
    ];
    const window = { from: new Date("2026-01-01"), to: new Date("2027-01-01") };
    const a = computeRankings(matches, [], window);
    const b = computeRankings(matches, [], window);
    expect([...a.elo.entries()].sort()).toEqual([...b.elo.entries()].sort());
  });

  it("pair winrate requires minimum matches (default 3)", () => {
    const matches: MatchResult[] = [
      m([1, 2], [3, 4], "A", "2026-06-01"),
      m([1, 2], [3, 4], "A", "2026-06-02"),
    ];
    const r = computeRankings(matches, [], {
      from: new Date("2026-01-01"), to: new Date("2027-01-01"),
    });
    expect(r.pair.size).toBe(0); // only 2 matches, below threshold
  });

  it("attendance count tallies sessions", () => {
    const r = computeRankings([], [
      { sessionId: "s1", date: new Date("2026-01-10"), attendeeMemberIds: [1, 2, 3] },
      { sessionId: "s2", date: new Date("2026-01-17"), attendeeMemberIds: [1, 3] },
      { sessionId: "s3", date: new Date("2025-12-20"), attendeeMemberIds: [1, 4] },
    ], { from: new Date("2026-01-01"), to: new Date("2027-01-01") });
    expect(r.attendance.get(1)).toBe(2);
    expect(r.attendance.get(3)).toBe(2);
    expect(r.attendance.get(4)).toBeUndefined();
  });

  it("guests (no memberId) are excluded from rankings", () => {
    // teamA contains member 1 + guest (simulated by passing -1 as sentinel? no — guests
    // are filtered upstream. Verify that empty memberId arrays are skipped safely.)
    const matches: MatchResult[] = [m([1], [], "A", "2026-06-01")];
    const r = computeRankings(matches, [], {
      from: new Date("2026-01-01"), to: new Date("2027-01-01"),
    });
    // No opponent → match is skipped (cannot compute Elo); winner unchanged.
    expect(r.elo.get(1)).toBeUndefined();
  });
});
