import type { SupabaseClient } from "@supabase/supabase-js";
import { clubId as defaultClubId } from "@/data/club";
import type { Gender, Member } from "@/engine/models";

/**
 * v1.1 Model A: all mutating methods are gated by the club PIN.
 *
 * Reads remain plain table queries (anon SELECT is allowed by RLS). Writes go
 * through SECURITY DEFINER RPCs (see supabase/migrations/0005_v1_1_rpc.sql)
 * which verify the PIN server-side. Callers must obtain the PIN from
 * `pinStore.getPin()` after the user has unlocked it.
 */
export interface MemberRepository {
  listAll(): Promise<Member[]>;
  listActive(): Promise<Member[]>;
  add(input: { name: string; pin: string }): Promise<Member>;
  rename(id: number, name: string, pin: string): Promise<Member>;
  archive(id: number, pin: string): Promise<Member>;
  unarchive(id: number, pin: string): Promise<Member>;
  /** v1.6: set 男/女/未設定 for the gender-balance shuffle. */
  setGender(id: number, gender: Gender, pin: string): Promise<Member>;
  /** GDPR §17.4 right-to-erasure. Cascades to pair_history, match_log via DB FKs. */
  hardDelete(id: number, pin: string): Promise<void>;
}

interface MemberRow {
  id: number;
  name: string;
  status: string;
  /** Absent until migration 0011 is applied. */
  gender?: string;
  created_at: string;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Member["status"],
    gender: row.gender === "male" || row.gender === "female" ? row.gender : "unknown",
    createdAt: new Date(row.created_at),
  };
}

async function fetchMember(supabase: SupabaseClient, id: number, club: number): Promise<Member> {
  const { data, error } = await supabase.from("members").select("*").eq("club_id", club).eq("id", id).single();
  if (error) throw error;
  return toMember(data as MemberRow);
}

export function createMemberRepository(
  supabase: SupabaseClient,
  clubId: () => number = defaultClubId,
): MemberRepository {
  const t = () => supabase.from("members");
  return {
    async listAll() {
      const { data, error } = await t().select("*").eq("club_id", clubId()).order("name");
      if (error) throw error;
      return (data ?? []).map(toMember);
    },
    async listActive() {
      const { data, error } = await t()
        .select("*")
        .eq("club_id", clubId())
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(toMember);
    },
    async add({ name, pin }) {
      const { data, error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: null,
        p_name: name,
        p_status: "active",
        p_gender: "unknown",
        p_club: clubId(),
      });
      if (error) throw error;
      return fetchMember(supabase, data as number, clubId());
    },
    async rename(id, name, pin) {
      const current = await fetchMember(supabase, id, clubId());
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: name,
        p_status: current.status,
        p_gender: current.gender,
        p_club: clubId(),
      });
      if (error) throw error;
      return fetchMember(supabase, id, clubId());
    },
    async archive(id, pin) {
      const current = await fetchMember(supabase, id, clubId());
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: "archived",
        p_gender: current.gender,
        p_club: clubId(),
      });
      if (error) throw error;
      return fetchMember(supabase, id, clubId());
    },
    async unarchive(id, pin) {
      const current = await fetchMember(supabase, id, clubId());
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: "active",
        p_gender: current.gender,
        p_club: clubId(),
      });
      if (error) throw error;
      return fetchMember(supabase, id, clubId());
    },
    async setGender(id, gender, pin) {
      const current = await fetchMember(supabase, id, clubId());
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: current.status,
        p_gender: gender,
        p_club: clubId(),
      });
      if (error) throw error;
      return fetchMember(supabase, id, clubId());
    },
    async hardDelete(id, pin) {
      const { error } = await supabase.rpc("delete_member", {
        p_pin: pin,
        p_id: id,
        p_club: clubId(),
      });
      if (error) throw error;
    },
  };
}
