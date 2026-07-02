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
    const c = fakeClient({ sessions: { list: [sampleSession as unknown as Record<string, unknown>] } });
    const repo = createSessionRepository(c);
    const session = await repo.loadOngoing();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("uuid-1");
    expect(session!.status).toBe("ongoing");
  });

  it("loadOngoing returns null when no ongoing session exists", async () => {
    const c = fakeClient({ sessions: { list: [] } });
    const repo = createSessionRepository(c);
    const session = await repo.loadOngoing();
    expect(session).toBeNull();
  });

  it("loadOngoing returns the newest row (no throw) when multiple ongoing sessions exist", async () => {
    // Two ongoing rows can happen when a stale session is left un-ended and a
    // new one is started. .maybeSingle() throws in that case, bricking both
    // home and resume — loadOngoing must instead adopt the newest row.
    const older = { ...sampleSession, id: "uuid-old", created_at: "2026-05-20T08:00:00Z" };
    const newer = { ...sampleSession, id: "uuid-new", created_at: "2026-05-25T08:00:00Z" };
    const c = fakeClient({
      sessions: { list: [older, newer] as unknown as Record<string, unknown>[] },
    });
    const repo = createSessionRepository(c);
    const session = await repo.loadOngoing();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("uuid-new");
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
