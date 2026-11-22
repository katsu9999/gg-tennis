import type { AttendeeRef, Gender, Round, SameSessionStats } from "./models";
import { t } from "@/ui/i18n";
import { pairKey } from "./models";

// 代役（途中で1人抜けたとき、その人の枠に別の人を入れる）。
//
// 2026-11-21 の夜、R4 の途中でまんぎょくさんが帰り、休みだった野原さんが
// そのまま入って勝った。アプリは「離脱」を押しても今のラウンドを一切変えず、
// 代わりに先のラウンドを丸ごと組み直していた（まんぎょくさんが休みだった
// R5 まで顔ぶれが総入れ替え）。コートで実際に起きるのは「1人だけ差し替え」
// なので、それをそのまま表現する。

const keyOf = (r: AttendeeRef): string => JSON.stringify(r);

export function sameRef(a: AttendeeRef, b: AttendeeRef): boolean {
  return keyOf(a) === keyOf(b);
}

/** その人がこのラウンドのどのコート・どちらのチームにいるか。いなければ null。 */
export function findOnCourt(
  round: Round,
  ref: AttendeeRef,
): { courtNumber: number; team: "A" | "B" } | null {
  for (const c of round.courts) {
    if (c.teamA.some((r) => sameRef(r, ref))) return { courtNumber: c.number, team: "A" };
    if (c.teamB.some((r) => sameRef(r, ref))) return { courtNumber: c.number, team: "B" };
  }
  return null;
}

/**
 * `out` の枠に `incoming` を入れたラウンドを返す（元の round は変えない）。
 *
 * - incoming が休憩にいれば休憩から外す。
 * - out は outTo="resters" なら休憩へ（その場にはいた）、"none" ならラウンドから
 *   消す（帰った人）。
 * - 勝敗はそのまま。代わりに入った人がそのチームの結果を引き継ぐ。
 */
export function substituteInRound(
  round: Round,
  out: AttendeeRef,
  incoming: AttendeeRef,
  outTo: "resters" | "none",
): Round {
  if (sameRef(out, incoming)) throw new Error(t.errors.sameSwap);
  if (!findOnCourt(round, out)) throw new Error(t.errors.outNotOnCourt);
  if (findOnCourt(round, incoming)) throw new Error(t.errors.inAlreadyOnCourt);

  const swap = (team: AttendeeRef[]): AttendeeRef[] =>
    team.map((r) => (sameRef(r, out) ? incoming : r));
  const courts = round.courts.map((c) => ({ ...c, teamA: swap(c.teamA), teamB: swap(c.teamB) }));
  const resters = round.resters.filter((r) => !sameRef(r, incoming));
  if (outTo === "resters") resters.push(out);
  return { ...round, courts, resters };
}

export interface SubstituteContext {
  /** そのラウンドより前に何回出たか。少ない人から入れる（休み公平が最優先）。 */
  playCount: (ref: AttendeeRef) => number;
  /** そのラウンドより前の同一セッション統計。ペア・対戦の重複を避ける。 */
  sameSession: SameSessionStats;
  /** 男女バランスがONのときだけ渡す。抜けた人と同じ性別を優先する。 */
  genderOf?: ((ref: AttendeeRef) => Gender) | undefined;
}

/** `out` の代わりに入れる候補を、良い順に並べる。
 *
 *  1. 今日の出場が少ない人（休みの公平を崩さない）
 *  2. 同じ性別（男女バランスONのときだけ。コートの男女構成がそのまま保てる）
 *  3. 今日すでに組んだ相手とペアにならない
 *  4. 今日すでに当たった相手と当たらない
 *  5. 渡された順（＝今日の番号順）
 */
export function rankSubstitutes(
  round: Round,
  out: AttendeeRef,
  candidates: readonly AttendeeRef[],
  ctx: SubstituteContext,
): AttendeeRef[] {
  const pos = findOnCourt(round, out);
  if (!pos) return [];
  const court = round.courts.find((c) => c.number === pos.courtNumber)!;
  const mates = (pos.team === "A" ? court.teamA : court.teamB).filter((r) => !sameRef(r, out));
  const opps = pos.team === "A" ? court.teamB : court.teamA;

  const outGender = ctx.genderOf?.(out) ?? "unknown";
  const count = (m: Map<string, number> | undefined, a: AttendeeRef, b: AttendeeRef): number => {
    if (!m || a.kind !== "member" || b.kind !== "member") return 0;
    return m.get(pairKey(a.memberId, b.memberId)) ?? 0;
  };

  const scored = candidates
    .filter((c) => !sameRef(c, out) && !findOnCourt(round, c))
    .map((c, i) => {
      const g = ctx.genderOf?.(c) ?? "unknown";
      const genderMiss =
        ctx.genderOf && outGender !== "unknown" && g !== "unknown" && g !== outGender ? 1 : 0;
      return {
        ref: c,
        i,
        play: ctx.playCount(c),
        genderMiss,
        partner: mates.reduce((s, m) => s + count(ctx.sameSession.partner, c, m), 0),
        opp: opps.reduce((s, o) => s + count(ctx.sameSession.opp, c, o), 0),
      };
    });

  scored.sort(
    (x, y) =>
      x.play - y.play ||
      x.genderMiss - y.genderMiss ||
      x.partner - y.partner ||
      x.opp - y.opp ||
      x.i - y.i,
  );
  return scored.map((s) => s.ref);
}
