import { describe, expect, it } from "vitest";
import { buildRound, scoreCourts } from "@/engine/round-builder";
import { mulberry32 } from "@/engine/rng";
import type { AttendeeRef, PairHistory } from "@/engine/models";
import { pairKey } from "@/engine/models";

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });

const emptyHist = (): PairHistory => ({ partnerW: new Map(), opponentW: new Map() });

describe("buildRound (§6.3)", () => {
  it("produces correct shape: D doubles + S singles, no leftover", () => {
    const seated = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ref);
    const r = buildRound(seated, 2, 1, emptyHist(), { partner: new Map(), opp: new Map() }, mulberry32(1));
    expect(r.courts).toHaveLength(3);
    const doubles = r.courts.filter(c => c.type === "doubles");
    const singles = r.courts.filter(c => c.type === "singles");
    expect(doubles).toHaveLength(2);
    expect(singles).toHaveLength(1);
    const used = r.courts.flatMap(c => [...c.teamA, ...c.teamB]);
    expect(used).toHaveLength(10);
  });

  it("avoids same-session repeats when alternatives exist", () => {
    const seated = [1, 2, 3, 4, 5, 6, 7, 8].map(ref);
    const sameSession = {
      partner: new Map<string, number>([[pairKey(1, 2), 5]]),
      opp: new Map<string, number>(),
    };
    const r = buildRound(seated, 2, 0, emptyHist(), sameSession, mulberry32(11));
    const partnered12 = r.courts.some(
      c =>
        c.type === "doubles" &&
        ((c.teamA.find(x => x.kind === "member" && x.memberId === 1) && c.teamA.find(x => x.kind === "member" && x.memberId === 2)) ||
          (c.teamB.find(x => x.kind === "member" && x.memberId === 1) && c.teamB.find(x => x.kind === "member" && x.memberId === 2))),
    );
    expect(partnered12).toBe(false);
  });

  it("is deterministic with same seed and history", () => {
    const seated = [1, 2, 3, 4, 5, 6, 7, 8].map(ref);
    const a = buildRound(seated, 2, 0, emptyHist(), { partner: new Map(), opp: new Map() }, mulberry32(99));
    const b = buildRound(seated, 2, 0, emptyHist(), { partner: new Map(), opp: new Map() }, mulberry32(99));
    expect(a).toEqual(b);
  });

  it("scoreCourts returns 0 with no history", () => {
    const seated = [1, 2, 3, 4].map(ref);
    const r = buildRound(seated, 1, 0, emptyHist(), { partner: new Map(), opp: new Map() }, mulberry32(5));
    expect(scoreCourts(r.courts, emptyHist(), { partner: new Map(), opp: new Map() })).toBe(0);
  });
});
