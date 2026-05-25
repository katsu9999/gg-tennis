import { describe, expect, it, vi } from "vitest";
import { fakeClient } from "./test-helpers";
import { createHistoryRepository } from "@/data/history-repository";

describe("HistoryRepository", () => {
  it("loadPairHistory returns empty maps when table is empty", async () => {
    const c = fakeClient({ pair_history: {} });
    const repo = createHistoryRepository(c);
    const history = await repo.loadPairHistory();
    expect(history.partnerW.size).toBe(0);
    expect(history.opponentW.size).toBe(0);
  });

  it("loadPairHistory maps rows into canonical-key Maps", async () => {
    const c = fakeClient({
      pair_history: {
        list: [
          { member_a: 1, member_b: 2, partner_w: 3.5, opponent_w: 1.2 },
          { member_a: 3, member_b: 7, partner_w: 0.7, opponent_w: 2.1 },
        ],
      },
    });
    const repo = createHistoryRepository(c);
    const h = await repo.loadPairHistory();
    expect(h.partnerW.get("1:2")).toBeCloseTo(3.5);
    expect(h.partnerW.get("3:7")).toBeCloseTo(0.7);
    expect(h.opponentW.get("1:2")).toBeCloseTo(1.2);
    expect(h.opponentW.get("3:7")).toBeCloseTo(2.1);
  });

  it("upsertPairWeights enforces member_a < member_b ordering", async () => {
    const upsertMock = vi.fn().mockReturnValue({ then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) });
    const selectMock = vi.fn().mockReturnValue({ then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock, upsert: upsertMock });
    const c = { from: fromMock } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const repo = createHistoryRepository(c);
    // Pass a > b intentionally — repo should swap them
    await repo.upsertPairWeights([{ a: 5, b: 2, partnerW: 1.5, opponentW: 0.8 }]);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ member_a: 2, member_b: 5, partner_w: 1.5, opponent_w: 0.8 }),
      ])
    );
  });

  it("upsertPairWeights is a no-op when updates array is empty", async () => {
    const c = fakeClient({ pair_history: {} });
    const repo = createHistoryRepository(c);
    // Should not throw
    await expect(repo.upsertPairWeights([])).resolves.toBeUndefined();
  });

  it("decayAll is a no-op when pair_history is empty", async () => {
    const c = fakeClient({ pair_history: {} });
    const repo = createHistoryRepository(c);
    // Should not throw; empty table → early return before second upsert
    await expect(repo.decayAll(0.5)).resolves.toBeUndefined();
  });
});
