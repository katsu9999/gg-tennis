import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

const { createGgSupabaseClient } = await import("@/data/supabase-client");

describe("createGgSupabaseClient (factory)", () => {
  it("throws if url is missing", () => {
    expect(() => createGgSupabaseClient("", "anon-key")).toThrow(/Supabase URL/);
  });

  it("throws if anon key is missing", () => {
    expect(() => createGgSupabaseClient("https://x.supabase.co", "")).toThrow(/anon key/);
  });

  it("returns a client with auth and from() exposed", () => {
    const c = createGgSupabaseClient("https://x.supabase.co", "anon-key");
    expect(typeof c.auth).toBe("object");
    expect(typeof c.from).toBe("function");
  });
});
