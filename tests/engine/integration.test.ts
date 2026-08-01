import { describe, expect, it } from "vitest";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import { applyRoundToHistory, applyRoundToSameSession } from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import type { AttendeeRef, PairHistory } from "@/engine/models";
import { memberIdsFrom, pairKey } from "@/engine/models";

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

  it("GG night (12 ppl, 3 doubles, 5 rounds) keeps partner repeats to a minimum", () => {
    // Exact theoretical minimum: each player partners 5 different people across
    // 5 rounds out of 11 possible, so 0 repeats is achievable. Real-world: a
    // greedy search may settle for a couple of repeats. We assert it stays
    // single-digit so a regression in the weights or attempt count is loud.
    const attendees = Array.from({ length: 12 }, (_, i) => ref(i + 1));
    const courts = 3;
    const rng = mulberry32(7);

    const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
    const ss = { partner: new Map<string, number>(), opp: new Map<string, number>() };
    const playCount = new Map<string, number>();
    const k = (r: AttendeeRef) => JSON.stringify(r);
    let prevResters: AttendeeRef[] = [];

    let partnerRepeatCount = 0; // total pair-events that revisited a prior pair

    for (let round = 0; round < 5; round++) {
      const plan = planRound(attendees.length, courts, false); // all doubles
      const resters = selectResters(attendees, plan.resters, playCount, prevResters, rng);
      const seated = attendees.filter(a => !resters.some(r => k(r) === k(a)));
      const built = buildRound(seated, plan.doublesCourts, plan.singlesCourts, hist, ss, rng);

      for (const c of built.courts) {
        const teams = [c.teamA, c.teamB] as const;
        for (const team of teams) {
          // NOTE: ss.partner keys are numeric pairKey(a, b) strings — the
          // original version of this test built JSON-based keys and therefore
          // always counted 0 (the assertion could never fail). Fixed to use
          // the real key format.
          const ids = team
            .map(t => (t.kind === "member" ? t.memberId : -1))
            .filter(id => id > 0);
          if (ids.length === 2) {
            if ((ss.partner.get(pairKey(ids[0]!, ids[1]!)) ?? 0) > 0) partnerRepeatCount += 1;
          }
        }
        for (const r of [...c.teamA, ...c.teamB]) {
          playCount.set(k(r), (playCount.get(k(r)) ?? 0) + 1);
        }
      }
      applyRoundToHistory(hist, built.courts);
      applyRoundToSameSession(ss, built.courts);
      prevResters = resters;
    }

    // 5 rounds × 3 courts × 2 teams = 30 pair-events total. With perfect
    // scheduling all 30 are unique. We expect the greedy search to stay close.
    expect(partnerRepeatCount).toBeLessThan(5);
  });

  it("N=11 night: coverage-aware rester tie-break lifts opponent coverage without partner repeats", () => {
    // Mirrors the session-store round loop, including the metDegree wiring.
    // Baseline (no metDegree) over these seeds averages ~6.1 never-met pairs
    // at 6 rounds; the coverage tie-break brings it down (~5.3 in a 500-trial
    // sim). Assert the improved level so a regression is loud.
    const k = (r: AttendeeRef) => JSON.stringify(r);
    const runNight = (seed: number, useMetDegree: boolean) => {
      const attendees = Array.from({ length: 11 }, (_, i) => ref(i + 1));
      const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
      const ss = { partner: new Map<string, number>(), opp: new Map<string, number>() };
      const playCount = new Map<string, number>();
      let prevResters: AttendeeRef[] = [];
      let partnerRepeats = 0;
      const oppMet = new Set<string>();

      for (let round = 0; round < 6; round++) {
        const plan = planRound(11, 3, true); // 2 doubles + 1 singles, 1 rester
        const rng = mulberry32(seed + round); // same shape as session-store
        const metDegree = new Map<number, number>();
        if (useMetDegree) {
          for (const [key, cnt] of ss.opp) {
            if (cnt <= 0) continue;
            const [a, b] = key.split(":").map(Number);
            metDegree.set(a!, (metDegree.get(a!) ?? 0) + 1);
            metDegree.set(b!, (metDegree.get(b!) ?? 0) + 1);
          }
        }
        const resters = selectResters(attendees, plan.resters, playCount, prevResters, rng, metDegree);
        const seated = attendees.filter(a => !resters.some(r => k(r) === k(a)));
        const built = buildRound(seated, plan.doublesCourts, plan.singlesCourts, hist, ss, rng);

        for (const c of built.courts) {
          const A = memberIdsFrom(c.teamA);
          const B = memberIdsFrom(c.teamB);
          for (const team of [A, B]) {
            if (team.length === 2 && (ss.partner.get(pairKey(team[0]!, team[1]!)) ?? 0) > 0) {
              partnerRepeats += 1;
            }
          }
          for (const a of A) for (const b of B) oppMet.add(pairKey(a, b));
          for (const r of [...c.teamA, ...c.teamB]) {
            playCount.set(k(r), (playCount.get(k(r)) ?? 0) + 1);
          }
        }
        applyRoundToHistory(hist, built.courts);
        applyRoundToSameSession(ss, built.courts);
        prevResters = resters;
      }
      return { unmet: 55 - oppMet.size, partnerRepeats };
    };

    const seeds = Array.from({ length: 10 }, (_, i) => 1_000_003 * (i + 1));
    let unmetSum = 0;
    let repeats = 0;
    for (const s of seeds) {
      const r = runNight(s, true);
      unmetSum += r.unmet;
      repeats += r.partnerRepeats;
    }
    const meanUnmet = unmetSum / seeds.length;

    // Improved level (baseline over the same seeds is ~6.1).
    expect(meanUnmet).toBeLessThan(6);
    // The tie-break must not cost partner variety — that stays near-veto.
    expect(repeats).toBe(0);
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
