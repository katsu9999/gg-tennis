import { describe, expect, it } from "vitest";
import { selectResters } from "@/engine/rester-selector";
import type { AttendeeRef } from "@/engine/models";
import { mulberry32 } from "@/engine/rng";

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });

describe("selectResters (§6.2)", () => {
  it("returns the requested count", () => {
    const refs = [1, 2, 3, 4, 5].map(ref);
    const playCount = new Map(refs.map(r => [JSON.stringify(r), 0]));
    const out = selectResters(refs, 2, playCount, [], mulberry32(1));
    expect(out).toHaveLength(2);
  });

  it("prefers attendees with higher playCount (most-played rest)", () => {
    const refs = [1, 2, 3, 4].map(ref);
    const playCount = new Map([
      [JSON.stringify(ref(1)), 3],
      [JSON.stringify(ref(2)), 1],
      [JSON.stringify(ref(3)), 1],
      [JSON.stringify(ref(4)), 1],
    ]);
    const out = selectResters(refs, 1, playCount, [], mulberry32(1));
    expect(out).toEqual([ref(1)]);
  });

  it("avoids back-to-back rest when possible", () => {
    const refs = [1, 2, 3, 4].map(ref);
    const playCount = new Map([
      [JSON.stringify(ref(1)), 2],
      [JSON.stringify(ref(2)), 2],
      [JSON.stringify(ref(3)), 2],
      [JSON.stringify(ref(4)), 2],
    ]);
    const prev = [ref(1)];
    const out = selectResters(refs, 1, playCount, prev, mulberry32(1));
    expect(out).not.toEqual([ref(1)]);
  });

  it("breaks fairness ties by session coverage: most-met player rests first", () => {
    const refs = [1, 2, 3, 4].map(ref);
    // Everyone equal on play count and none rested last round → pure tie.
    const pc = new Map(refs.map(r => [JSON.stringify(r), 1]));
    // Player 3 has already faced the most distinct opponents.
    const met = new Map([
      [1, 4],
      [2, 5],
      [3, 9],
      [4, 5],
    ]);
    for (let seed = 0; seed < 10; seed++) {
      const out = selectResters(refs, 1, pc, [], mulberry32(seed), met);
      expect(out).toEqual([ref(3)]);
    }
  });

  it("coverage tie-break never overrides play-count fairness", () => {
    const refs = [1, 2, 3, 4].map(ref);
    const pc = new Map([
      [JSON.stringify(ref(1)), 3], // most played → must rest regardless of met
      [JSON.stringify(ref(2)), 1],
      [JSON.stringify(ref(3)), 1],
      [JSON.stringify(ref(4)), 1],
    ]);
    const met = new Map([
      [1, 0], // least covered, but fairness wins
      [2, 9],
      [3, 9],
      [4, 9],
    ]);
    const out = selectResters(refs, 1, pc, [], mulberry32(1), met);
    expect(out).toEqual([ref(1)]);
  });

  it("omitting metDegree keeps the legacy behaviour (same output as before)", () => {
    const refs = [1, 2, 3, 4, 5].map(ref);
    const pc = new Map(refs.map(r => [JSON.stringify(r), 1]));
    const withEmpty = selectResters(refs, 2, pc, [], mulberry32(7), new Map());
    const without = selectResters(refs, 2, pc, [], mulberry32(7));
    expect(withEmpty).toEqual(without);
  });

  it("ties → deterministic with seed", () => {
    const refs = [1, 2, 3, 4].map(ref);
    const pc = new Map(refs.map(r => [JSON.stringify(r), 1]));
    const a = selectResters(refs, 1, pc, [], mulberry32(42));
    const b = selectResters(refs, 1, pc, [], mulberry32(42));
    expect(a).toEqual(b);
  });
});
