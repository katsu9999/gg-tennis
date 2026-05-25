import { describe, expect, it, vi } from "vitest";
import { fakeClient } from "./test-helpers";
import { createRsvpRepository } from "@/data/rsvp-repository";

describe("RsvpRepository", () => {
  it("listForSession returns empty array when no RSVPs exist", async () => {
    // `.select().eq()` path resolves via `then` with null data; coerced to []
    const c = fakeClient({ rsvps: {} });
    const repo = createRsvpRepository(c);
    const rows = await repo.listForSession("ps-uuid-1");
    expect(rows).toEqual([]);
  });

  it("adminUpsert sets updated_by to admin", async () => {
    let captured: Record<string, unknown> = {};
    const upsertMock = vi.fn().mockImplementation((p: Record<string, unknown>) => {
      captured = p;
      return { then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) };
    });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    const c = { from: fromMock } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const repo = createRsvpRepository(c);
    await repo.adminUpsert({
      planned_session_id: "ps-1",
      member_id: 42,
      status: "going",
      note: null,
      self_token: null,
    });

    expect(captured).toMatchObject({ updated_by: "admin", planned_session_id: "ps-1", member_id: 42 });
    expect(captured).toHaveProperty("updated_at");
  });

  it("publicUpsertWithToken rejects when self_token is null", async () => {
    const c = fakeClient({ rsvps: {} });
    const repo = createRsvpRepository(c);
    await expect(
      repo.publicUpsertWithToken({
        planned_session_id: "ps-1",
        member_id: 7,
        status: "maybe",
        note: null,
        self_token: null,
      })
    ).rejects.toThrow("publicUpsertWithToken requires a self_token");
  });

  it("publicUpsertWithToken sets updated_by to self_public_link when token is present", async () => {
    let captured: Record<string, unknown> = {};
    const upsertMock = vi.fn().mockImplementation((p: Record<string, unknown>) => {
      captured = p;
      return { then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) };
    });
    const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
    const c = { from: fromMock } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const repo = createRsvpRepository(c);
    await repo.publicUpsertWithToken({
      planned_session_id: "ps-1",
      member_id: 7,
      status: "going",
      note: null,
      self_token: "ls-token-xyz",
    });

    expect(captured).toMatchObject({ updated_by: "self_public_link", self_token: "ls-token-xyz" });
    expect(captured).toHaveProperty("updated_at");
  });
});
