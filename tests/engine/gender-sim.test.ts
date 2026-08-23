/**
 * Statistical simulation of the gender-balance rule over full 6-round nights
 * using the real engine pipeline (planRound → selectResters → buildRound).
 *
 * CI runs a fast 60-trial pass; for tuning run:
 *   SIM_TRIALS=500 npx vitest run tests/engine/gender-sim.test.ts
 * To measure a different strength (assertions still assume mid-or-stronger):
 *   SIM_GENDER_STRENGTH=weak SIM_TRIALS=500 npx vitest run tests/engine/gender-sim.test.ts
 */
import { describe, expect, it } from "vitest";
import type { AttendeeRef, Gender, PairHistory, SameSessionStats } from "@/engine/models";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import { applyRoundToHistory, applyRoundToSameSession } from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import { DEFAULT_SHUFFLE_CONFIG, type ShuffleConfig } from "@/engine/shuffle-config";

const TRIALS = Number(process.env.SIM_TRIALS ?? 60);
const ROUNDS = 6;

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
const key = (r: AttendeeRef) => JSON.stringify(r);

interface Scenario {
  name: string;
  females: number;
  males: number;
  courts: number;
}
const SCENARIOS: Scenario[] = [
  { name: "4F4M-2courts", females: 4, males: 4, courts: 2 },
  { name: "2F8M-3courts", females: 2, males: 8, courts: 3 },
  { name: "5F6M-3courts", females: 5, males: 6, courts: 3 },
];

interface Metrics {
  gap2PerTrial: number; // 女女 vs 男男 matchups per night (avg)
  gap1PerTrial: number;
  maxPartnerRepeat: number; // worst same-session partner count over all trials
  restSpread: number; // worst (max-min) rest count over all trials
}

function runNight(
  sc: Scenario,
  config: ShuffleConfig,
  seed: number,
): { gap2: number; gap1: number; partnerRepeatMax: number; restSpread: number } {
  const refs = [
    // id 1..females = female / 101.. = male
    ...Array.from({ length: sc.females }, (_, i) => ref(i + 1)),
    ...Array.from({ length: sc.males }, (_, i) => ref(100 + i + 1)),
  ];
  const genderOf = new Map<string, Gender>(
    refs.map(r => [key(r), r.kind === "member" && r.memberId < 100 ? "female" : "male"]),
  );
  const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
  const ss: SameSessionStats = { partner: new Map(), opp: new Map() };
  const stats = new Map<string, { play: number; rest: number; singles: number }>(
    refs.map(r => [key(r), { play: 0, rest: 0, singles: 0 }]),
  );
  let prevResters: AttendeeRef[] = [];
  let prevSingles = new Set<string>();
  let gap2 = 0;
  let gap1 = 0;

  for (let r = 0; r < ROUNDS; r++) {
    const rng = mulberry32(seed * 1000 + r);
    const plan = planRound(refs.length, sc.courts, true);
    const playMap = new Map([...stats].map(([k, v]) => [k, v.play] as const));
    const resters = selectResters(refs, plan.resters, playMap, prevResters, rng);
    const resterSet = new Set(resters.map(key));
    const seated = refs.filter(x => !resterSet.has(key(x)));
    const singlesCount = new Map([...stats].map(([k, v]) => [k, v.singles] as const));
    const { courts } = buildRound(
      seated,
      plan.doublesCourts,
      plan.singlesCourts,
      hist,
      ss,
      rng,
      singlesCount,
      prevSingles,
      { genderOf, config },
    );

    for (const c of courts) {
      const males = (team: readonly AttendeeRef[]) =>
        team.filter(p => genderOf.get(key(p)) === "male").length;
      const gap = Math.abs(males(c.teamA) - males(c.teamB));
      if (gap >= 2) gap2++;
      else if (gap === 1) gap1++;
      for (const p of [...c.teamA, ...c.teamB]) {
        const st = stats.get(key(p))!;
        st.play++;
        if (c.type === "singles") st.singles++;
      }
    }
    for (const p of resters) stats.get(key(p))!.rest++;
    prevSingles = new Set(
      courts.filter(c => c.type === "singles").flatMap(c => [...c.teamA, ...c.teamB]).map(key),
    );
    prevResters = resters;
    applyRoundToHistory(hist, courts);
    applyRoundToSameSession(ss, courts);
  }

  const partnerRepeatMax = Math.max(0, ...ss.partner.values());
  const rests = [...stats.values()].map(v => v.rest);
  return { gap2, gap1, partnerRepeatMax, restSpread: Math.max(...rests) - Math.min(...rests) };
}

function simulate(sc: Scenario, config: ShuffleConfig): Metrics {
  let gap2 = 0;
  let gap1 = 0;
  let repeat = 0;
  let spread = 0;
  for (let t = 0; t < TRIALS; t++) {
    const r = runNight(sc, config, t + 1);
    gap2 += r.gap2;
    gap1 += r.gap1;
    repeat = Math.max(repeat, r.partnerRepeatMax);
    spread = Math.max(spread, r.restSpread);
  }
  return {
    gap2PerTrial: gap2 / TRIALS,
    gap1PerTrial: gap1 / TRIALS,
    maxPartnerRepeat: repeat,
    restSpread: spread,
  };
}

describe(`gender-balance simulation (${TRIALS} trials, ${ROUNDS} rounds)`, () => {
  const strength = (process.env.SIM_GENDER_STRENGTH ?? "mid") as ShuffleConfig["genderStrength"];
  const ON: ShuffleConfig = { ...DEFAULT_SHUFFLE_CONFIG, genderBalance: true, genderStrength: strength };

  for (const sc of SCENARIOS) {
    it(`${sc.name}: mid strength kills gap-2 and keeps rest fairness`, () => {
      const off = simulate(sc, DEFAULT_SHUFFLE_CONFIG);
      const on = simulate(sc, ON);
      // eslint-disable-next-line no-console
      console.table({ [`${sc.name} OFF`]: off, [`${sc.name} ON`]: on });
      expect(on.gap2PerTrial).toBe(0); // 女女 vs 男男は出ない
      expect(on.restSpread).toBeLessThanOrEqual(1); // 休みの公平は不変
      // weak deliberately tolerates gap-1 (女女 vs 男女) to protect variety.
      if (strength !== "weak") {
        expect(on.gap1PerTrial).toBeLessThanOrEqual(off.gap1PerTrial); // 悪化しない
      }
    });
  }
});
