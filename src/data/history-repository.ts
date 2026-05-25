import type { SupabaseClient } from "@supabase/supabase-js";
import type { PairHistory } from "@/engine/models";

export interface HistoryRepository {
  loadPairHistory(): Promise<PairHistory>;
  upsertPairWeights(updates: { a: number; b: number; partnerW: number; opponentW: number }[]): Promise<void>;
  decayAll(lambda: number): Promise<void>;
}

interface PairHistoryRow {
  member_a: number;
  member_b: number;
  partner_w: number;
  opponent_w: number;
}

export function createHistoryRepository(supabase: SupabaseClient): HistoryRepository {
  const t = () => supabase.from("pair_history");
  return {
    async loadPairHistory(): Promise<PairHistory> {
      const { data, error } = await t().select("*");
      if (error) throw error;
      const partnerW = new Map<string, number>();
      const opponentW = new Map<string, number>();
      for (const r of (data ?? []) as PairHistoryRow[]) {
        const a = Math.min(r.member_a, r.member_b);
        const b = Math.max(r.member_a, r.member_b);
        const key = `${a}:${b}`;
        partnerW.set(key, r.partner_w);
        opponentW.set(key, r.opponent_w);
      }
      return { partnerW, opponentW };
    },
    async upsertPairWeights(updates) {
      const rows = updates.map(u => ({
        member_a: Math.min(u.a, u.b),
        member_b: Math.max(u.a, u.b),
        partner_w: u.partnerW,
        opponent_w: u.opponentW,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length === 0) return;
      const { error } = await t().upsert(rows);
      if (error) throw error;
    },
    async decayAll(lambda) {
      const { data, error } = await t().select("*");
      if (error) throw error;
      const rows = ((data ?? []) as PairHistoryRow[]).map(r => ({
        ...r,
        partner_w: r.partner_w * lambda,
        opponent_w: r.opponent_w * lambda,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length === 0) return;
      const { error: upErr } = await t().upsert(rows);
      if (upErr) throw upErr;
    },
  };
}
