import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/engine/models";

export interface MemberRepository {
  listAll(): Promise<Member[]>;
  listActive(): Promise<Member[]>;
  add(input: { name: string }): Promise<Member>;
  rename(id: number, name: string): Promise<Member>;
  archive(id: number): Promise<Member>;
  unarchive(id: number): Promise<Member>;
  /** GDPR §17.4 right-to-erasure. Cascades to pair_history, match_log via DB FKs. */
  hardDelete(id: number): Promise<void>;
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
    async add({ name }) {
      const { data, error } = await t()
        .insert({ name, status: "active" })
        .select()
        .single();
      if (error) throw error;
      return toMember(data);
    },
    async rename(id, name) {
      const { data, error } = await t()
        .update({ name })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return toMember(data);
    },
    async archive(id) {
      const { data, error } = await t()
        .update({ status: "archived" })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return toMember(data);
    },
    async unarchive(id) {
      const { data, error } = await t()
        .update({ status: "active" })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return toMember(data);
    },
    async hardDelete(id) {
      const { error } = await t().delete().eq("id", id);
      if (error) throw error;
    },
  };
}
