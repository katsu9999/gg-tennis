import { signal, type Signal } from "@preact/signals";
import type { RsvpRepository, RsvpRow } from "@/data/rsvp-repository";

export interface RsvpStore {
  /** rows keyed by plannedSessionId */
  bySession: Signal<Map<string, RsvpRow[]>>;
  loadForSession(plannedSessionId: string): Promise<RsvpRow[]>;
  adminUpsert(row: Omit<RsvpRow, "updated_at" | "updated_by">): Promise<void>;
  publicUpsertWithToken(row: Omit<RsvpRow, "updated_at" | "updated_by">): Promise<void>;
  /** Convenience: count by status for a session */
  countsFor(plannedSessionId: string): { going: number; not_going: number; maybe: number };
  /** Convenience: member IDs in 'going' status for a session */
  goingMemberIds(plannedSessionId: string): number[];
}

export function createRsvpStore(repo: RsvpRepository): RsvpStore {
  const bySession = signal(new Map<string, RsvpRow[]>());

  function replace(plannedSessionId: string, rows: RsvpRow[]): void {
    const next = new Map(bySession.value);
    next.set(plannedSessionId, rows);
    bySession.value = next;
  }

  async function loadForSession(plannedSessionId: string): Promise<RsvpRow[]> {
    const rows = await repo.listForSession(plannedSessionId);
    replace(plannedSessionId, rows);
    return rows;
  }

  return {
    bySession,
    loadForSession,
    async adminUpsert(row) {
      await repo.adminUpsert(row);
      await loadForSession(row.planned_session_id);
    },
    async publicUpsertWithToken(row) {
      await repo.publicUpsertWithToken(row);
      await loadForSession(row.planned_session_id);
    },
    countsFor(plannedSessionId) {
      const rows = bySession.value.get(plannedSessionId) ?? [];
      const counts = { going: 0, not_going: 0, maybe: 0 };
      for (const r of rows) counts[r.status]++;
      return counts;
    },
    goingMemberIds(plannedSessionId) {
      const rows = bySession.value.get(plannedSessionId) ?? [];
      return rows.filter(r => r.status === "going").map(r => r.member_id);
    },
  };
}
