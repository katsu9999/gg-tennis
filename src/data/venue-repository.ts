import type { SupabaseClient } from "@supabase/supabase-js";

export interface VenueRepository {
  list(): Promise<string[]>;
  add(name: string): Promise<void>;
}

export function createVenueRepository(supabase: SupabaseClient): VenueRepository {
  const t = () => supabase.from("venues");
  return {
    async list() {
      const { data, error } = await t().select("name").order("name");
      if (error) throw error;
      return (data ?? []).map(r => (r as { name: string }).name);
    },
    async add(name) {
      const { error } = await t().upsert({ name });
      if (error) throw error;
    },
  };
}
