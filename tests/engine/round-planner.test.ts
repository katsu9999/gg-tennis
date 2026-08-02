import { describe, expect, it } from "vitest";
import { planRound } from "@/engine/round-planner";

describe("planRound (§6.1)", () => {
  it("rejects N < 2", () => {
    expect(() => planRound(1, 2, true)).toThrow(/2人以上|N<2/);
  });

  it.each([
    // [N, C, allowSingles, doubles, singles, seated, resters]
    [6, 2, true, 1, 1, 6, 0],
    [10, 3, true, 2, 1, 10, 0],
    [11, 3, true, 2, 1, 10, 1],
    [12, 3, true, 3, 0, 12, 0],
    [4, 1, true, 1, 0, 4, 0],
    [3, 1, true, 0, 1, 2, 1],
    [2, 1, true, 0, 1, 2, 0],
    // 2026-07-12: doubles-preferred — minimise singles courts, not maximise
    // court usage. At most one singles court ever; a court may sit idle.
    [6, 3, true, 1, 1, 6, 0],   // 6 people, 3 courts → 1D + 1S (was 3 singles)
    [8, 3, true, 2, 0, 8, 0],   // 8 people, 3 courts → 2D, 1 court idle (was 1D+2S)
    [6, 4, true, 1, 1, 6, 0],   // 6 people, 4 courts → 1D + 1S
    [5, 3, true, 1, 0, 4, 1],   // 5 people, 3 courts → 1D, 1 rests (was 2 singles)
    [7, 3, true, 1, 1, 6, 1],   // 7 people, 3 courts → 1D + 1S, 1 rests (was 3 singles)
    [14, 4, true, 3, 1, 14, 0], // 14 people, 4 courts → 3D + 1S, all play
  ])(
    "N=%i C=%i singles=%s → D=%i S=%i seated=%i resters=%i",
    (n, c, allow, d, s, seat, rest) => {
      const p = planRound(n as number, c as number, allow as boolean);
      expect(p.doublesCourts).toBe(d);
      expect(p.singlesCourts).toBe(s);
      expect(p.seated).toBe(seat);
      expect(p.resters).toBe(rest);
    }
  );

  it("seated + resters == N (invariant)", () => {
    for (let n = 2; n <= 24; n++) {
      for (let c = 1; c <= 6; c++) {
        const p = planRound(n, c, true);
        expect(p.seated + p.resters).toBe(n);
        expect(p.doublesCourts + p.singlesCourts).toBeLessThanOrEqual(c);
      }
    }
  });

  it("is doubles-preferred: never more than one singles court", () => {
    // The club dislikes singles, so at most one singles court is ever planned
    // (the even remainder after packing full doubles courts).
    for (let n = 2; n <= 24; n++) {
      for (let c = 1; c <= 6; c++) {
        const p = planRound(n, c, true);
        expect(p.singlesCourts).toBeLessThanOrEqual(1);
      }
    }
  });

  it("seats as many people as possible (minimises resters)", () => {
    // Priority 1: fewest resters. Seat min(N, 4*courts) rounded down to even.
    for (let n = 2; n <= 24; n++) {
      for (let c = 1; c <= 6; c++) {
        const p = planRound(n, c, true);
        const cap = Math.min(n, 4 * c);
        const expectedSeated = cap - (cap % 2);
        expect(p.seated).toBe(expectedSeated);
      }
    }
  });

  it("disabling singles pushes remainder into resters", () => {
    const p = planRound(6, 2, false);
    expect(p.doublesCourts).toBe(1);
    expect(p.singlesCourts).toBe(0);
    expect(p.seated).toBe(4);
    expect(p.resters).toBe(2);
  });

  it("caps at doubles capacity when N is large", () => {
    const p = planRound(20, 3, true);
    expect(p.doublesCourts).toBe(3);
    expect(p.singlesCourts).toBe(0);
    expect(p.seated).toBe(12);
    expect(p.resters).toBe(8);
  });
});
