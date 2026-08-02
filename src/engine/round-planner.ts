import type { RoundPlan } from "./models";

/**
 * Distribute N attendees across `courts` available courts.
 *
 * Goal (doubles-preferred, 2026-07-12): the club dislikes singles, so we
 * minimise the number of singles courts rather than maximising court usage.
 * Priority order when `allowSingles=true`:
 *   1. Seat as many people as possible (fewest resters). The most people
 *      `courts` courts can hold is 4 × courts; seat min(N, that), rounded down
 *      to an even number (an odd leftover person rests).
 *   2. Among the seated, use the fewest singles courts — i.e. pack as many full
 *      doubles courts as the seated count allows, and only the even remainder
 *      (0 or 2 people) goes on a single singles court.
 * This can leave a reserved court empty (e.g. 8 people / 3 courts → 2 doubles,
 * 1 court idle) — an intentional trade-off: the club prefers doubles over
 * filling every court with singles.
 *
 * Strategy when `allowSingles=false`:
 *   The legacy behaviour: pack people into as many doubles courts as fit,
 *   everyone else rests.
 */
export function planRound(n: number, courts: number, allowSingles: boolean): RoundPlan {
  if (n < 2) throw new Error("出席は2人以上必要です (N<2)");
  if (courts < 1) throw new Error("コート数は1以上必要です");

  if (!allowSingles) {
    // Pure-doubles mode: pack people into the largest number of full doubles
    // courts that fit (capped by court count), rest the rest.
    const doublesCourts = Math.min(courts, Math.floor(n / 4));
    const seated = doublesCourts * 4;
    return { doublesCourts, singlesCourts: 0, seated, resters: n - seated };
  }

  // 1. Seat as many as possible; an odd leftover person rests.
  const capacity = 4 * courts;
  let seated = Math.min(n, capacity);
  if (seated % 2 === 1) seated -= 1;

  // 2. Maximise doubles among the seated; the even remainder (0 or 2) is singles.
  const doublesCourts = Math.floor(seated / 4);
  const singlesCourts = (seated - 4 * doublesCourts) / 2;

  return { doublesCourts, singlesCourts, seated, resters: n - seated };
}
