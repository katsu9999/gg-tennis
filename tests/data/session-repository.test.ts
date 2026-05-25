import { describe, expect, it } from "vitest";
import { fakeClient } from "./test-helpers";
import { createSessionRepository } from "@/data/session-repository";
import type { SessionRow } from "@/data/session-repository";

const sampleSession: SessionRow = {
  id: "uuid-1",
  status: "ongoing",
  planned_session_id: null,
  date: "2026-05-25",
  location: "Golders Hill",
  court_count: 2,
  allow_singles: true,
  attendees: [],
  rounds: [],
  today_stats: {},
  next_today_number: 1,
  current_round_index: 0,
  created_at: "2026-05-25T08:00:00Z",
};

describe("SessionRepository", () => {
  it("loadOngoing returns the ongoing session", async () => {
    const c = fakeClient({ sessions: { maybeSingle: sampleSession as unknown as Record<string, unknown> } });
    const repo = createSessionRepository(c);
    const session = await repo.loadOngoing();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("uuid-1");
    expect(session!.status).toBe("ongoing");
  });

  it("loadOngoing returns null when no ongoing session exists", async () => {
    const c = fakeClient({ sessions: { maybeSingle: null } });
    const repo = createSessionRepository(c);
    const session = await repo.loadOngoing();
    expect(session).toBeNull();
  });

  it("loadPast returns list of past sessions", async () => {
    const pastSession = { ...sampleSession, id: "uuid-2", status: "past" as const };
    const c = fakeClient({ sessions: { list: [pastSession as unknown as Record<string, unknown>] } });
    const repo = createSessionRepository(c);
    const sessions = await repo.loadPast();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.status).toBe("past");
  });

  it("upsert calls supabase upsert on sessions table", async () => {
    const c = fakeClient({ sessions: {} });
    const repo = createSessionRepository(c);
    await expect(repo.upsert(sampleSession)).resolves.toBeUndefined();
    expect(c.from).toHaveBeenCalledWith("sessions");
  });
});
