import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchResult } from "@/engine/models";

export interface MatchLogRepository {
  list(): Promise<MatchResult[]>;
  add(match: Omit<MatchResult, "at"> & { at?: Date }): Promise<MatchResult>;
  deleteBySession(sessionId: string): Promise<void>;
}

interface MatchLogRow {
  session_id: string;
  round_index: number;
  court_type: string;
  team_a: number[];
  team_b: number[];
  winner: string;
  played_at: string;
}

export function createMatchLogRepository(supabase: SupabaseClient): MatchLogRepository {
  const t = () => supabase.from("match_log");
  return {
    async list() {
      const { data, error } = await t().select("*").order("played_at");
      if (error) throw error;
      return ((data ?? []) as MatchLogRow[]).map(r => ({
        sessionId: r.session_id,
        roundIndex: r.round_index,
        courtType: r.court_type as MatchResult["courtType"],
        teamA: r.team_a,
        teamB: r.team_b,
        winner: r.winner as MatchResult["winner"],
        at: new Date(r.played_at),
      }));
    },
    async add(m) {
      const at = m.at ?? new Date();
      const { error } = await t().insert({
        session_id: m.sessionId,
        round_index: m.roundIndex,
        court_type: m.courtType,
        team_a: m.teamA,
        team_b: m.teamB,
        winner: m.winner,
        played_at: at.toISOString(),
      });
      if (error) throw error;
      return { ...m, at };
    },
    async deleteBySession(sessionId) {
      const { error } = await t().delete().eq("session_id", sessionId);
      if (error) throw error;
    },
  };
}
