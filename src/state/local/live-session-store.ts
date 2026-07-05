import { signal } from "@preact/signals";
import type { LiveSessionStore } from "@/state/live-session-store";
import type { SessionRepository, SessionRow } from "@/data/session-repository";

/**
 * LiveSessionStore for the local flavour.
 *
 * A single offline device has no external writers, so there is nothing to
 * subscribe to and nothing worth polling — `refresh()` (already called on
 * home mount) is the only way the badge can change.
 */
export function createLocalLiveSessionStore(sessionRepo: SessionRepository): LiveSessionStore {
  const current = signal<SessionRow | null>(null);
  return {
    current,
    async refresh() {
      current.value = await sessionRepo.loadOngoing();
    },
    subscribe() {
      // no-op: no Realtime, no other writers
    },
    unsubscribe() {
      // no-op
    },
  };
}
