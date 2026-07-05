import type { SessionRepository, SessionRow } from "@/data/session-repository";
import { createCollection, type KV } from "@/data/local/kv";

/**
 * Device-local SessionRepository.
 *
 * The ongoing session lives under its own key so that round-by-round hot
 * writes rewrite a small blob instead of the whole past-session history
 * (rounds JSONB included). `pin` on deleteById is accepted and ignored.
 */
export function createLocalSessionRepository(kv: KV): SessionRepository {
  const ongoing = createCollection<SessionRow>(kv, "cs_session_ongoing");
  const past = createCollection<SessionRow>(kv, "cs_sessions");

  function upsertInto(rows: SessionRow[], row: SessionRow): SessionRow[] {
    const rest = rows.filter((r) => r.id !== row.id);
    return [...rest, row];
  }

  async function write(row: SessionRow): Promise<void> {
    if (row.status === "ongoing") {
      await ongoing.mutateRows((rows) => upsertInto(rows, row));
      await past.mutateRows((rows) => rows.filter((r) => r.id !== row.id));
    } else {
      // Write the past copy first: a crash in between leaves a duplicate the
      // user can end again, never a lost session.
      await past.mutateRows((rows) => upsertInto(rows, row));
      await ongoing.mutateRows((rows) => rows.filter((r) => r.id !== row.id));
    }
  }

  return {
    async loadOngoing() {
      const rows = await ongoing.readRows();
      if (rows.length === 0) return null;
      // GG parity: with multiple ongoing rows, adopt the most recent.
      return rows
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0]!;
    },
    async loadPast() {
      return (await past.readRows())
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
    async loadById(id) {
      const fromOngoing = (await ongoing.readRows()).find((r) => r.id === id);
      if (fromOngoing) return fromOngoing;
      return (await past.readRows()).find((r) => r.id === id) ?? null;
    },
    upsert: write,
    // The GG repo splits update from upsert purely for RLS reasons; locally
    // they share the same semantics.
    update: write,
    async deleteById(id) {
      await ongoing.mutateRows((rows) => rows.filter((r) => r.id !== id));
      await past.mutateRows((rows) => rows.filter((r) => r.id !== id));
    },
  };
}
