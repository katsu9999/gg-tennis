import type { MatchResult, MemberId } from "./models";
import { pairKey } from "./models";

export const ELO_INITIAL = 1500;
export const ELO_K = 24;
export const ELO_K_PROVISIONAL = 40;
export const PROVISIONAL_MATCHES = 10;
export const PAIR_MIN_MATCHES = 2;

export interface SeasonWindow {
  from: Date;
  to: Date;
}

export interface SessionAttendance {
  sessionId: string;
  date: Date;
  attendeeMemberIds: MemberId[];
}

export interface PairWinRate {
  win: number;
  loss: number;
}

export interface RankingStats {
  elo: Map<MemberId, number>;
  record: Map<MemberId, { win: number; loss: number }>;
  pair: Map<string, PairWinRate>; // canonical pairKey
  attendance: Map<MemberId, number>;
}

export function computeRankings(
  matches: readonly MatchResult[],
  attendance: readonly SessionAttendance[],
  window: SeasonWindow,
): RankingStats {
  const inWindow = matches
    .filter(m => m.at >= window.from && m.at < window.to && m.teamA.length > 0 && m.teamB.length > 0)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const elo = new Map<MemberId, number>();
  const record = new Map<MemberId, { win: number; loss: number }>();
  const pair = new Map<string, PairWinRate>();
  const matchesPlayed = new Map<MemberId, number>();

  const get = (id: MemberId) => elo.get(id) ?? ELO_INITIAL;
  const ensureRec = (id: MemberId) => {
    let r = record.get(id);
    if (!r) {
      r = { win: 0, loss: 0 };
      record.set(id, r);
    }
    return r;
  };

  for (const match of inWindow) {
    const A = match.teamA;
    const B = match.teamB;
    const Ra = A.reduce((s, id) => s + get(id), 0) / A.length;
    const Rb = B.reduce((s, id) => s + get(id), 0) / B.length;
    const Ea = 1 / (1 + 10 ** ((Rb - Ra) / 400));
    const Sa = match.winner === "A" ? 1 : 0;

    for (const id of A) {
      const k = (matchesPlayed.get(id) ?? 0) < PROVISIONAL_MATCHES ? ELO_K_PROVISIONAL : ELO_K;
      elo.set(id, get(id) + k * (Sa - Ea));
      matchesPlayed.set(id, (matchesPlayed.get(id) ?? 0) + 1);
      const r = ensureRec(id);
      if (Sa === 1) r.win++;
      else r.loss++;
    }
    for (const id of B) {
      const k = (matchesPlayed.get(id) ?? 0) < PROVISIONAL_MATCHES ? ELO_K_PROVISIONAL : ELO_K;
      elo.set(id, get(id) + k * ((1 - Sa) - (1 - Ea)));
      matchesPlayed.set(id, (matchesPlayed.get(id) ?? 0) + 1);
      const r = ensureRec(id);
      if (Sa === 0) r.win++;
      else r.loss++;
    }

    // Pair winrates: only same-team pairs (doubles produce pairs; singles produce none)
    const updatePair = (team: readonly MemberId[], won: boolean) => {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const k = pairKey(team[i]!, team[j]!);
          const p = pair.get(k) ?? { win: 0, loss: 0 };
          if (won) p.win++;
          else p.loss++;
          pair.set(k, p);
        }
      }
    };
    updatePair(A, Sa === 1);
    updatePair(B, Sa === 0);
  }

  // Apply minimum-matches threshold
  for (const [k, p] of pair) {
    if (p.win + p.loss < PAIR_MIN_MATCHES) pair.delete(k);
  }

  // Attendance: filter sessions to season, count per member
  const attMap = new Map<MemberId, number>();
  for (const s of attendance) {
    if (s.date < window.from || s.date >= window.to) continue;
    for (const id of s.attendeeMemberIds) attMap.set(id, (attMap.get(id) ?? 0) + 1);
  }

  return { elo, record, pair, attendance: attMap };
}
