import type { AttendeeRef } from "./models";
import type { Rng } from "./rng";
import { shuffle } from "./rng";

const k = (r: AttendeeRef) => JSON.stringify(r);

/**
 * Picks who sits out this round.
 *
 * Primary keys are fairness invariants (unchanged since v1):
 *   1. higher play count rests first
 *   2. whoever rested last round plays this round
 *
 * Tie-break (added for N=11-style nights where the same "never faced each
 * other" complaint kept coming up): among fairness-equal candidates, the
 * player who has already FACED the most distinct opponents this session rests
 * first, keeping under-covered players on court. `metDegree` maps memberId →
 * distinct opponents faced this session; omitting it (or an empty map)
 * reproduces the old behaviour exactly. Guests have no opponent stats and
 * count as 0.
 */
export function selectResters(
  attendees: readonly AttendeeRef[],
  count: number,
  playCount: ReadonlyMap<string, number>,
  prevResters: readonly AttendeeRef[],
  rng: Rng,
  metDegree?: ReadonlyMap<number, number>,
): AttendeeRef[] {
  if (count <= 0) return [];
  const prevSet = new Set(prevResters.map(k));

  const annotated = attendees.map(a => ({
    ref: a,
    play: playCount.get(k(a)) ?? 0,
    prevRested: prevSet.has(k(a)),
    met: a.kind === "member" ? (metDegree?.get(a.memberId) ?? 0) : 0,
  }));

  const tied = shuffle(annotated, rng);

  tied.sort((x, y) => {
    if (y.play !== x.play) return y.play - x.play; // higher play → earlier
    if (x.prevRested !== y.prevRested) return x.prevRested ? 1 : -1; // not-prev-rested earlier
    if (y.met !== x.met) return y.met - x.met; // most-covered rests first
    return 0;
  });

  return tied.slice(0, count).map(t => t.ref);
}
