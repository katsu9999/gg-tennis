import type { RoundPlan } from "./models";

export function planRound(n: number, courts: number, allowSingles: boolean): RoundPlan {
  if (n < 2) throw new Error("出席は2人以上必要です (N<2)");
  if (courts < 1) throw new Error("コート数は1以上必要です");

  const maxDoublesCapacity = 4 * courts;

  if (n >= maxDoublesCapacity) {
    return {
      doublesCourts: courts,
      singlesCourts: 0,
      seated: maxDoublesCapacity,
      resters: n - maxDoublesCapacity,
    };
  }

  let seated = n - (n % 2);
  const doublesCourts = Math.floor(seated / 4);
  const remainder = seated - doublesCourts * 4;
  let singlesCourts = remainder === 2 ? 1 : 0;
  if (remainder === 2 && !allowSingles) {
    singlesCourts = 0;
    seated -= 2;
  }
  return { doublesCourts, singlesCourts, seated, resters: n - seated };
}
