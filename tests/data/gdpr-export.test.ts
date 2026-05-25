import { describe, expect, it, vi } from "vitest";

// Prevent the module-level singleton throw in supabase-client.ts.
// buildMemberExport is pure and never touches supabase; we only need the mock
// so the import chain resolves without env vars.
vi.mock("@/data/supabase-client", () => ({
  supabase: {},
}));

import { buildMemberExport } from "@/data/gdpr-export";
import type { Member, MatchResult } from "@/engine/models";

const member: Member = {
  id: 1,
  name: "佐藤",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("buildMemberExport (GDPR §17.4)", () => {
  it("returns the member and metadata even when there is no activity", () => {
    const result = buildMemberExport({ member, sessions: [], matches: [], rsvps: [] });
    expect(result.schemaVersion).toBe(1);
    expect(result.member).toEqual(member);
    expect(result.attendance).toEqual([]);
    expect(result.matchesParticipated).toEqual([]);
    expect(result.rsvps).toEqual([]);
    expect(typeof result.exportedAt).toBe("string");
  });

  it("filters attendance to sessions that include the member", () => {
    const result = buildMemberExport({
      member,
      sessions: [
        { sessionId: "s1", date: new Date("2026-01-10"), location: "X", attendeeMemberIds: [1, 2] },
        { sessionId: "s2", date: new Date("2026-01-17"), location: "Y", attendeeMemberIds: [3, 4] }, // not 1
      ],
      matches: [],
      rsvps: [],
    });
    expect(result.attendance).toHaveLength(1);
    expect(result.attendance[0]!.sessionId).toBe("s1");
    expect(result.attendance[0]!.location).toBe("X");
  });

  it("captures matches with team, teammates, opponents, and winner correctly", () => {
    const matches: MatchResult[] = [
      {
        sessionId: "s1",
        roundIndex: 0,
        courtType: "doubles",
        teamA: [1, 2],
        teamB: [3, 4],
        winner: "A",
        at: new Date("2026-01-10T10:00:00Z"),
      },
      {
        sessionId: "s1",
        roundIndex: 1,
        courtType: "doubles",
        teamA: [3, 4],
        teamB: [1, 5],
        winner: "B",
        at: new Date("2026-01-10T11:00:00Z"),
      },
      {
        sessionId: "s2",
        roundIndex: 0,
        courtType: "singles",
        teamA: [99],
        teamB: [98],
        winner: "A",
        at: new Date("2026-02-01T10:00:00Z"),
      }, // member NOT involved
    ];
    const result = buildMemberExport({ member, sessions: [], matches, rsvps: [] });
    expect(result.matchesParticipated).toHaveLength(2);

    const first = result.matchesParticipated[0]!;
    expect(first.team).toBe("A");
    expect(first.teammates).toEqual([2]);
    expect(first.opponents).toEqual([3, 4]);
    expect(first.winner).toBe("A");

    const second = result.matchesParticipated[1]!;
    expect(second.team).toBe("B");
    expect(second.teammates).toEqual([5]);
    expect(second.opponents).toEqual([3, 4]);
    expect(second.winner).toBe("B");
  });

  it("filters rsvps to only this member's responses", () => {
    const result = buildMemberExport({
      member,
      sessions: [],
      matches: [],
      rsvps: [
        { planned_session_id: "p1", member_id: 1, status: "going", note: null, updated_at: "2026-06-01T00:00:00Z", updated_by: "self_public_link", self_token: "x" },
        { planned_session_id: "p1", member_id: 2, status: "not_going", note: null, updated_at: "2026-06-01T00:00:00Z", updated_by: "admin", self_token: null },
      ],
    });
    expect(result.rsvps).toHaveLength(1);
    expect(result.rsvps[0]!.plannedSessionId).toBe("p1");
    expect(result.rsvps[0]!.status).toBe("going");
  });

  it("date and timestamp fields are ISO 8601 strings", () => {
    const result = buildMemberExport({
      member,
      sessions: [{ sessionId: "s1", date: new Date("2026-01-10T00:00:00Z"), location: "X", attendeeMemberIds: [1] }],
      matches: [{ sessionId: "s1", roundIndex: 0, courtType: "doubles", teamA: [1], teamB: [2], winner: "A", at: new Date("2026-01-10T11:00:00Z") }],
      rsvps: [],
    });
    expect(result.attendance[0]!.date).toBe("2026-01-10T00:00:00.000Z");
    expect(result.matchesParticipated[0]!.at).toBe("2026-01-10T11:00:00.000Z");
  });
});
