import { describe, expect, it } from "vitest";
import { computeStandings, hasAnyResult } from "@/engine/standings";
import type { AttendeeRef, Court } from "@/engine/models";

const m = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
const court = (a: number[], b: number[], winner: Court["winner"]): Court => ({
  number: 1, type: "doubles", teamA: a.map(m), teamB: b.map(m), winner,
});
const attendees = [1, 2, 3, 4, 5].map((id) => ({ ref: m(id), todayNumber: id }));

describe("computeStandings", () => {
  it("勝ち数→負けの少なさ→今日の番号の順に並べる", () => {
    const rounds = [
      { courts: [court([1, 2], [3, 4], "A")] },   // 1,2 勝ち
      { courts: [court([1, 3], [2, 5], "B")] },   // 2,5 勝ち
      { courts: [court([4, 5], [1, 2], "none")] }, // 未記録は数えない
    ];
    const rows = computeStandings(rounds, attendees);
    expect(rows.map((r) => [(r.ref as { memberId: number }).memberId, r.wins, r.losses, r.rank])).toEqual([
      [2, 2, 0, 1],
      [5, 1, 0, 2],
      [1, 1, 1, 3],
      [4, 0, 1, 4],
      [3, 0, 2, 5],
    ]);
  });

  it("同じ成績は同じ順位で、次の順位は人数分飛ぶ", () => {
    const rows = computeStandings([{ courts: [court([1, 2], [3, 4], "A")] }], attendees);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 4, 4]);
  });

  it("出番が無かった人も0勝0敗で載る", () => {
    const rows = computeStandings([{ courts: [court([1, 2], [3, 4], "A")] }], attendees);
    expect(rows.find((r) => (r.ref as { memberId: number }).memberId === 5)).toMatchObject({ wins: 0, losses: 0 });
  });

  it("hasAnyResult は勝敗が1つでもあれば true", () => {
    expect(hasAnyResult([{ courts: [court([1, 2], [3, 4], "none")] }])).toBe(false);
    expect(hasAnyResult([{ courts: [court([1, 2], [3, 4], "B")] }])).toBe(true);
  });
});
