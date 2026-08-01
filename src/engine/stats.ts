import type { Court, PairHistory, SameSessionStats } from "./models";
import { memberIdsFrom, pairKey } from "./models";

export const LAMBDA_DEFAULT = 0.7;

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Add (by=1) or revert (by=-1) a round's pairings in the cross-session history. */
export function applyRoundToHistory(hist: PairHistory, courts: readonly Court[], by = 1): void {
  for (const c of courts) {
    const A = memberIdsFrom(c.teamA);
    const B = memberIdsFrom(c.teamB);
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        bump(hist.partnerW, pairKey(A[i]!, A[j]!), by);
      }
    }
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        bump(hist.partnerW, pairKey(B[i]!, B[j]!), by);
      }
    }
    for (const a of A) {
      for (const b of B) {
        bump(hist.opponentW, pairKey(a, b), by);
      }
    }
  }
}

/** Add (by=1) or revert (by=-1) a round's pairings in the same-session stats. */
export function applyRoundToSameSession(ss: SameSessionStats, courts: readonly Court[], by = 1): void {
  for (const c of courts) {
    const A = memberIdsFrom(c.teamA);
    const B = memberIdsFrom(c.teamB);
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        bump(ss.partner, pairKey(A[i]!, A[j]!), by);
      }
    }
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        bump(ss.partner, pairKey(B[i]!, B[j]!), by);
      }
    }
    for (const a of A) {
      for (const b of B) {
        bump(ss.opp, pairKey(a, b), by);
      }
    }
  }
}

export function decayHistory(hist: PairHistory, lambda = LAMBDA_DEFAULT): void {
  for (const [k, v] of hist.partnerW) {
    hist.partnerW.set(k, v * lambda);
  }
  for (const [k, v] of hist.opponentW) {
    hist.opponentW.set(k, v * lambda);
  }
}
