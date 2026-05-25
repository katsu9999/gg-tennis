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

  it("ties → deterministic with seed", () => {
    const refs = [1, 2, 3, 4].map(ref);
    const pc = new Map(refs.map(r => [JSON.stringify(r), 1]));
    const a = selectResters(refs, 1, pc, [], mulberry32(42));
    const b = selectResters(refs, 1, pc, [], mulberry32(42));
    expect(a).toEqual(b);
  });
});
