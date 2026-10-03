import { describe, expect, it } from "vitest";
import { buildRound } from "@/engine/round-builder";
import { mulberry32 } from "@/engine/rng";
import type { AttendeeRef, Court, Gender, PairHistory, SameSessionStats } from "@/engine/models";
import { memberIdsFrom, pairKey } from "@/engine/models";
import { DEFAULT_SHUFFLE_CONFIG, type ShuffleConfig } from "@/engine/shuffle-config";

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
const emptyHist = (): PairHistory => ({ partnerW: new Map(), opponentW: new Map() });
const emptySS = (): SameSessionStats => ({ partner: new Map(), opp: new Map(), quad: new Map() });

const sameCourt = (courts: readonly Court[], a: number, b: number): boolean =>
  courts.some((c) => {
    const ids = memberIdsFrom([...c.teamA, ...c.teamB]);
    return ids.includes(a) && ids.includes(b);
  });

const cfg = (avoidPairs: [number, number][], extra: Partial<ShuffleConfig> = {}): ShuffleConfig => ({
  ...DEFAULT_SHUFFLE_CONFIG,
  ...extra,
  avoidPairs,
});

describe("avoidPairs (keep two members off the same court)", () => {
  it("never puts the pair on one court when they can be separated", () => {
    const seated = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ref);
    for (let seed = 1; seed <= 60; seed++) {
      const { courts } = buildRound(
        seated, 2, 1, emptyHist(), emptySS(), mulberry32(seed),
        new Map(), new Set(), { config: cfg([[1, 2]]) },
      );
      expect(sameCourt(courts, 1, 2)).toBe(false);
    }
  });

  it("covers opponents and singles, not just partners", () => {
    // Without the rule, history pushes 1 and 2 onto the singles court together.
    const seated = [1, 2, 3, 4, 5, 6].map(ref);
    const ss = emptySS();
    for (const [a, b] of [[1, 3], [1, 4], [1, 5], [1, 6], [2, 3], [2, 4], [2, 5], [2, 6]] as const) {
      ss.partner.set(pairKey(a, b), 1);
    }
    for (let seed = 1; seed <= 30; seed++) {
      const { courts } = buildRound(
        seated, 1, 1, emptyHist(), ss, mulberry32(seed),
        new Map(), new Set(), { config: cfg([[1, 2]]) },
      );
      expect(sameCourt(courts, 1, 2)).toBe(false);
    }
  });

  it("outranks gender balance and same-session repeats", () => {
    // 1,2 female; 3..8 male. Separating 1 and 2 forces a 女+男 team on each
    // court — fine — but also forces partner repeats we've pre-loaded.
    const seated = [1, 2, 3, 4, 5, 6, 7, 8].map(ref);
    const genderOf = new Map<string, Gender>(
      seated.map((r) => [JSON.stringify(r), (r as { memberId: number }).memberId <= 2 ? "female" : "male"]),
    );
    const ss = emptySS();
    for (let a = 1; a <= 8; a++) for (let b = a + 1; b <= 8; b++) if (!(a === 1 && b === 2)) ss.partner.set(pairKey(a, b), 1);
    for (let seed = 1; seed <= 30; seed++) {
      const { courts } = buildRound(
        seated, 2, 0, emptyHist(), ss, mulberry32(seed),
        new Map(), new Set(), { genderOf, config: cfg([[1, 2]], { genderBalance: true, genderStrength: "strong" }) },
      );
      expect(sameCourt(courts, 1, 2)).toBe(false);
    }
  });

  it("still builds a round when separation is impossible (one court of four)", () => {
    const seated = [1, 2, 3, 4].map(ref);
    const { courts } = buildRound(
      seated, 1, 0, emptyHist(), emptySS(), mulberry32(1),
      new Map(), new Set(), { config: cfg([[1, 2]]) },
    );
    expect(courts).toHaveLength(1);
    expect(sameCourt(courts, 1, 2)).toBe(true);
  });

  it("ignores pairs whose members aren't here tonight", () => {
    const seated = [1, 2, 3, 4, 5, 6, 7, 8].map(ref);
    const { courts } = buildRound(
      seated, 2, 0, emptyHist(), emptySS(), mulberry32(3),
      new Map(), new Set(), { config: cfg([[1, 99]]) },
    );
    expect(courts.flatMap((c) => [...c.teamA, ...c.teamB])).toHaveLength(8);
  });
});
