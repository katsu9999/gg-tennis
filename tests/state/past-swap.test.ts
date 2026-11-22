import { describe, expect, it, vi } from "vitest";
import { swapPastPlayer } from "@/state/past-swap";
import type { AttendeeRef, Round } from "@/engine/models";

const m = (id: number): AttendeeRef => ({ kind: "member", memberId: id });

// 2026-11-21 R4 を模した形: COURT 2 = 容子(11)・前田(1) vs 草野(3)・まんぎょく(12)、B 勝ち。野原(9)は休憩。
function night(): Round[] {
  return [
    { index: 0, courts: [], resters: [] },
    { index: 1, courts: [], resters: [] },
    { index: 2, courts: [], resters: [] },
    {
      index: 3,
      courts: [
        { number: 1, type: "doubles", teamA: [m(5), m(6)], teamB: [m(7), m(8)], winner: "B" },
        { number: 2, type: "doubles", teamA: [m(11), m(1)], teamB: [m(3), m(12)], winner: "B" },
      ],
      resters: [m(9), m(2)],
    },
  ];
}

describe("swapPastPlayer", () => {
  it("負け側/勝ち側の team_b の人を入れ替えると、勝敗は代わりの人に付く（RPC 1回）", async () => {
    const repo = { editPastCourtWinner: vi.fn().mockResolvedValue(undefined) };
    const rounds = await swapPastPlayer(repo, {
      pin: "x", sessionId: "s", rounds: night(), roundIndex: 3, out: m(12), incoming: m(9),
    });

    const c2 = rounds[3]!.courts[1]!;
    expect(c2.teamB).toEqual([m(3), m(9)]);
    expect(c2.winner).toBe("B");
    expect(rounds[3]!.resters).toEqual([m(2), m(12)]);
    expect(repo.editPastCourtWinner).toHaveBeenCalledTimes(1);
    expect(repo.editPastCourtWinner).toHaveBeenCalledWith(expect.objectContaining({
      roundIndex: 3, teamA: [11, 1], teamB: [3, 9], winner: "B", rounds,
    }));
  });

  it("team_a の人を入れ替えるときは、古い team_a の行を消してから新しく入れる（RPC 2回）", async () => {
    const repo = { editPastCourtWinner: vi.fn().mockResolvedValue(undefined) };
    await swapPastPlayer(repo, {
      pin: "x", sessionId: "s", rounds: night(), roundIndex: 3, out: m(1), incoming: m(9),
    });

    expect(repo.editPastCourtWinner).toHaveBeenCalledTimes(2);
    expect(repo.editPastCourtWinner.mock.calls[0]![0]).toMatchObject({ teamA: [11, 1], winner: null });
    // 1回目は rounds を元のまま書く（2回目が落ちても入れ替え前に見え、やり直せる）
    expect(repo.editPastCourtWinner.mock.calls[0]![0].rounds).toEqual(night());
    expect(repo.editPastCourtWinner.mock.calls[1]![0]).toMatchObject({ teamA: [11, 9], teamB: [3, 12], winner: "B" });
  });

  it("他のラウンド・他のコートは変えない", async () => {
    const repo = { editPastCourtWinner: vi.fn().mockResolvedValue(undefined) };
    const before = night();
    const rounds = await swapPastPlayer(repo, {
      pin: "x", sessionId: "s", rounds: before, roundIndex: 3, out: m(12), incoming: m(9),
    });
    expect(rounds[3]!.courts[0]).toEqual(before[3]!.courts[0]);
    expect(rounds.slice(0, 3)).toEqual(before.slice(0, 3));
  });

  it("コートにいない人は入れ替え元にできない", async () => {
    const repo = { editPastCourtWinner: vi.fn() };
    await expect(swapPastPlayer(repo, {
      pin: "x", sessionId: "s", rounds: night(), roundIndex: 3, out: m(9), incoming: m(2),
    })).rejects.toThrow();
    expect(repo.editPastCourtWinner).not.toHaveBeenCalled();
  });
});
