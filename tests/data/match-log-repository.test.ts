import { describe, expect, it } from "vitest";
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
});
