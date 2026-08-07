import { describe, expect, it, vi } from "vitest";

// line-notify imports @/ui/stores for offerLineNotify; the real composition
// root constructs the Supabase client, which throws without env. Only
// buildRoundPayload is under test here — stub the stores out.
vi.mock("@/ui/stores", () => ({ sessionStore: {}, rosterStore: {} }));

import { buildRoundPayload, buildSummaryPayload } from "@/ui/line-notify";
import type { InMemorySession } from "@/state/session-store";
import type { Round } from "@/engine/models";

function makeSession(rounds: Round[], currentRoundIndex: number): InMemorySession {
  return {
    id: "s1",
    status: "ongoing",
    plannedSessionId: null,
    date: new Date("2026-08-02"),
    location: "Hendon",
    courtCount: 2,
    allowSingles: false,
    attendees: [
      { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
      { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
      { ref: { kind: "member", memberId: 3 }, todayNumber: 3, isGuest: false },
      { ref: { kind: "guest", guestId: "g1" }, todayNumber: 4, isGuest: true, guestName: "ビジター" },
      { ref: { kind: "member", memberId: 5 }, todayNumber: 5, isGuest: false },
    ],
    rounds,
    currentRoundIndex,
    todayStats: new Map(),
    prevResters: [],
    prevSingles: [],
    rngSeed: 1,
    hostToken: null,
    hostLabel: null,
    createdAt: "2026-08-02T09:00:00.000Z",
  };
}

const round: Round = {
  index: 0,
  courts: [
    {
      number: 1,
      type: "doubles",
      teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
      teamB: [{ kind: "member", memberId: 3 }, { kind: "guest", guestId: "g1" }],
      winner: "none",
    },
  ],
  resters: [{ kind: "member", memberId: 5 }],
};

const names = new Map([
  [1, "田中"],
  [2, "佐藤"],
  [3, "山本"],
]);

describe("buildRoundPayload", () => {
  it("pairs todayNumber with each name (④名前), guests included", () => {
    const payload = buildRoundPayload(makeSession([round], 0), names)!;
    expect(payload).toEqual({
      roundNo: 1,
      courts: [
        { number: 1, type: "doubles", teamA: ["①田中", "②佐藤"], teamB: ["③山本", "④ビジター"] },
      ],
      resters: ["⑤#5"], // member 5 not in roster map → number + fallback label
    });
  });

  it("uses the CURRENT round, not the last one", () => {
    const r1: Round = { ...round, index: 1 };
    const payload = buildRoundPayload(makeSession([round, r1], 1), names)!;
    expect(payload.roundNo).toBe(2);
  });

  it("returns null when there is no round at the current index", () => {
    expect(buildRoundPayload(makeSession([], -1), names)).toBeNull();
  });
});

describe("buildSummaryPayload", () => {
  // 勝敗はラウンドのコートに記録される。todayStats は play/rest しか持たない
  // ので、ここで rounds から数え直す。
  const M = new Map<number, string>([[1, "田中"], [2, "佐藤"], [3, "山本"], [5, "鈴木"]]);

  function court(
    teamA: number[], teamB: number[], winner: "A" | "B" | "none", number = 1,
  ) {
    return {
      number,
      type: "doubles" as const,
      teamA: teamA.map((id) => ({ kind: "member" as const, memberId: id })),
      teamB: teamB.map((id) => ({ kind: "member" as const, memberId: id })),
      winner,
    };
  }

  it("勝敗を数えて勝ち数順に並べる", () => {
    const rounds = [
      { index: 0, courts: [court([1, 2], [3, 5], "A")], resters: [] },
      { index: 1, courts: [court([1, 3], [2, 5], "A")], resters: [] },
    ] as never as Round[];
    const p = buildSummaryPayload(makeSession(rounds, 1), M)!;

    expect(p.kind).toBe("summary");
    expect(p.rounds).toBe(2);
    expect(p.standings[0]).toEqual({ label: "①田中", wins: 2, losses: 0 });
    // 佐藤は1勝1敗、山本も1勝1敗、鈴木は0勝2敗
    expect(p.standings[p.standings.length - 1]).toEqual({ label: "⑤鈴木", wins: 0, losses: 2 });
  });

  it("勝敗未記録のコートは数えない", () => {
    // 1面は決着、もう1面は未記録。未記録の方は勝敗どちらにも足さない。
    const rounds = [
      {
        index: 0,
        courts: [court([1, 2], [3, 5], "A", 1), court([1, 3], [2, 5], "none", 2)],
        resters: [],
      },
    ] as never as Round[];
    const p = buildSummaryPayload(makeSession(rounds, 0), M)!;
    const tanaka = p.standings.find((s) => s.label === "①田中")!;
    expect(tanaka).toEqual({ label: "①田中", wins: 1, losses: 0 });
  });

  it("試合に出ていない人も0勝0敗で載せる", () => {
    // この1通は今日の参加記録も兼ねるので、勝てなかった人も消さない。
    // 5人中4人だけが1面に入り、⑤鈴木は出番なし。
    const rounds = [
      { index: 0, courts: [court([1, 2], [3, 4], "A")], resters: [] },
    ] as never as Round[];
    const p = buildSummaryPayload(makeSession(rounds, 0), M)!;
    expect(p.standings).toHaveLength(5);
    expect(p.attendees).toBe(5);
    // 0勝0敗は 0勝1敗より上に来る（同勝ち数なら負けの少ない順）
    expect(p.standings.find((x) => x.label === "⑤鈴木"))
      .toEqual({ label: "⑤鈴木", wins: 0, losses: 0 });
  });

  it("ゲストも名前で載る", () => {
    const rounds = [
      { index: 0, courts: [court([1, 2], [3, 5], "A")], resters: [] },
    ] as never as Round[];
    const p = buildSummaryPayload(makeSession(rounds, 0), M)!;
    expect(p.standings.map((s) => s.label)).toContain("④ビジター");
  });

  it("ラウンドが無ければ null（送らない）", () => {
    expect(buildSummaryPayload(makeSession([], 0), M)).toBeNull();
  });
});

describe("buildSummaryPayload — 成績ゼロは送らない", () => {
  const M = new Map<number, string>([[1, "田中"], [2, "佐藤"], [3, "山本"], [5, "鈴木"]]);

  it("勝敗が1件も無ければ null", () => {
    // 全員0勝0敗の表は情報がないうえ「誰も勝たなかった」と誤読される。
    const rounds = [
      {
        index: 0,
        courts: [{
          number: 1, type: "doubles",
          teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
          teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 5 }],
          winner: "none",
        }],
        resters: [],
      },
    ] as never as Round[];
    expect(buildSummaryPayload(makeSession(rounds, 0), M)).toBeNull();
  });

  it("1件でも勝敗があれば送る", () => {
    const rounds = [
      {
        index: 0,
        courts: [{
          number: 1, type: "doubles",
          teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
          teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 5 }],
          winner: "A",
        }],
        resters: [],
      },
    ] as never as Round[];
    expect(buildSummaryPayload(makeSession(rounds, 0), M)).not.toBeNull();
  });
});
