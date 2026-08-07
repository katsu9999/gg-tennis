import type { AttendeeRef } from "@/engine/models";
import type { InMemorySession } from "@/state/session-store";
import type { LineRoundPayload, LineSummaryPayload } from "@/data/line-notify-client";
import { sendLineNotify, sendLineSummary } from "@/data/line-notify-client";
import { appDialog } from "@/ui/components/app-dialog";
import { t } from "@/ui/i18n";
import { IS_LOCAL } from "@/flavor";
import { sessionStore, rosterStore } from "@/ui/stores";

/** Circled digit for a todayNumber (①..㊿); parenthesised fallback beyond 50.
 *  On court everyone identifies by their assigned number, so the LINE message
 *  pairs number + name. */
function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${n})`;
}

/** Build the Edge Function payload for the session's current round, with
 *  attendee refs resolved to "④名前" (todayNumber + display name). Exported
 *  for tests. */
export function buildRoundPayload(
  s: InMemorySession,
  memberNames: Map<number, string>,
): LineRoundPayload | null {
  const round = s.rounds[s.currentRoundIndex];
  if (!round) return null;

  const guestNames = new Map<string, string>();
  const todayNumbers = new Map<string, number>();
  for (const a of s.attendees) {
    const key = JSON.stringify(a.ref);
    todayNumbers.set(key, a.todayNumber);
    if (a.isGuest && a.guestName) guestNames.set(key, a.guestName);
  }
  const label = (ref: AttendeeRef): string => {
    const key = JSON.stringify(ref);
    const name =
      ref.kind === "member"
        ? (memberNames.get(ref.memberId) ?? `#${ref.memberId}`)
        : (guestNames.get(key) ?? "Guest");
    const num = todayNumbers.get(key);
    return num === undefined ? name : `${circled(num)}${name}`;
  };

  return {
    roundNo: s.currentRoundIndex + 1,
    courts: round.courts.map((c) => ({
      number: c.number,
      type: c.type,
      teamA: c.teamA.map(label),
      teamB: c.teamB.map(label),
    })),
    resters: round.resters.map(label),
  };
}

/** Build the end-of-session standings payload.
 *
 *  Wins are not tracked anywhere else — todayStats only counts play/rest/
 *  singles — so count them from the rounds. Courts with no recorded winner
 *  ("none") are skipped rather than guessed at. Everyone who attended is
 *  listed, including people who never won: the message doubles as the
 *  attendance record for the day. Exported for tests.
 */
export function buildSummaryPayload(
  s: Pick<InMemorySession, "rounds" | "attendees">,
  memberNames: Map<number, string>,
): LineSummaryPayload | null {
  if (s.rounds.length === 0) return null;
  // 勝敗が1つも記録されていないセッションは送らない。並べても全員0勝0敗で、
  // 読み手に何も伝わらないうえ「今日は誰も勝たなかった」と誤解される。
  const hasResult = s.rounds.some((r) =>
    r.courts.some((c) => c.winner === "A" || c.winner === "B"));
  if (!hasResult) return null;

  const guestNames = new Map<string, string>();
  const todayNumbers = new Map<string, number>();
  for (const a of s.attendees) {
    const key = JSON.stringify(a.ref);
    todayNumbers.set(key, a.todayNumber);
    if (a.isGuest && a.guestName) guestNames.set(key, a.guestName);
  }
  const label = (ref: AttendeeRef): string => {
    const key = JSON.stringify(ref);
    const name =
      ref.kind === "member"
        ? (memberNames.get(ref.memberId) ?? `#${ref.memberId}`)
        : (guestNames.get(key) ?? "Guest");
    const num = todayNumbers.get(key);
    return num === undefined ? name : `${circled(num)}${name}`;
  };

  const tally = new Map<string, { wins: number; losses: number }>();
  for (const a of s.attendees) tally.set(JSON.stringify(a.ref), { wins: 0, losses: 0 });
  const bump = (ref: AttendeeRef, field: "wins" | "losses"): void => {
    const key = JSON.stringify(ref);
    const row = tally.get(key) ?? { wins: 0, losses: 0 };
    row[field] += 1;
    tally.set(key, row);
  };

  for (const round of s.rounds) {
    for (const c of round.courts) {
      if (c.winner !== "A" && c.winner !== "B") continue;
      const [won, lost] = c.winner === "A" ? [c.teamA, c.teamB] : [c.teamB, c.teamA];
      for (const ref of won) bump(ref, "wins");
      for (const ref of lost) bump(ref, "losses");
    }
  }

  // 勝ち数の多い順。同数なら負けの少ない順、それも同じなら今日の番号順に
  // して、同じ内容なら誰が見ても同じ並びになるようにする。
  const standings = s.attendees
    .map((a) => {
      const row = tally.get(JSON.stringify(a.ref)) ?? { wins: 0, losses: 0 };
      return { label: label(a.ref), wins: row.wins, losses: row.losses,
               todayNumber: a.todayNumber };
    })
    .sort((x, y) =>
      y.wins - x.wins || x.losses - y.losses || x.todayNumber - y.todayNumber)
    .map(({ label: l, wins, losses }) => ({ label: l, wins, losses }));

  return {
    kind: "summary",
    rounds: s.rounds.length,
    attendees: s.attendees.length,
    standings,
  };
}

/**
 * After a NEW round was generated: ask the host whether to push the
 * assignments to the club's LINE group, and send on OK. Never throws —
 * a failed push must not disturb the round flow (alert only).
 *
 * GG flavour only; the local (device-only) build has no backend, so this is
 * a no-op there (IS_LOCAL is const-folded, dropping the call at build time).
 */
export async function offerLineNotify(): Promise<void> {
  if (IS_LOCAL) return;
  const s = sessionStore.session.value;
  if (!s) return;
  const memberNames = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));
  const payload = buildRoundPayload(s, memberNames);
  if (!payload) return;

  if (!(await appDialog.confirm(t.round.lineSendConfirm(payload.roundNo)))) return;
  try {
    await sendLineNotify(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("line notify failed", e);
    void appDialog.alert(t.round.lineSendFailed(msg));
  }
}


/**
 * At "End session": offer to push the day's standings to the LINE group.
 *
 * Must be handed the session *before* endSession() clears it — the payload
 * cannot be rebuilt afterwards. Never throws: the session has already ended
 * by the time this runs, and a failed push must not look like a failed
 * end-of-session.
 */
export async function offerSessionSummary(
  payload: LineSummaryPayload | null,
): Promise<void> {
  if (IS_LOCAL || !payload) return;
  if (!(await appDialog.confirm(t.round.lineSummaryConfirm))) return;
  try {
    await sendLineSummary(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("line summary failed", e);
    void appDialog.alert(t.round.lineSendFailed(msg));
  }
}
