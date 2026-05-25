import { describe, expect, it } from "vitest";
import type { Member, Attendee, Court, Round, MatchResult } from "@/engine/models";

describe("domain models", () => {
  it("Member has stable identity and status union", () => {
    const m: Member = { id: 1, name: "佐藤", status: "active", createdAt: new Date("2026-01-01") };
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
});
