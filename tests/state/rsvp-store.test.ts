import { describe, expect, it, vi } from "vitest";
import { createRsvpStore } from "@/state/rsvp-store";
import type { RsvpRepository, RsvpRow } from "@/data/rsvp-repository";

function makeRsvpRow(overrides: Partial<RsvpRow> = {}): RsvpRow {
  return {
    planned_session_id: "ps-1",
    member_id: 1,
    status: "going",
    note: null,
    updated_at: "2026-05-25T00:00:00Z",
    updated_by: "admin",
    self_token: null,
    ...overrides,
  };
}

function makeRepo(rows: RsvpRow[] = []): RsvpRepository {
  return {
    listForSession: vi.fn().mockResolvedValue(rows),
    adminUpsert: vi.fn().mockResolvedValue(undefined),
    publicUpsertWithToken: vi.fn().mockResolvedValue(undefined),
  };
}

describe("rsvp store", () => {
  it("starts with empty bySession map", () => {
    const store = createRsvpStore(makeRepo());
    expect(store.bySession.value.size).toBe(0);
  });

  it("loadForSession populates bySession and returns rows", async () => {
    const rows = [makeRsvpRow({ member_id: 1 }), makeRsvpRow({ member_id: 2, status: "maybe" })];
    const store = createRsvpStore(makeRepo(rows));
    const returned = await store.loadForSession("ps-1");
    expect(returned).toHaveLength(2);
    expect(store.bySession.value.get("ps-1")).toHaveLength(2);
  });

  it("countsFor returns correct breakdown by status", async () => {
    const rows = [
      makeRsvpRow({ member_id: 1, status: "going" }),
      makeRsvpRow({ member_id: 2, status: "going" }),
      makeRsvpRow({ member_id: 3, status: "not_going" }),
      makeRsvpRow({ member_id: 4, status: "maybe" }),
    ];
    const store = createRsvpStore(makeRepo(rows));
    await store.loadForSession("ps-1");
    const counts = store.countsFor("ps-1");
    expect(counts.going).toBe(2);
    expect(counts.not_going).toBe(1);
    expect(counts.maybe).toBe(1);
  });

  it("goingMemberIds returns only member IDs with 'going' status", async () => {
    const rows = [
      makeRsvpRow({ member_id: 10, status: "going" }),
      makeRsvpRow({ member_id: 20, status: "not_going" }),
      makeRsvpRow({ member_id: 30, status: "going" }),
      makeRsvpRow({ member_id: 40, status: "maybe" }),
    ];
    const store = createRsvpStore(makeRepo(rows));
    await store.loadForSession("ps-1");
    const ids = store.goingMemberIds("ps-1");
    expect(ids.sort()).toEqual([10, 30]);
  });

  it("adminUpsert triggers a reload of the session's rows", async () => {
    const initial = [makeRsvpRow({ member_id: 1, status: "going" })];
    const afterUpsert = [
      makeRsvpRow({ member_id: 1, status: "going" }),
      makeRsvpRow({ member_id: 2, status: "not_going" }),
    ];
    const repo = makeRepo(initial);
    const store = createRsvpStore(repo);

    await store.loadForSession("ps-1");
    expect(store.bySession.value.get("ps-1")).toHaveLength(1);

    // Switch the mock to return 2 rows after the upsert
    (repo.listForSession as ReturnType<typeof vi.fn>).mockResolvedValue(afterUpsert);

    await store.adminUpsert(
      {
        planned_session_id: "ps-1",
        member_id: 2,
        status: "not_going",
        note: null,
        self_token: null,
      },
      "test-pin",
    );

    // The PIN must reach the repo — admin RSVP entry is a PIN-gated RPC now.
    expect(repo.adminUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: 2 }),
      "test-pin",
    );
    expect(store.bySession.value.get("ps-1")).toHaveLength(2);
  });
});
