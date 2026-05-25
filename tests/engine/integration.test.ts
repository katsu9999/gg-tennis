import { describe, expect, it } from "vitest";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import { applyRoundToHistory, applyRoundToSameSession } from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import type { AttendeeRef, PairHistory } from "@/engine/models";

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });

describe("engine integration (full session simulation)", () => {
  it("11-person 3-court session produces fair play counts and avoids repeats", () => {
    const attendees = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(ref);
    const courts = 3;
    const rng = mulberry32(42);

    const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
    const ss = { partner: new Map<string, number>(), opp: new Map<string, number>() };
    const playCount = new Map<string, number>();
    const restCount = new Map<string, number>();
    const k = (r: AttendeeRef) => JSON.stringify(r);
    let prevResters: AttendeeRef[] = [];

    for (let round = 0; round < 5; round++) {
      const plan = planRound(attendees.length, courts, true);
      const resters = selectResters(attendees, plan.resters, playCount, prevResters, rng);
      const seated = attendees.filter(a => !resters.some(r => k(r) === k(a)));
      const built = buildRound(seated, plan.doublesCourts, plan.singlesCourts, hist, ss, rng);

      // Safety invariant: no player is double-booked across courts within a single round,
      // and no seated player is also resting.
      const seen = new Set<string>();
      for (const c of built.courts) {
        for (const r of [...c.teamA, ...c.teamB]) {
          const key = k(r);
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      for (const r of resters) expect(seen.has(k(r))).toBe(false);

      for (const c of built.courts)
        for (const r of [...c.teamA, ...c.teamB])
          playCount.set(k(r), (playCount.get(k(r)) ?? 0) + 1);

      for (const r of resters) restCount.set(k(r), (restCount.get(k(r)) ?? 0) + 1);

      applyRoundToHistory(hist, built.courts);
      applyRoundToSameSession(ss, built.courts);
      prevResters = resters;
    }

    // Fairness invariant: max - min play count <= 1
    const counts = attendees.map(a => playCount.get(k(a)) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("computeRankings returns empty maps when no matches fall in the window", async () => {
    const { computeRankings } = await import("@/engine/ranking");
    const r = computeRankings([], [], {
      from: new Date("2026-01-01"),
      to: new Date("2027-01-01"),
    });
    expect(r.elo.size).toBe(0);
    expect(r.record.size).toBe(0);
    expect(r.pair.size).toBe(0);
    expect(r.attendance.size).toBe(0);
  });
});
