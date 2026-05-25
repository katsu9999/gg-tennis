import type { RoundPlan } from "./models";

/**
 * Distribute N attendees across `courts` available courts.
 *
 * Goal: maximise the number of courts actually in play, since the user picks
 * `courts` based on the number of physical courts they reserved. Falling back
 * to fewer courts when more attendees could play singles is wasteful (the
 * unused court sits empty while extra people rest).
 *
 * Strategy when `allowSingles=true`:
 *   1. If everyone fits as full doubles (N >= 4 × courts), fill all with
 *      doubles and rest the overflow.
 *   2. Otherwise, fill doubles courts only while doing so still leaves enough
 *      people to put at least one singles pair on each remaining court.
 *   3. Fill remaining courts with singles. Any leftover odd person rests.
 *
 * Strategy when `allowSingles=false`:
 *   The legacy behaviour: pack people into as many doubles courts as fit,
 *   everyone else rests.
 */
export function planRound(n: number, courts: number, allowSingles: boolean): RoundPlan {
  if (n < 2) throw new Error("出席は2人以上必要です (N<2)");
  if (courts < 1) throw new Error("コート数は1以上必要です");

  const maxDoublesCapacity = 4 * courts;

  // Full doubles for everyone — same in both modes.
  if (n >= maxDoublesCapacity) {
    return {
      doublesCourts: courts,
      singlesCourts: 0,
      seated: maxDoublesCapacity,
      resters: n - maxDoublesCapacity,
    };
  }

  if (!allowSingles) {
    // Pure-doubles mode: pack people into the largest number of full doubles
    // courts that fit, rest the rest.
    const doublesCourts = Math.floor(n / 4);
    const seated = doublesCourts * 4;
    return { doublesCourts, singlesCourts: 0, seated, resters: n - seated };
  }

  // Maximise courts in use. Can never use more courts than we have pairs.
  const usableCourts = Math.min(courts, Math.floor(n / 2));

  let remaining = n;
  let remainingCourts = usableCourts;
  let doublesCourts = 0;

  // Take a doubles court only while the leftover people can still cover every
  // remaining court with at least a singles pair (2 per court).
  while (
    remaining >= 4 &&
    remainingCourts > 0 &&
    remaining - 4 >= (remainingCourts - 1) * 2
  ) {
    doublesCourts += 1;
    remaining -= 4;
    remainingCourts -= 1;
  }

  // Fill the rest with singles.
  let singlesCourts = 0;
  while (remaining >= 2 && remainingCourts > 0) {
    singlesCourts += 1;
    remaining -= 2;
    remainingCourts -= 1;
  }

  const seated = doublesCourts * 4 + singlesCourts * 2;
  return { doublesCourts, singlesCourts, seated, resters: n - seated };
}
