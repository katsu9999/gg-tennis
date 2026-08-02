import type { AttendeeRef, Court, PairHistory, SameSessionStats } from "./models";
import { memberIdsFrom, pairKey } from "./models";
import type { Rng } from "./rng";
import { shuffle } from "./rng";

// Tuned for the GG club's typical 2h night: 3 doubles courts, 8-12 players,
// 5-6 rounds. With so few rounds, intra-session variety is the only thing
// that actually matters — cross-session decay barely moves the needle in
// 5 rounds. So we crank the same-session weights up so the search basically
// refuses to repeat any partnership, and trim the cross-session weight so it
// breaks ties rather than driving the choice.
const W_PARTNER = 1;
const W_OPP = 0.5;
const SAME_SESSION = 30;
// Opponents you face count toward "meeting different people" just like partners
// do (everyone on a court has played together). Weight repeat opponents almost
// as hard as repeat partners so the search spreads each player across as many
// distinct court-mates as possible over a 5-6 round night. (Was 10; raised so
// opponent variety is optimised, not just partner variety.)
const SAME_SESSION_OPP = 20;
const K_ATTEMPTS = 800;

// Singles fairness (2026-07-12). Nobody likes singles, so the search must
// hand it out in strict rotation: the person who's already played the most
// singles today is the last to be picked again, and back-to-back singles are
// avoided. SINGLES_REPEAT dominates the pair/opponent weights so fairness wins
// over marginal variety gains; SINGLES_PREV only breaks ties between players
// with the same singles count.
const SINGLES_REPEAT = 100;
const SINGLES_PREV = 8;

const refKeyOf = (r: AttendeeRef): string => JSON.stringify(r);

/** Penalty for the two players placed on a singles court, based on how often
 *  they've already played singles today and whether they did so last round. */
function singlesCourtPenalty(
  players: readonly AttendeeRef[],
  singlesCount: ReadonlyMap<string, number>,
  prevSingles: ReadonlySet<string>,
): number {
  let s = 0;
  for (const r of players) {
    const key = refKeyOf(r);
    s += SINGLES_REPEAT * (singlesCount.get(key) ?? 0);
    if (prevSingles.has(key)) s += SINGLES_PREV;
  }
  return s;
}

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
  singlesCount: ReadonlyMap<string, number> = new Map(),
  prevSingles: ReadonlySet<string> = new Set(),
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
    let singlesPenalty = 0;
    for (let i = 0; i < singlesCourts; i++) {
      const two = s.slice(idx, idx + 2);
      idx += 2;
      singlesPenalty += singlesCourtPenalty(two, singlesCount, prevSingles);
      courts.push({ number: courts.length + 1, type: "singles", teamA: [two[0]!], teamB: [two[1]!], winner: "none" });
    }
    const sc = scoreCourts(courts, hist, ss) + singlesPenalty;
    if (sc < bestScore) {
      bestScore = sc;
      best = courts;
      if (sc === 0) break;
    }
  }

  return { courts: best ?? [] };
}
