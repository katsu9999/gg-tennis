import type { AttendeeRef } from "./models";
import type { Rng } from "./rng";
import { shuffle } from "./rng";

const k = (r: AttendeeRef) => JSON.stringify(r);

export function selectResters(
  attendees: readonly AttendeeRef[],
  count: number,
  playCount: ReadonlyMap<string, number>,
  prevResters: readonly AttendeeRef[],
  rng: Rng,
): AttendeeRef[] {
  if (count <= 0) return [];
  const prevSet = new Set(prevResters.map(k));

  const annotated = attendees.map(a => ({
    ref: a,
    play: playCount.get(k(a)) ?? 0,
    prevRested: prevSet.has(k(a)),
  }));

  const tied = shuffle(annotated, rng);

  tied.sort((x, y) => {
    if (y.play !== x.play) return y.play - x.play; // higher play → earlier
    if (x.prevRested !== y.prevRested) return x.prevRested ? 1 : -1; // not-prev-rested earlier
    return 0;
  });

  return tied.slice(0, count).map(t => t.ref);
}
