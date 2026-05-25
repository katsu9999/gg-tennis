import { describe, expect, it, vi } from "vitest";
import { createMemberRepository } from "@/data/member-repository";

interface MemberRow {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

function fakeClient(rows: MemberRow[]) {
  const tableMock = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation((p: { name: string }) => ({
      select: () => ({
        single: async () => ({
          data: {
            ...p,
            id: 99,
            status: "active",
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: rows[0], error: null }),
        }),
      }),
    })),
    delete: vi.fn().mockImplementation(() => ({
      eq: async () => ({ data: null, error: null }),
    })),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(tableMock),
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

  it("add inserts and returns the new row", async () => {
    const c = fakeClient([]);
    const repo = createMemberRepository(c);
    const m = await repo.add({ name: "新規" });
    expect(m.name).toBe("新規");
    expect(m.id).toBeGreaterThan(0);
    expect(m.status).toBe("active");
  });

  it("hardDelete removes from members table", async () => {
    const c = fakeClient([]);
    const repo = createMemberRepository(c);
    await repo.hardDelete(7);
    expect(c.from).toHaveBeenCalledWith("members");
  });
});
