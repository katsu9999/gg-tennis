import type { AttendeeRef, Court, PairHistory, SameSessionStats } from "./models";
import { memberIdsFrom, pairKey } from "./models";
import type { Rng } from "./rng";
import { shuffle } from "./rng";

const W_PARTNER = 3;
const W_OPP = 1;
const SAME_SESSION = 8;
const SAME_SESSION_OPP = 3;
const K_ATTEMPTS = 300;

function teamPairScore(team: readonly AttendeeRef[], hist: PairHistory, ss: SameSessionStats): number {
  const ids = memberIdsFrom(team);
  let s = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i]!, ids[j]!);
      s += W_PARTNER * (hist.partnerW.get(key) ?? 0);
      s += SAME_SESSION * (ss.partner.get(key) ?? 0);
    }
  return s;
}

function oppScore(a: readonly AttendeeRef[], b: readonly AttendeeRef[], hist: PairHistory, ss: SameSessionStats): number {
  const ai = memberIdsFrom(a);
  const bi = memberIdsFrom(b);
  let s = 0;
  for (const x of ai)
    for (const y of bi) {
      const key = pairKey(x, y);
      s += W_OPP * (hist.opponentW.get(key) ?? 0);
      s += SAME_SESSION_OPP * (ss.opp.get(key) ?? 0);
    }
  return s;
}

export function scoreCourts(courts: readonly Court[], hist: PairHistory, ss: SameSessionStats): number {
  let s = 0;
  for (const c of courts) {
    s += teamPairScore(c.teamA, hist, ss);
    s += teamPairScore(c.teamB, hist, ss);
    s += oppScore(c.teamA, c.teamB, hist, ss);
  }
  return s;
}

function bestSplitOf4(four: readonly AttendeeRef[], hist: PairHistory, ss: SameSessionStats): [AttendeeRef[], AttendeeRef[]] {
  const [a, b, c, d] = four;
  const candidates: [AttendeeRef[], AttendeeRef[]][] = [
    [[a!, b!], [c!, d!]],
    [[a!, c!], [b!, d!]],
    [[a!, d!], [b!, c!]],
  ];
  let best = candidates[0]!;
  let bestS = Infinity;
  for (const [A, B] of candidates) {
    const s = teamPairScore(A, hist, ss) + teamPairScore(B, hist, ss) + oppScore(A, B, hist, ss);
    if (s < bestS) {
      bestS = s;
      best = [A, B];
    }
  }
  return best;
}

/**
 * Picks the freshest court arrangement for the given seated players.
 *
 * Returns only the court list — `Round.index` and `Round.resters` are the
 * caller's responsibility (assembled in the session coordinator at Phase 2+).
 */
export function buildRound(
  seated: readonly AttendeeRef[],
  doublesCourts: number,
  singlesCourts: number,
  hist: PairHistory,
  ss: SameSessionStats,
  rng: Rng,
): { courts: Court[] } {
  let best: Court[] | null = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < K_ATTEMPTS; attempt++) {
    const s = shuffle(seated, rng);
    const courts: Court[] = [];
    let idx = 0;
    for (let i = 0; i < doublesCourts; i++) {
      const four = s.slice(idx, idx + 4);
      idx += 4;
      const [A, B] = bestSplitOf4(four, hist, ss);
      courts.push({ number: courts.length + 1, type: "doubles", teamA: A, teamB: B, winner: "none" });
    }
    for (let i = 0; i < singlesCourts; i++) {
      const two = s.slice(idx, idx + 2);
      idx += 2;
      courts.push({ number: courts.length + 1, type: "singles", teamA: [two[0]!], teamB: [two[1]!], winner: "none" });
    }
    const sc = scoreCourts(courts, hist, ss);
    if (sc < bestScore) {
      bestScore = sc;
      best = courts;
      if (sc === 0) break;
    }
  }

  return { courts: best ?? [] };
}
