import type { Gender } from "./models";

export type RuleStrength = "weak" | "mid" | "strong";

/** Snapshot of the shuffle rules chosen on the new-session screen.
 *  Persisted to sessions.shuffle_config (jsonb) so resume() and past rows
 *  keep the exact rules the night ran with. */
export interface ShuffleConfig {
  genderBalance: boolean;
  genderStrength: RuleStrength;
  pairStrength: RuleStrength;
  oppStrength: RuleStrength;
}

export const DEFAULT_SHUFFLE_CONFIG: ShuffleConfig = {
  genderBalance: false,
  genderStrength: "mid",
  pairStrength: "mid",
  oppStrength: "mid",
};

// Gender-gap penalty per matchup: gap = |males(teamA) - males(teamB)|.
// gap 2 (女女 vs 男男) must effectively never happen when avoidable, so it has
// to dominate every same-session variety weight a swap could save
// (SAME_SESSION=30/pair). gap 1 (女女 vs 男女) is a soft nudge below a single
// partner repeat. Numbers validated by the simulation in
// tests/engine/gender-sim.test.ts.
export const GENDER_GAP2: Record<RuleStrength, number> = { weak: 120, mid: 250, strong: 1000 };
export const GENDER_GAP1: Record<RuleStrength, number> = { weak: 10, mid: 40, strong: 160 };

// Multiplier applied to the same-session pair / opponent weights (axes ③④).
export const STRENGTH_MULT: Record<RuleStrength, number> = { weak: 0.5, mid: 1, strong: 2 };

const STRENGTHS: readonly RuleStrength[] = ["weak", "mid", "strong"];

function asStrength(v: unknown, fallback: RuleStrength): RuleStrength {
  return STRENGTHS.includes(v as RuleStrength) ? (v as RuleStrength) : fallback;
}

/** Coerce persisted JSON (old session rows, localStorage) into a valid config. */
export function normalizeShuffleConfig(v: unknown): ShuffleConfig {
  if (typeof v !== "object" || v === null) return { ...DEFAULT_SHUFFLE_CONFIG };
  const o = v as Record<string, unknown>;
  return {
    genderBalance: o.genderBalance === true,
    genderStrength: asStrength(o.genderStrength, DEFAULT_SHUFFLE_CONFIG.genderStrength),
    pairStrength: asStrength(o.pairStrength, DEFAULT_SHUFFLE_CONFIG.pairStrength),
    oppStrength: asStrength(o.oppStrength, DEFAULT_SHUFFLE_CONFIG.oppStrength),
  };
}

/** Genders visible to the round builder are keyed by JSON.stringify(ref). */
export type GenderMap = ReadonlyMap<string, Gender>;
