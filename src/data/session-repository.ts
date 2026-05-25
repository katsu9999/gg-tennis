import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wire shape of the `sessions` table row.
 *
 * `attendees`, `rounds`, and `today_stats` are JSONB columns whose in-memory
 * shapes (Attendee[], Round[], Map<...>) live in the engine layer. The repo
 * stays as a thin persistence boundary; Phase 3's session-store does the cast.
 */
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
  /** v1.1: LocalStorage token of whoever started this session. Label only. */
  host_token?: string | null;
  /** v1.1: display name supplied by the host (optional). */
  host_label?: string | null;
}

export interface SessionRepository {
  loadOngoing(): Promise<SessionRow | null>;
  loadPast(): Promise<SessionRow[]>;
  loadById(id: string): Promise<SessionRow | null>;
  upsert(row: SessionRow): Promise<void>;
  /** Pure UPDATE for a known-existing session. Avoids the INSERT path in
   * upsert, which is rejected by the v1.1 RLS policy when status='past'
   * (anon INSERT is restricted to status='ongoing'). */
  update(row: SessionRow): Promise<void>;
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
    async update(row) {
      const { id, ...rest } = row;
      const { error } = await t().update(rest).eq("id", id);
      if (error) throw error;
    },
  };
}
