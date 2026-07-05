import type { PairHistory } from "@/engine/models";
import type { HistoryRepository } from "@/data/history-repository";
import { createCollection, type KV } from "@/data/local/kv";

/**
 * Device-local HistoryRepository — the cross-session pair-fairness weights.
 * This is the core differentiator, so it gets a full local implementation.
 */

interface PairRow {
  member_a: number;
  member_b: number;
  partner_w: number;
  opponent_w: number;
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function createLocalHistoryRepository(kv: KV): HistoryRepository {
  const history = createCollection<PairRow>(kv, "cs_history");
  return {
    async loadPairHistory(): Promise<PairHistory> {
      const partnerW = new Map<string, number>();
      const opponentW = new Map<string, number>();
      for (const r of await history.readRows()) {
        const key = pairKey(r.member_a, r.member_b);
        partnerW.set(key, r.partner_w);
        opponentW.set(key, r.opponent_w);
      }
      return { partnerW, opponentW };
    },
    async upsertPairWeights(updates) {
      if (updates.length === 0) return;
      await history.mutateRows((rows) => {
        const byKey = new Map(rows.map((r) => [pairKey(r.member_a, r.member_b), r]));
        for (const u of updates) {
          byKey.set(pairKey(u.a, u.b), {
            member_a: Math.min(u.a, u.b),
            member_b: Math.max(u.a, u.b),
            partner_w: u.partnerW,
            opponent_w: u.opponentW,
          });
        }
        return [...byKey.values()];
      });
    },
    async decayAll(lambda) {
      await history.mutateRows((rows) =>
        rows.map((r) => ({
          ...r,
          partner_w: r.partner_w * lambda,
          opponent_w: r.opponent_w * lambda,
        })),
      );
    },
  };
}
