import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionRow {
  id: string;
  status: "ongoing" | "past";
  planned_session_id: string | null;
  date: string;
  location: string;
  court_count: number;
  allow_singles: boolean;
  attendees: unknown[];
  rounds: unknown[];
  today_stats: Record<string, unknown>;
  next_today_number: number;
  current_round_index: number;
  created_at: string;
}

export interface SessionRepository {
  loadOngoing(): Promise<SessionRow | null>;
  loadPast(): Promise<SessionRow[]>;
  loadById(id: string): Promise<SessionRow | null>;
  upsert(row: SessionRow): Promise<void>;
}

export function createSessionRepository(supabase: SupabaseClient): SessionRepository {
  const t = () => supabase.from("sessions");
  return {
    async loadOngoing() {
      const { data, error } = await t().select("*").eq("status", "ongoing").maybeSingle();
      if (error) throw error;
      return (data as SessionRow | null) ?? null;
    },
    async loadPast() {
      const { data, error } = await t().select("*").eq("status", "past").order("date");
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    async loadById(id) {
      const { data, error } = await t().select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as SessionRow | null) ?? null;
    },
    async upsert(row) {
      const { error } = await t().upsert(row);
      if (error) throw error;
    },
  };
}
