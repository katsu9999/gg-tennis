import { signal, type Signal } from "@preact/signals";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRepository, SessionRow } from "@/data/session-repository";

/**
 * v1.1 Model A: tracks the currently `ongoing` session via Supabase Realtime.
 *
 * Anyone visiting the app sees the live session badge on the home page even
 * if they didn't start it. Subscribing to the `sessions` table broadcasts
 * inserts/updates/deletes so the badge updates without polling.
 */
export interface LiveSessionStore {
  current: Signal<SessionRow | null>;
  /** Manual fetch (called on mount before subscribe lands). */
  refresh(): Promise<void>;
  /** Idempotent — calling twice is a no-op. */
  subscribe(): void;
  /** Tears down the Realtime channel. Call from useEffect cleanup. */
  unsubscribe(): void;
}

export function createLiveSessionStore(
  supabase: SupabaseClient,
  sessionRepo: SessionRepository,
): LiveSessionStore {
  const current = signal<SessionRow | null>(null);

  // Channel handle. Stored in a closure so subscribe/unsubscribe pair cleanly.
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;

  async function refresh(): Promise<void> {
    current.value = await sessionRepo.loadOngoing();
  }

  function subscribe(): void {
    if (channel) return;
    channel = supabase
      .channel("public:sessions:ongoing")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => {
          // Cheap re-fetch on any change. The session table sees at most a few
          // writes per minute during play; a single round-trip is fine.
          void refresh();
        },
      )
      .subscribe();
  }

  function unsubscribe(): void {
    if (!channel) return;
    void supabase.removeChannel(channel);
    channel = null;
  }

  return { current, refresh, subscribe, unsubscribe };
}
