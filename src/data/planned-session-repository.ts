import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlannedSessionRow {
  id: string;
  date: string;
  location: string;
  court_count: number;
  allow_singles: boolean;
  public_rsvp_token: string | null;
  show_going_list_on_public: boolean;
  created_at: string;
  created_by: string | null;
}

/**
 * v1.1 Model A: write methods (`create`, `rotateToken`, `delete`) are
 * PIN-gated and go through SECURITY DEFINER RPC functions. Reads remain plain
 * anon SELECTs.
 */
export interface PlannedSessionRepository {
  list(): Promise<PlannedSessionRow[]>;
  loadById(id: string): Promise<PlannedSessionRow | null>;
  loadByToken(token: string): Promise<PlannedSessionRow | null>;
  loadNext(): Promise<PlannedSessionRow | null>;
  create(
    input: Omit<PlannedSessionRow, "id" | "created_at">,
    pin: string,
  ): Promise<PlannedSessionRow>;
  rotateToken(id: string, pin: string): Promise<string>;
  delete(id: string, pin: string): Promise<void>;
}

export function createPlannedSessionRepository(supabase: SupabaseClient): PlannedSessionRepository {
  const t = () => supabase.from("planned_sessions");
  return {
    async list() {
      const { data, error } = await t().select("*").order("date");
      if (error) throw error;
      return (data ?? []) as PlannedSessionRow[];
    },
    async loadById(id) {
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as PlannedSessionRow | null) ?? null;
    },
    async loadByToken(token) {
      const { data, error } = await t().select("*").eq("public_rsvp_token", token).maybeSingle();
      if (error) throw error;
      return (data as PlannedSessionRow | null) ?? null;
    },
    async loadNext() {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await t().select("*").gte("date", today).order("date").maybeSingle();
      if (error) throw error;
      return (data as PlannedSessionRow | null) ?? null;
    },
    async create(input, pin) {
      const { data: id, error } = await supabase.rpc("upsert_planned_session", {
        p_pin: pin,
        p_id: null,
        p_date: input.date,
        p_location: input.location,
        p_court_count: input.court_count,
        p_allow_singles: input.allow_singles,
        p_show_going_list_on_public: input.show_going_list_on_public,
      });
      if (error) throw error;
      const row = await this.loadById(id as string);
      if (!row) throw new Error("planned_session created but could not be reloaded");
      return row;
    },
    async rotateToken(id, pin) {
      const { data: token, error } = await supabase.rpc("rotate_public_rsvp_token", {
        p_pin: pin,
        p_id: id,
      });
      if (error) throw error;
      return token as string;
    },
    async delete(id, pin) {
      const { error } = await supabase.rpc("delete_planned_session", {
        p_pin: pin,
        p_id: id,
      });
      if (error) throw error;
    },
  };
}
