import { describe, expect, it, vi } from "vitest";
import { createMemberRepository } from "@/data/member-repository";

interface MemberRow {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

/**
 * v1.1: mutating methods go through `supabase.rpc("upsert_member", ...)`
 * or `supabase.rpc("delete_member", ...)`. Reads still use `from("members")`.
 */
function fakeClient(rows: MemberRow[]) {
  // Used by reads (listAll / listActive) and by the helper that reloads a
  // single row after a write RPC.
  const tableMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    // Used by fetchMember() after a write. Returns the first row by default.
    single: vi.fn().mockImplementation(async () => ({ data: rows[0], error: null })),
  };
  return {
    from: vi.fn().mockReturnValue(tableMock),
    rpc: vi.fn().mockImplementation(async (fn: string) => {
      if (fn === "upsert_member") return { data: rows[0]?.id ?? 99, error: null };
      if (fn === "delete_member") return { data: null, error: null };
      return { data: null, error: null };
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("MemberRepository", () => {
  it("listActive returns active members", async () => {
    const c = fakeClient([
      {
        id: 1,
        name: "A",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const repo = createMemberRepository(c);
    const members = await repo.listActive();
    expect(members[0]!.name).toBe("A");
    expect(members[0]!.status).toBe("active");
  });

  it("listAll returns all members", async () => {
    const c = fakeClient([
      {
        id: 1,
        name: "A",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        name: "B",
        status: "archived",
        created_at: "2026-01-02T00:00:00Z",
      },
    ]);
    const repo = createMemberRepository(c);
    const members = await repo.listAll();
    expect(members).toHaveLength(2);
  });

  it("add calls upsert_member RPC with PIN and returns the new row", async () => {
    const c = fakeClient([
      { id: 99, name: "新規", status: "active", created_at: "2026-01-01T00:00:00Z" },
    ]);
    const repo = createMemberRepository(c);
    const m = await repo.add({ name: "新規", pin: "test-pin" });
    expect(m.name).toBe("新規");
    expect(c.rpc).toHaveBeenCalledWith(
      "upsert_member",
      expect.objectContaining({ p_pin: "test-pin", p_name: "新規", p_status: "active" }),
    );
  });

  it("hardDelete calls delete_member RPC with PIN", async () => {
    const c = fakeClient([]);
    const repo = createMemberRepository(c);
    await repo.hardDelete(7, "test-pin");
    expect(c.rpc).toHaveBeenCalledWith("delete_member", { p_pin: "test-pin", p_id: 7 });
  });
});
