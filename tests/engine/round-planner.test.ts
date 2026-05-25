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
