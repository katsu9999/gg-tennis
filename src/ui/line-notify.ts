import type { AttendeeRef } from "@/engine/models";
import type { InMemorySession } from "@/state/session-store";
import type { LineRoundPayload } from "@/data/line-notify-client";
import { sendLineNotify } from "@/data/line-notify-client";
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
