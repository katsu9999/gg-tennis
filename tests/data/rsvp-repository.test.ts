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

  it("listForSession selects explicit public columns — never self_token", async () => {
    // self_token is no longer readable by anon (column-level grant); selecting
    // "*" would fail with permission-denied and, worse, previously leaked every
    // member's token to any visitor.
    const c = fakeClient({ rsvps: { list: [] } });
    const repo = createRsvpRepository(c);
    await repo.listForSession("ps-uuid-1");

    const builder = (c.from as ReturnType<typeof vi.fn>).mock.results[0]!.value as {
      select: ReturnType<typeof vi.fn>;
    };
    const selectArg = builder.select.mock.calls[0]![0] as string;
    expect(selectArg).not.toBe("*");
    expect(selectArg).not.toContain("self_token");
    expect(selectArg).toContain("member_id");
    expect(selectArg).toContain("status");
  });

  it("adminUpsert calls the PIN-gated admin_upsert_rsvp RPC", async () => {
    const c = fakeClient({}, { admin_upsert_rsvp: { data: null } });
    const repo = createRsvpRepository(c);
    await repo.adminUpsert(
      {
        planned_session_id: "ps-1",
        member_id: 42,
        status: "going",
        note: null,
        self_token: null,
      },
      "test-pin",
    );

    expect(c.rpc).toHaveBeenCalledWith("admin_upsert_rsvp", {
      p_pin: "test-pin",
      p_planned_session_id: "ps-1",
      p_member_id: 42,
      p_status: "going",
      p_note: null,
    });
  });

  it("adminUpsert surfaces RPC errors", async () => {
    const c = fakeClient({}, { admin_upsert_rsvp: { error: { message: "invalid_pin" } } });
    const repo = createRsvpRepository(c);
    await expect(
      repo.adminUpsert(
        { planned_session_id: "ps-1", member_id: 1, status: "going", note: null, self_token: null },
        "wrong",
      ),
    ).rejects.toMatchObject({ message: "invalid_pin" });
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

  it("publicUpsertWithToken calls the token-verifying upsert_rsvp_with_token RPC", async () => {
    // Direct table writes are gone — the RPC verifies the token server-side so
    // another member's RSVP can no longer be flipped with a forged row.
    const c = fakeClient({}, { upsert_rsvp_with_token: { data: null } });
    const repo = createRsvpRepository(c);
    await repo.publicUpsertWithToken({
      planned_session_id: "ps-1",
      member_id: 7,
      status: "going",
      note: null,
      self_token: "ls-token-xyz",
    });

    expect(c.rpc).toHaveBeenCalledWith("upsert_rsvp_with_token", {
      p_planned_session_id: "ps-1",
      p_member_id: 7,
      p_status: "going",
      p_note: null,
      p_token: "ls-token-xyz",
    });
  });

  it("publicUpsertWithToken surfaces a token mismatch error", async () => {
    const c = fakeClient({}, { upsert_rsvp_with_token: { error: { message: "rsvp_token_mismatch" } } });
    const repo = createRsvpRepository(c);
    await expect(
      repo.publicUpsertWithToken({
        planned_session_id: "ps-1",
        member_id: 7,
        status: "going",
        note: null,
        self_token: "stolen-token",
      }),
    ).rejects.toMatchObject({ message: "rsvp_token_mismatch" });
  });
});
