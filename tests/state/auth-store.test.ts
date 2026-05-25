import { describe, expect, it, vi } from "vitest";
import { createAuthStore } from "@/state/auth-store";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeSupabase(opts: { adminEmail?: string }): SupabaseClient {
  const handlers: Array<(event: string, session: unknown) => void> = [];
  const session = opts.adminEmail ? { user: { email: opts.adminEmail } } : null;
  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockImplementation(async () => {
        handlers.forEach(h => h("SIGNED_OUT", null));
        return { error: null };
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: vi.fn().mockImplementation((h: (e: string, s: unknown) => void) => {
        handlers.push(h);
        return { data: { subscription: { unsubscribe() { /* noop */ } } } };
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: opts.adminEmail ? [{ email: opts.adminEmail }] : [],
        error: null,
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("auth store", () => {
  it("starts with null email and isAdmin=false", () => {
    const store = createAuthStore(fakeSupabase({}));
    expect(store.email.value).toBeNull();
    expect(store.isAdmin.value).toBe(false);
  });

  it("loading is true initially and false after init()", async () => {
    const store = createAuthStore(fakeSupabase({}));
    expect(store.loading.value).toBe(true);
    await store.init();
    expect(store.loading.value).toBe(false);
  });

  it("init() populates email and isAdmin when session has an admin email", async () => {
    const store = createAuthStore(fakeSupabase({ adminEmail: "admin@example.com" }));
    await store.init();
    expect(store.email.value).toBe("admin@example.com");
    expect(store.isAdmin.value).toBe(true);
  });

  it("init() leaves isAdmin=false when session is missing", async () => {
    const store = createAuthStore(fakeSupabase({}));
    await store.init();
    expect(store.email.value).toBeNull();
    expect(store.isAdmin.value).toBe(false);
  });

  it("signInWithMagicLink calls supabase.auth.signInWithOtp with redirect URL", async () => {
    const s = fakeSupabase({});
    const store = createAuthStore(s);
    await store.signInWithMagicLink("user@example.com");
    expect(s.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: expect.objectContaining({ emailRedirectTo: expect.any(String) }),
    });
  });

  it("signOut clears email and isAdmin", async () => {
    const s = fakeSupabase({ adminEmail: "admin@example.com" });
    const store = createAuthStore(s);
    await store.init();
    expect(store.isAdmin.value).toBe(true);
    await store.signOut();
    expect(store.email.value).toBeNull();
    expect(store.isAdmin.value).toBe(false);
  });
});
