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

export interface PlannedSessionRepository {
  list(): Promise<PlannedSessionRow[]>;
  loadById(id: string): Promise<PlannedSessionRow | null>;
  loadByToken(token: string): Promise<PlannedSessionRow | null>;
  loadNext(): Promise<PlannedSessionRow | null>;
  create(input: Omit<PlannedSessionRow, "id" | "created_at">): Promise<PlannedSessionRow>;
  rotateToken(id: string): Promise<string>;
  delete(id: string): Promise<void>;
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (const b of bytes) out += b.toString(36).padStart(2, "0");
  return out;
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
    async create(input) {
      const { data, error } = await t().insert(input).select().single();
      if (error) throw error;
      return data as PlannedSessionRow;
    },
    async rotateToken(id) {
      const token = generateToken();
      const { error } = await t().update({ public_rsvp_token: token }).eq("id", id);
      if (error) throw error;
      return token;
    },
    async delete(id) {
      const { error } = await t().delete().eq("id", id);
      if (error) throw error;
    },
  };
}
