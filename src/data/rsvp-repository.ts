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

/** What anon reads can see — self_token is excluded by column-level grants
 *  (migration 0008), so it never leaves the DB on the public read path. */
export type RsvpPublicRow = Omit<RsvpRow, "self_token">;

/** Columns readable by anon. Selecting "*" would fail with permission-denied
 *  because the self_token column grant was revoked in migration 0008. */
const PUBLIC_COLUMNS = "planned_session_id, member_id, status, note, updated_at, updated_by";

export interface RsvpRepository {
  listForSession(plannedSessionId: string): Promise<RsvpPublicRow[]>;
  /** Admin entry path — PIN-gated RPC (direct anon writes are blocked by RLS). */
  adminUpsert(row: Omit<RsvpRow, "updated_at" | "updated_by">, pin: string): Promise<void>;
  /**
   * Public-link path. Goes through the `upsert_rsvp_with_token` SECURITY
   * DEFINER RPC, which verifies the caller's LocalStorage token against the
   * stored row server-side — a mismatching token raises `rsvp_token_mismatch`
   * instead of silently flipping another member's RSVP.
   */
  publicUpsertWithToken(row: Omit<RsvpRow, "updated_at" | "updated_by">): Promise<void>;
}

export function createRsvpRepository(supabase: SupabaseClient): RsvpRepository {
  const t = () => supabase.from("rsvps");
  return {
    async listForSession(plannedSessionId) {
      const { data, error } = await t()
        .select(PUBLIC_COLUMNS)
        .eq("planned_session_id", plannedSessionId);
      if (error) throw error;
      return (data ?? []) as RsvpPublicRow[];
    },
    async adminUpsert(row, pin) {
      const { error } = await supabase.rpc("admin_upsert_rsvp", {
        p_pin: pin,
        p_planned_session_id: row.planned_session_id,
        p_member_id: row.member_id,
        p_status: row.status,
        p_note: row.note,
      });
      if (error) throw error;
    },
    async publicUpsertWithToken(row) {
      if (!row.self_token) throw new Error("publicUpsertWithToken requires a self_token");
      const { error } = await supabase.rpc("upsert_rsvp_with_token", {
        p_planned_session_id: row.planned_session_id,
        p_member_id: row.member_id,
        p_status: row.status,
        p_note: row.note,
        p_token: row.self_token,
      });
      if (error) throw error;
    },
  };
}
