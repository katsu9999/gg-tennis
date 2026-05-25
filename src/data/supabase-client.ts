import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Build a Supabase client. Exported as a factory so tests can construct one
 * with explicit credentials (or hit a local emulator); production code uses
 * the default export which reads from Vite env at import time.
 */
export function createGgSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (!url) throw new Error("Supabase URL is required");
  if (!anonKey) throw new Error("Supabase anon key is required");
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      autoRefreshToken: true,
    },
    global: { headers: { "x-application": "gg-tennis-shuffle" } },
  });
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local. " +
      "See README.md → 'Supabase setup' for the one-time London-region project creation.",
  );
}

/** Singleton client for application code. */
export const supabase: SupabaseClient = createGgSupabaseClient(url, anonKey);
