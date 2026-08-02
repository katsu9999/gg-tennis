import type { AttendeeRef } from "@/engine/models";
import type { InMemorySession } from "@/state/session-store";
import type { LineRoundPayload } from "@/data/line-notify-client";
import { sendLineNotify } from "@/data/line-notify-client";
import { appDialog } from "@/ui/components/app-dialog";
import { t } from "@/ui/i18n";
import { IS_LOCAL } from "@/flavor";
import { sessionStore, rosterStore } from "@/ui/stores";

/** Build the Edge Function payload for the session's current round, with
 *  attendee refs resolved to display names. Exported for tests. */
export function buildRoundPayload(
  s: InMemorySession,
  memberNames: Map<number, string>,
): LineRoundPayload | null {
  const round = s.rounds[s.currentRoundIndex];
  if (!round) return null;

  const guestNames = new Map<string, string>();
  for (const a of s.attendees) {
    if (a.isGuest && a.guestName) guestNames.set(JSON.stringify(a.ref), a.guestName);
  }
  const label = (ref: AttendeeRef): string => {
    if (ref.kind === "member") return memberNames.get(ref.memberId) ?? `#${ref.memberId}`;
    return guestNames.get(JSON.stringify(ref)) ?? "Guest";
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
