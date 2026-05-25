import { describe, expect, it } from "vitest";
import { mulberry32, shuffle } from "@/engine/rng";

describe("rng", () => {
  it("same seed produces same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("shuffle is a permutation", () => {
    const rng = mulberry32(7);
    const out = shuffle([1, 2, 3, 4, 5], rng);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("shuffle is deterministic for a fixed seed", () => {
    const a = shuffle([1, 2, 3, 4, 5], mulberry32(99));
    const b = shuffle([1, 2, 3, 4, 5], mulberry32(99));
    expect(a).toEqual(b);
  });
});
