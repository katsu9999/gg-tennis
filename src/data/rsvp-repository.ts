import type { SupabaseClient } from "@supabase/supabase-js";

export type RsvpStatus = "going" | "not_going" | "maybe";

export interface RsvpRow {
  planned_session_id: string;
  member_id: number;
  status: RsvpStatus;
  note: string | null;
  updated_at: string;
  updated_by: "admin" | "self_public_link";
  self_token: string | null;
}

export interface RsvpRepository {
  listForSession(plannedSessionId: string): Promise<RsvpRow[]>;
  adminUpsert(row: Omit<RsvpRow, "updated_at" | "updated_by">): Promise<void>;
  /**
   * Public-link path. The caller MUST include the LocalStorage self_token in
   * the row. The DB-level RLS + trigger combination then ensures:
   *  - the row carries `updated_by = 'self_public_link'`
   *  - any existing row's self_token cannot be rotated
   * The app layer SHOULD additionally constrain UPDATE with `.eq('self_token', selfToken)`
   * so a mismatching token returns zero rows. See `supabase/migrations/0003_rls.sql`.
   */
  publicUpsertWithToken(row: Omit<RsvpRow, "updated_at" | "updated_by">): Promise<void>;
}

export function createRsvpRepository(supabase: SupabaseClient): RsvpRepository {
  const t = () => supabase.from("rsvps");
  return {
    async listForSession(plannedSessionId) {
      const { data, error } = await t().select("*").eq("planned_session_id", plannedSessionId);
      if (error) throw error;
      return (data ?? []) as RsvpRow[];
    },
    async adminUpsert(row) {
      const payload = {
        ...row,
        updated_at: new Date().toISOString(),
        updated_by: "admin" as const,
      };
      const { error } = await t().upsert(payload);
      if (error) throw error;
    },
    async publicUpsertWithToken(row) {
      if (!row.self_token) throw new Error("publicUpsertWithToken requires a self_token");
      const payload = {
        ...row,
        updated_at: new Date().toISOString(),
        updated_by: "self_public_link" as const,
      };
      const { error } = await t().upsert(payload);
      if (error) throw error;
    },
  };
}
