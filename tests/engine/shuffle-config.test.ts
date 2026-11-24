import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHUFFLE_CONFIG,
  GENDER_GAP1,
  GENDER_GAP2,
  STRENGTH_MULT,
  normalizeShuffleConfig,
} from "@/engine/shuffle-config";

describe("normalizeShuffleConfig", () => {
  it("returns defaults for null/undefined/garbage", () => {
    expect(normalizeShuffleConfig(null)).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig(undefined)).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig("junk")).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig({ genderStrength: "MAX" })).toEqual(DEFAULT_SHUFFLE_CONFIG);
  });

  it("keeps a valid config verbatim", () => {
    const c = {
      genderBalance: true,
      genderStrength: "strong",
      pairStrength: "weak",
      oppStrength: "mid",
      avoidPairs: [[3, 7]],
    };
    expect(normalizeShuffleConfig(c)).toEqual(c);
  });

  it("defaults avoidPairs to [] for configs saved before the rule existed", () => {
    const old = { genderBalance: true, genderStrength: "mid", pairStrength: "mid", oppStrength: "mid" };
    expect(normalizeShuffleConfig(old).avoidPairs).toEqual([]);
  });

  it("cleans avoidPairs: low-first, drops self-pairs, junk and duplicates", () => {
    const c = normalizeShuffleConfig({
      avoidPairs: [[7, 3], [3, 7], [5, 5], [1], ["a", 2], [2.5, 4], "x", [4, 9]],
    });
    expect(c.avoidPairs).toEqual([[3, 7], [4, 9]]);
  });

  it("does not share the DEFAULT object (mutation safety)", () => {
    const a = normalizeShuffleConfig(null);
    a.genderBalance = true;
    expect(DEFAULT_SHUFFLE_CONFIG.genderBalance).toBe(false);
  });
});

describe("strength tables", () => {
  it("gap2 dominates gap1 at every strength", () => {
    for (const s of ["weak", "mid", "strong"] as const) {
      expect(GENDER_GAP2[s]).toBeGreaterThan(GENDER_GAP1[s]);
    }
  });
  it("mult is monotonic", () => {
    expect(STRENGTH_MULT.weak).toBeLessThan(STRENGTH_MULT.mid);
    expect(STRENGTH_MULT.mid).toBeLessThan(STRENGTH_MULT.strong);
  });
});
