import { describe, expect, it } from "vitest";
import type { Member, Attendee, Court, Round, MatchResult } from "@/engine/models";
import { pairKey } from "@/engine/models";

describe("domain models", () => {
  it("Member has stable identity and status union", () => {
    const m: Member = { id: 1, name: "佐藤", status: "active", gender: "unknown", createdAt: new Date("2026-01-01") };
    expect(m.status).toBe("active");
  });

  it("Attendee distinguishes member vs guest by ref shape", () => {
    const memberA: Attendee = { ref: { kind: "member", memberId: 7 }, todayNumber: 3, isGuest: false };
    const guestA: Attendee = { ref: { kind: "guest", guestId: "g1" }, todayNumber: 4, isGuest: true, guestName: "Tom" };
    expect(memberA.todayNumber).toBe(3);
    expect(guestA.guestName).toBe("Tom");
  });

  it("Court holds two team arrays and a winner state", () => {
    const c: Court = {
      number: 1,
      type: "doubles",
      teamA: [{ kind: "member", memberId: 1 }, { kind: "member", memberId: 2 }],
      teamB: [{ kind: "member", memberId: 3 }, { kind: "member", memberId: 4 }],
      winner: "none",
    };
    expect(c.type).toBe("doubles");
    expect(c.winner).toBe("none");
  });

  it("Round groups courts and resters by round index", () => {
    const r: Round = { index: 2, courts: [], resters: [{ kind: "member", memberId: 9 }] };
    expect(r.index).toBe(2);
    expect(r.resters).toHaveLength(1);
  });

  it("MatchResult uses member-id arrays and excludes 'none' winner", () => {
    const m: MatchResult = {
      sessionId: "s1", roundIndex: 0, courtType: "doubles",
      teamA: [1, 2], teamB: [3, 4], winner: "A", at: new Date("2026-06-01"),
    };
    expect(m.winner).toBe("A");
    expect(m.teamA).toEqual([1, 2]);
  });

  it("pairKey canonicalizes order (smaller id first)", () => {
    expect(pairKey(2, 1)).toBe(pairKey(1, 2));
    expect(pairKey(2, 1)).toBe("1:2");
    expect(pairKey(5, 5)).toBe("5:5");
  });
});
