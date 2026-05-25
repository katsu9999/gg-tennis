import { describe, expect, it } from "vitest";
import { fakeClient } from "./test-helpers";
import { createPlannedSessionRepository } from "@/data/planned-session-repository";
import type { PlannedSessionRow } from "@/data/planned-session-repository";

const samplePlanned: PlannedSessionRow = {
  id: "ps-uuid-1",
  date: "2026-06-01",
  location: "Golders Hill",
  court_count: 2,
  allow_singles: true,
  public_rsvp_token: "tok-abc",
  show_going_list_on_public: true,
  created_at: "2026-05-25T08:00:00Z",
  created_by: "admin@example.com",
};

describe("PlannedSessionRepository", () => {
  it("list returns sessions in date order", async () => {
    const c = fakeClient({ planned_sessions: { list: [samplePlanned as unknown as Record<string, unknown>] } });
    const repo = createPlannedSessionRepository(c);
    const sessions = await repo.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe("ps-uuid-1");
    expect(sessions[0]!.location).toBe("Golders Hill");
  });

  it("loadByToken returns the matching planned session", async () => {
    const c = fakeClient({ planned_sessions: { maybeSingle: samplePlanned as unknown as Record<string, unknown> } });
    const repo = createPlannedSessionRepository(c);
    const result = await repo.loadByToken("tok-abc");
    expect(result).not.toBeNull();
    expect(result!.public_rsvp_token).toBe("tok-abc");
  });

  it("loadByToken returns null when token not found", async () => {
    const c = fakeClient({ planned_sessions: { maybeSingle: null } });
    const repo = createPlannedSessionRepository(c);
    const result = await repo.loadByToken("unknown-token");
    expect(result).toBeNull();
  });

  it("rotateToken updates public_rsvp_token and returns new token string", async () => {
    const c = fakeClient({ planned_sessions: {} });
    const repo = createPlannedSessionRepository(c);
    const token = await repo.rotateToken("ps-uuid-1");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(c.from).toHaveBeenCalledWith("planned_sessions");
  });
});
