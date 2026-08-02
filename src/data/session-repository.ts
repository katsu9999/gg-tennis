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
  /** PIN-gated deletion via delete_session RPC (cascades match_log via FK). */
  deleteById(id: string, pin: string): Promise<void>;
  /** Delete an ongoing session outright (discard, no PIN). RLS only permits
   *  this while status='ongoing' (migration 0010); past rows stay frozen
   *  behind the PIN-gated RPC. Throws if nothing was deleted — RLS silently
   *  filters unauthorized rows, and swallowing that would fake a discard. */
  deleteOngoing(id: string): Promise<void>;
}

export function createSessionRepository(supabase: SupabaseClient): SessionRepository {
  const t = () => supabase.from("sessions");
  return {
    async loadOngoing() {
      // Multiple ongoing rows can exist when a stale session is left un-ended
      // and a new one starts. .maybeSingle() throws on >1 rows, which bricks
      // both home and resume — adopt the most recently written row instead.
      const { data, error } = await t().select("*").eq("status", "ongoing");
      if (error) throw error;
      const rows = (data ?? []) as SessionRow[];
      if (rows.length === 0) return null;
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      return rows[0]!;
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
    async deleteOngoing(id) {
      const { data, error } = await t()
        .delete()
        .eq("id", id)
        .eq("status", "ongoing")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "discard_blocked: session not deleted (already ended elsewhere, or migration 0010 not applied)",
        );
      }
    },
    async deleteById(id, pin) {
      const { error } = await supabase.rpc("delete_session", {
        p_pin: pin,
        p_session_id: id,
      });
      if (error) throw error;
    },
  };
}
