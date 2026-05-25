import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/engine/models";

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
  /** GDPR §17.4 right-to-erasure. Cascades to pair_history, match_log via DB FKs. */
  hardDelete(id: number, pin: string): Promise<void>;
}

interface MemberRow {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Member["status"],
    createdAt: new Date(row.created_at),
  };
}

async function fetchMember(supabase: SupabaseClient, id: number): Promise<Member> {
  const { data, error } = await supabase.from("members").select("*").eq("id", id).single();
  if (error) throw error;
  return toMember(data as MemberRow);
}

export function createMemberRepository(
  supabase: SupabaseClient
): MemberRepository {
  const t = () => supabase.from("members");
  return {
    async listAll() {
      const { data, error } = await t().select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(toMember);
    },
    async listActive() {
      const { data, error } = await t()
        .select("*")
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
      });
      if (error) throw error;
      return fetchMember(supabase, data as number);
    },
    async rename(id, name, pin) {
      const current = await fetchMember(supabase, id);
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: name,
        p_status: current.status,
      });
      if (error) throw error;
      return fetchMember(supabase, id);
    },
    async archive(id, pin) {
      const current = await fetchMember(supabase, id);
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: "archived",
      });
      if (error) throw error;
      return fetchMember(supabase, id);
    },
    async unarchive(id, pin) {
      const current = await fetchMember(supabase, id);
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: "active",
      });
      if (error) throw error;
      return fetchMember(supabase, id);
    },
    async hardDelete(id, pin) {
      const { error } = await supabase.rpc("delete_member", {
        p_pin: pin,
        p_id: id,
      });
      if (error) throw error;
    },
  };
}
