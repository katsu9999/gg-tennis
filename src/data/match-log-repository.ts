import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchResult } from "@/engine/models";

export interface MatchLogRepository {
  list(): Promise<MatchResult[]>;
  add(match: Omit<MatchResult, "at"> & { at?: Date }): Promise<MatchResult>;
  deleteBySession(sessionId: string): Promise<void>;
  deleteByRoundCourt(sessionId: string, roundIndex: number, teamA: number[]): Promise<void>;
  /** Edit a court result on a PAST session. Direct anon writes to past
   *  sessions are blocked by RLS — this goes through the PIN-gated
   *  edit_past_court_winner RPC, which atomically replaces the match_log row
   *  and stores the updated rounds JSONB on the sessions row. */
  editPastCourtWinner(args: {
    pin: string;
    sessionId: string;
    roundIndex: number;
    teamA: number[];
    teamB: number[];
    courtType: MatchResult["courtType"];
    winner: "A" | "B" | null;
    rounds: unknown[];
  }): Promise<void>;
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
    async editPastCourtWinner(args) {
      const { error } = await supabase.rpc("edit_past_court_winner", {
        p_pin: args.pin,
        p_session_id: args.sessionId,
        p_round_index: args.roundIndex,
        p_team_a: args.teamA,
        p_team_b: args.teamB,
        p_court_type: args.courtType,
        p_winner: args.winner,
        p_rounds: args.rounds,
      });
      if (error) throw error;
    },
    async deleteByRoundCourt(sessionId, roundIndex, teamA) {
      // PostgREST serialises JS arrays via toString() → "5,9", which Postgres
      // then tries to cast to bigint[] and fails with
      //   "malformed array literal: \"5,9\""
      // We have to hand-format the PG array literal "{5,9}" so the cast works.
      const teamALiteral = `{${teamA.join(",")}}`;
      const { error } = await t()
        .delete()
        .eq("session_id", sessionId)
        .eq("round_index", roundIndex)
        .eq("team_a", teamALiteral);
      if (error) throw error;
    },
  };
}
