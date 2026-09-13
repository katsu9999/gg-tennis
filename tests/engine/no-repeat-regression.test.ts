import { describe, expect, it } from "vitest";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import { applyRoundToHistory, applyRoundToSameSession } from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import type { AttendeeRef, PairHistory, SameSessionStats } from "@/engine/models";
import { memberIdsFrom, pairKey } from "@/engine/models";

/** Local copy so this file can also be run against an older engine build when
 *  checking that it does catch the regression. */
const quadKeyOf = (ids: readonly number[]): string | null =>
  ids.length === 4 ? [...ids].sort((a, b) => a - b).join(":") : null;

/**
 * Regression guard for the round-5 repeat reported on 2026-09-12.
 *
 * A doubles court makes 2 partner pairs but 4 opponent pairs, so opponent
 * combinations run out twice as fast. While repeats were priced (partner 30,
 * opponent 20) rather than ranked, the search would buy one repeated
 * partnership to avoid two repeated opponents as soon as the opponent pool
 * dried up — measured at 11% of 9-player nights at round 5, 22% at round 6.
 * A single seed cannot catch that, so sweep headcounts × round counts × seeds.
 */

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
const k = (r: AttendeeRef) => JSON.stringify(r);

interface NightResult {
  partnerRepeats: number;
  quadRepeats: number;
}

function runNight(people: number, courts: number, rounds: number, seed: number,
                  allowSingles = false): NightResult {
  const attendees = Array.from({ length: people }, (_, i) => ref(i + 1));
  const rng = mulberry32(seed);
  const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
  const ss: SameSessionStats = { partner: new Map(), opp: new Map(), quad: new Map() };
  const playCount = new Map<string, number>();
  let prevResters: AttendeeRef[] = [];
  const out: NightResult = { partnerRepeats: 0, quadRepeats: 0 };

  for (let round = 0; round < rounds; round++) {
    const plan = planRound(attendees.length, courts, allowSingles);
    const resters = selectResters(attendees, plan.resters, playCount, prevResters, rng);
    const seated = attendees.filter(a => !resters.some(r => k(r) === k(a)));
    const built = buildRound(seated, plan.doublesCourts, plan.singlesCourts, hist, ss, rng);

    for (const c of built.courts) {
      for (const team of [c.teamA, c.teamB] as const) {
        const ids = memberIdsFrom(team);
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++)
            if ((ss.partner.get(pairKey(ids[i]!, ids[j]!)) ?? 0) > 0) out.partnerRepeats++;
      }
      if (c.type === "doubles") {
        const key = quadKeyOf([...memberIdsFrom(c.teamA), ...memberIdsFrom(c.teamB)]);
        if (key && (ss.quad?.get(key) ?? 0) > 0) out.quadRepeats++;
      }
      for (const r of [...c.teamA, ...c.teamB]) {
        playCount.set(k(r), (playCount.get(k(r)) ?? 0) + 1);
      }
    }
    applyRoundToHistory(hist, built.courts);
    applyRoundToSameSession(ss, built.courts);
    prevResters = resters;
  }
  return out;
}

describe("same-session repeats are ranked, not priced", () => {
  // 6 rounds is the club standard (ROUNDS_PER_NIGHT), and 9-13 is the usual
  // turnout — exactly the band that used to break.
  const headcounts = [8, 9, 10, 12, 13, 16];
  const seeds = [1, 7, 42, 2026];

  for (const rounds of [5, 6]) {
    for (const people of headcounts) {
      it(`${people} players / 3 courts / ${rounds} rounds: nobody partners twice`, () => {
        for (const seed of seeds) {
          const { partnerRepeats } = runNight(people, 3, rounds, seed);
          expect(
            partnerRepeats,
            `seed ${seed}: ${partnerRepeats} repeated partnership(s)`,
          ).toBe(0);
        }
      });
    }
  }

  it("2026-09-12 as played: 9 players / 2 courts / 5 rounds", () => {
    // The night that surfaced this. 2 doubles courts need 8 opponent pairs per
    // round, so 5 rounds demand 40 out of the 36 that exist for 9 players —
    // opponent repeats become unavoidable at exactly round 5, which is where
    // the search started paying for them with a repeated partnership
    // (前田 & 翠川, rounds 4 and 5). Partner pairs only need 20 of 36, so zero
    // partner repeats is always reachable and the tie-break must never sell it.
    for (const seed of [1, 7, 42, 2026, 31337]) {
      const { partnerRepeats } = runNight(9, 2, 5, seed);
      expect(partnerRepeats, `seed ${seed}`).toBe(0);
    }
  });

  it("the same foursome is not put back on a court while alternatives exist", () => {
    // Partner and opponent counts alone miss this: re-forming {a,b,c,d} with
    // the teams swapped only costs two opponent repeats, which is cheaper than
    // a partner repeat elsewhere. Tracked as a quad since 2026-09-12.
    for (const seed of [1, 7, 42, 2026]) {
      const { quadRepeats } = runNight(12, 3, 6, seed);
      expect(quadRepeats, `seed ${seed}: ${quadRepeats} repeated foursome(s)`).toBe(0);
    }
  });

  it("singles in the mix does not reintroduce partner repeats", () => {
    for (const seed of [1, 7, 42, 2026]) {
      const { partnerRepeats } = runNight(11, 3, 6, seed, true);
      expect(partnerRepeats, `seed ${seed}`).toBe(0);
    }
  });
});
