import { describe, expect, it, vi } from "vitest";

// line-notify imports @/ui/stores for offerLineNotify; the real composition
// root constructs the Supabase client, which throws without env. Only
// buildRoundPayload is under test here — stub the stores out.
vi.mock("@/ui/stores", () => ({ sessionStore: {}, rosterStore: {} }));

import { buildRoundPayload } from "@/ui/line-notify";
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
  it("resolves member names, guest names, and falls back for unknown members", () => {
    const payload = buildRoundPayload(makeSession([round], 0), names)!;
    expect(payload).toEqual({
      roundNo: 1,
      courts: [
        { number: 1, type: "doubles", teamA: ["田中", "佐藤"], teamB: ["山本", "ビジター"] },
      ],
      resters: ["#5"], // member 5 not in roster map → fallback label
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
