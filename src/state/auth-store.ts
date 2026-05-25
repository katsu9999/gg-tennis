import { signal, type Signal } from "@preact/signals";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthStore {
  email: Signal<string | null>;
  isAdmin: Signal<boolean>;
  loading: Signal<boolean>;
  init(): Promise<void>;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

interface SessionLike {
  user?: { email?: string };
}

export function createAuthStore(supabase: SupabaseClient): AuthStore {
  const email = signal<string | null>(null);
  const isAdmin = signal(false);
  const loading = signal(true);

  async function checkAdmin(currentEmail: string | null): Promise<boolean> {
    if (!currentEmail) return false;
    const { data, error } = await supabase.from("admins").select("email").eq("email", currentEmail);
    if (error) return false;
    return ((data as { email: string }[] | null)?.length ?? 0) > 0;
  }

  async function refreshFromSession(session: SessionLike | null): Promise<void> {
    const e = session?.user?.email ?? null;
    email.value = e;
    isAdmin.value = await checkAdmin(e);
  }

  return {
    email,
    isAdmin,
    loading,
    async init() {
      loading.value = true;
      try {
        const { data } = await supabase.auth.getSession();
        await refreshFromSession(data.session as SessionLike | null);
        supabase.auth.onAuthStateChange((_event, session) => {
          void refreshFromSession(session as SessionLike | null);
        });
      } finally {
        loading.value = false;
      }
    },
    async signInWithMagicLink(emailIn) {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : "/";
      const { error } = await supabase.auth.signInWithOtp({
        email: emailIn,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
      email.value = null;
      isAdmin.value = false;
    },
  };
}
