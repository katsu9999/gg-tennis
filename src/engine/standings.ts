import type { AttendeeRef, Round } from "./models";

// その日の順位（勝ち数の多い順 → 負けの少ない順 → 今日の番号順）。
// 年間ランキング（ranking.ts の Elo）とは別物で、その夜の勝敗だけで決まる。

export interface StandingRow {
  ref: AttendeeRef;
  todayNumber: number;
  wins: number;
  losses: number;
  /** 同じ勝ち数・負け数なら同じ順位。次の順位は人数分飛ぶ（1,1,3…）。 */
  rank: number;
}

type RoundLike = Pick<Round, "courts">;
interface AttendeeLike {
  ref: AttendeeRef;
  todayNumber: number;
}

export function computeStandings(
  rounds: readonly RoundLike[],
  attendees: readonly AttendeeLike[],
): StandingRow[] {
  const key = (r: AttendeeRef) => JSON.stringify(r);
  const tally = new Map<string, { wins: number; losses: number }>();
  for (const a of attendees) tally.set(key(a.ref), { wins: 0, losses: 0 });

  for (const round of rounds) {
    for (const c of round.courts) {
      if (c.winner !== "A" && c.winner !== "B") continue;
      const [won, lost] = c.winner === "A" ? [c.teamA, c.teamB] : [c.teamB, c.teamA];
      for (const r of won) {
        const row = tally.get(key(r)) ?? { wins: 0, losses: 0 };
        row.wins += 1;
        tally.set(key(r), row);
      }
      for (const r of lost) {
        const row = tally.get(key(r)) ?? { wins: 0, losses: 0 };
        row.losses += 1;
        tally.set(key(r), row);
      }
    }
  }

  const rows = attendees
    .map((a) => ({ ref: a.ref, todayNumber: a.todayNumber, ...(tally.get(key(a.ref)) ?? { wins: 0, losses: 0 }) }))
    .sort((x, y) => y.wins - x.wins || x.losses - y.losses || x.todayNumber - y.todayNumber);

  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.wins !== r.wins || prev.losses !== r.losses) rank = i + 1;
    return { ...r, rank };
  });
}

/** 1つでも勝敗が付いているか。 */
export function hasAnyResult(rounds: readonly RoundLike[]): boolean {
  return rounds.some((r) => r.courts.some((c) => c.winner === "A" || c.winner === "B"));
}
