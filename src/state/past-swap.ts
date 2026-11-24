import type { AttendeeRef, Round } from "@/engine/models";
import { memberIdsFrom } from "@/engine/models";
import { findOnCourt, substituteInRound } from "@/engine/substitute";
import type { MatchLogRepository } from "@/data/match-log-repository";

/**
 * 終わったセッションで、ある試合に出ていた人を別の人に入れ替える。
 *
 * 2026-11-21: R4 の途中でまんぎょくさんが帰り、野原さんが代わりに出て勝った。
 * 記録上はまんぎょくさんが勝ったことになっていたので、後から直せるようにする。
 * 勝敗はそのまま、代わりに出た人に付く。代わりの人がそのラウンドで休憩なら、
 * 入れ替えられた人が休憩に回る（ただの入れ替え）。
 *
 * 過去セッションは RLS で直接書けないので、PIN 付きの edit_past_court_winner RPC を使う。
 * この RPC は「そのラウンドで team_a が一致する match_log 行」を消してから入れ直すので、
 * team_a 側の人を入れ替えるときは、先に古い team_a で消してから新しい team_a で入れる。
 *
 * 2回に分かれるので、1回目は rounds を**元のまま**書く。2回目が落ちても画面と DB は
 * 入れ替え前のままで（記録だけ一時的に無い）、同じ入れ替えをやり直せば揃う。
 * 1回目で新しい rounds を書くと、落ちたときに入れ替え済みに見えてやり直す口が無くなる。
 */
export async function swapPastPlayer(
  repo: Pick<MatchLogRepository, "editPastCourtWinner">,
  args: {
    pin: string;
    sessionId: string;
    rounds: readonly Round[];
    roundIndex: number;
    out: AttendeeRef;
    incoming: AttendeeRef;
  },
): Promise<Round[]> {
  const round = args.rounds[args.roundIndex];
  if (!round) throw new Error(`R${args.roundIndex + 1} が見つかりません。`);
  const pos = findOnCourt(round, args.out);
  if (!pos) throw new Error("入れ替える人がこのラウンドのコートにいません。");

  const patched = substituteInRound(round, args.out, args.incoming, "resters");
  const rounds = args.rounds.map((r, i) => (i === args.roundIndex ? patched : r));

  const before = round.courts.find((c) => c.number === pos.courtNumber)!;
  const after = patched.courts.find((c) => c.number === pos.courtNumber)!;
  const winner = before.winner === "A" || before.winner === "B" ? before.winner : null;
  const newA = memberIdsFrom(after.teamA);
  const newB = memberIdsFrom(after.teamB);
  const recordable = winner !== null && newA.length > 0 && newB.length > 0;

  if (pos.team === "A") {
    // 古い team_a の行を消す（rounds はこの時点で新しいものを書く）
    await repo.editPastCourtWinner({
      pin: args.pin,
      sessionId: args.sessionId,
      roundIndex: args.roundIndex,
      teamA: memberIdsFrom(before.teamA),
      teamB: memberIdsFrom(before.teamB),
      courtType: before.type,
      winner: null,
      rounds: [...args.rounds],
    });
  }
  await repo.editPastCourtWinner({
    pin: args.pin,
    sessionId: args.sessionId,
    roundIndex: args.roundIndex,
    teamA: newA,
    teamB: newB,
    courtType: after.type,
    winner: recordable ? winner : null,
    rounds,
  });
  return rounds;
}
