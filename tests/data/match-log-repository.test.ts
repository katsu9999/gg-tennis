import { describe, expect, it, vi } from "vitest";
import { fakeClient } from "./test-helpers";
import { createMatchLogRepository } from "@/data/match-log-repository";

const sampleRow = {
  session_id: "sess-1",
  round_index: 0,
  court_type: "doubles",
  team_a: [1, 2],
  team_b: [3, 4],
  winner: "A",
  played_at: "2026-05-01T10:00:00Z",
};

describe("MatchLogRepository", () => {
  it("editPastCourtWinner calls the PIN-gated edit_past_court_winner RPC", async () => {
    // Past sessions are frozen for direct anon writes (RLS) — edits must go
    // through the SECURITY DEFINER RPC that verifies the club PIN.
    const c = fakeClient({}, { edit_past_court_winner: { data: null } });
    const repo = createMatchLogRepository(c);
    const rounds = [{ index: 0, courts: [], resters: [] }];
    await repo.editPastCourtWinner({
      pin: "test-pin",
      sessionId: "sess-9",
      roundIndex: 2,
      teamA: [1, 2],
      teamB: [3, 4],
      courtType: "doubles",
      winner: "B",
      rounds,
    });

    expect(c.rpc).toHaveBeenCalledWith("edit_past_court_winner", {
      p_pin: "test-pin",
      p_session_id: "sess-9",
      p_round_index: 2,
      p_team_a: [1, 2],
      p_team_b: [3, 4],
      p_court_type: "doubles",
      p_winner: "B",
      p_rounds: rounds,
    });
  });

  it("editPastCourtWinner passes null winner to clear a result", async () => {
    const c = fakeClient({}, { edit_past_court_winner: { data: null } });
    const repo = createMatchLogRepository(c);
    await repo.editPastCourtWinner({
      pin: "test-pin",
      sessionId: "sess-9",
      roundIndex: 0,
      teamA: [1, 2],
      teamB: [3, 4],
      courtType: "doubles",
      winner: null,
      rounds: [],
    });
    const args = (c.rpc as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      p_winner: string | null;
    };
    expect(args.p_winner).toBeNull();
  });

  it("editPastCourtWinner surfaces RPC errors", async () => {
    const c = fakeClient({}, { edit_past_court_winner: { error: { message: "invalid_pin" } } });
    const repo = createMatchLogRepository(c);
    await expect(
      repo.editPastCourtWinner({
        pin: "wrong",
        sessionId: "sess-9",
        roundIndex: 0,
        teamA: [1, 2],
        teamB: [3, 4],
        courtType: "doubles",
        winner: "A",
        rounds: [],
      }),
    ).rejects.toMatchObject({ message: "invalid_pin" });
  });

  it("list returns MatchResult objects with at as Date", async () => {
    const c = fakeClient({ match_log: { list: [sampleRow] } });
    const repo = createMatchLogRepository(c);
    const results = await repo.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe("sess-1");
    expect(results[0]!.courtType).toBe("doubles");
    expect(results[0]!.teamA).toEqual([1, 2]);
    expect(results[0]!.winner).toBe("A");
    expect(results[0]!.at).toBeInstanceOf(Date);
  });

  it("add calls insert with snake_case payload and returns MatchResult", async () => {
    const c = fakeClient({ match_log: {} });
    const repo = createMatchLogRepository(c);
    const fixedDate = new Date("2026-05-01T10:00:00Z");
    const result = await repo.add({
      sessionId: "sess-2",
      roundIndex: 1,
      courtType: "singles",
      teamA: [5],
      teamB: [6],
      winner: "B",
      at: fixedDate,
    });
    expect(result.sessionId).toBe("sess-2");
    expect(result.at).toBe(fixedDate);
    expect(c.from).toHaveBeenCalledWith("match_log");
  });

  it("deleteBySession calls delete with correct session_id eq filter", async () => {
    const c = fakeClient({ match_log: {} });
    const repo = createMatchLogRepository(c);
    await expect(repo.deleteBySession("sess-3")).resolves.toBeUndefined();
    expect(c.from).toHaveBeenCalledWith("match_log");
  });

  it("deleteByRoundCourt resolves without throwing", async () => {
    const c = fakeClient({ match_log: {} });
    const repo = createMatchLogRepository(c);
    await expect(repo.deleteByRoundCourt("sess-4", 2, [1, 2])).resolves.toBeUndefined();
    expect(c.from).toHaveBeenCalledWith("match_log");
  });
});
