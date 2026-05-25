import { describe, expect, it } from "vitest";
import { applyRoundToHistory, decayHistory, applyRoundToSameSession, LAMBDA_DEFAULT } from "@/engine/stats";
import { pairKey } from "@/engine/models";
import type { Court, PairHistory } from "@/engine/models";

const ref = (id: number) => ({ kind: "member" as const, memberId: id });

describe("stats (§6.4)", () => {
  it("applyRoundToHistory increments partner and opponent weights", () => {
    const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
    const c: Court = {
      number: 1, type: "doubles",
      teamA: [ref(1), ref(2)], teamB: [ref(3), ref(4)], winner: "none",
    };
    applyRoundToHistory(hist, [c]);
    expect(hist.partnerW.get(pairKey(1, 2))).toBe(1);
    expect(hist.partnerW.get(pairKey(3, 4))).toBe(1);
    expect(hist.opponentW.get(pairKey(1, 3))).toBe(1);
    expect(hist.opponentW.get(pairKey(2, 4))).toBe(1);
  });

  it("decayHistory multiplies all weights by lambda", () => {
    const hist: PairHistory = {
      partnerW: new Map([[pairKey(1, 2), 4]]),
      opponentW: new Map([[pairKey(1, 3), 2]]),
    };
    decayHistory(hist, 0.5);
    expect(hist.partnerW.get(pairKey(1, 2))).toBeCloseTo(2);
    expect(hist.opponentW.get(pairKey(1, 3))).toBeCloseTo(1);
  });

  it("default LAMBDA is 0.7", () => {
    expect(LAMBDA_DEFAULT).toBe(0.7);
  });

  it("applyRoundToSameSession accumulates per-session pairs", () => {
    const ss = { partner: new Map<string, number>(), opp: new Map<string, number>() };
    const c: Court = { number: 1, type: "doubles", teamA: [ref(1), ref(2)], teamB: [ref(3), ref(4)], winner: "none" };
    applyRoundToSameSession(ss, [c]);
    applyRoundToSameSession(ss, [c]);
    expect(ss.partner.get(pairKey(1, 2))).toBe(2);
    expect(ss.opp.get(pairKey(1, 3))).toBe(2);
  });
});
