import type { Member } from "@/engine/models";
import type { MemberRepository } from "@/data/member-repository";
import { createCollection, createCounter, type KV } from "@/data/local/kv";

/**
 * Device-local MemberRepository. The `pin` arguments required by the shared
 * interface are accepted and ignored — there is no server to protect.
 */

interface MemberRow {
  id: number;
  name: string;
  status: "active" | "archived";
  created_at: string;
}

interface PairRow {
  member_a: number;
  member_b: number;
  partner_w: number;
  opponent_w: number;
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

function byName(a: MemberRow, b: MemberRow): number {
  return a.name.localeCompare(b.name);
}

export function createLocalMemberRepository(kv: KV): MemberRepository {
  const members = createCollection<MemberRow>(kv, "cs_members");
  const history = createCollection<PairRow>(kv, "cs_history");
  // Ids are permanent (pair-history keys reference them), so never reuse one
  // after a delete — a persisted counter mirrors a DB sequence. max(id)+1
  // would hand a deleted member's id to a newcomer.
  const seq = createCounter(kv, "cs_member_seq");

  async function mutateOne(id: number, patch: Partial<MemberRow>): Promise<Member> {
    let updated: MemberRow | undefined;
    await members.mutateRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new Error(`member ${id} not found`);
    return toMember(updated);
  }

  return {
    async listAll() {
      return (await members.readRows()).sort(byName).map(toMember);
    },
    async listActive() {
      return (await members.readRows())
        .filter((r) => r.status === "active")
        .sort(byName)
        .map(toMember);
    },
    async add({ name }) {
      const nextId = await seq.next();
      let added!: MemberRow;
      await members.mutateRows((rows) => {
        added = { id: nextId, name, status: "active", created_at: new Date().toISOString() };
        return [...rows, added];
      });
      return toMember(added);
    },
    async rename(id, name) {
      return mutateOne(id, { name });
    },
    async archive(id) {
      return mutateOne(id, { status: "archived" });
    },
    async unarchive(id) {
      return mutateOne(id, { status: "active" });
    },
    async hardDelete(id) {
      await members.mutateRows((rows) => rows.filter((r) => r.id !== id));
      // Mirror the DB's ON DELETE CASCADE from members to pair_history.
      await history.mutateRows((rows) =>
        rows.filter((r) => r.member_a !== id && r.member_b !== id),
      );
    },
  };
}
