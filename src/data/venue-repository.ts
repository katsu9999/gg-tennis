import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * v1.1 Model A: `add` is PIN-gated and goes through the `upsert_venue` RPC.
 * Read remains a plain anon SELECT.
 */
export interface VenueRepository {
  list(): Promise<string[]>;
  add(name: string, pin: string): Promise<void>;
}

export function createVenueRepository(supabase: SupabaseClient): VenueRepository {
  return {
    async list() {
      const { data, error } = await supabase.from("venues").select("name").order("name");
      if (error) throw error;
      return (data ?? []).map((r) => (r as { name: string }).name);
    },
    async add(name, pin) {
      const { error } = await supabase.rpc("upsert_venue", {
        p_pin: pin,
        p_id: null,
        p_name: name,
      });
      // Unique constraint violation = name already exists; treat as no-op.
      if (error && !/duplicate key|unique/i.test(error.message)) throw error;
    },
  };
}
