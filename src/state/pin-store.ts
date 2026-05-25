import { signal, type Signal } from "@preact/signals";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tracks club-PIN unlock state for the current page session.
 *
 * Per Model A (v1.1):
 *   - Destructive operations (member delete, venue edit, planned-session
 *     create, settings change) require the shared club PIN.
 *   - PIN is verified server-side via the `verify_club_pin` RPC. The PIN is
 *     never persisted client-side; `isUnlocked` is in-memory only and resets
 *     on page reload.
 *   - When `isUnlocked === true`, destructive RPC calls (e.g. `delete_member`)
 *     can pass the cached PIN automatically. The PIN itself is kept in a
 *     closure-local variable so it is not exposed on the store object.
 */

export interface PinStore {
  isUnlocked: Signal<boolean>;
  verifying: Signal<boolean>;
  /** Verify the PIN against the server; on success, cache it for this page. */
  verify(pin: string): Promise<boolean>;
  /** Return the cached PIN if unlocked, else null. Used by RPC callers. */
  getPin(): string | null;
  /** Clear the cached PIN and lock again. */
  lock(): void;
}

export function createPinStore(supabase: SupabaseClient): PinStore {
  const isUnlocked = signal(false);
  const verifying = signal(false);
  let cachedPin: string | null = null;

  return {
    isUnlocked,
    verifying,
    async verify(pin) {
      if (!pin) return false;
      verifying.value = true;
      try {
        const { data, error } = await supabase.rpc("verify_club_pin", {
          pin_input: pin,
        });
        if (error) return false;
        const ok = data === true;
        if (ok) {
          cachedPin = pin;
          isUnlocked.value = true;
        }
        return ok;
      } finally {
        verifying.value = false;
      }
    },
    getPin() {
      return cachedPin;
    },
    lock() {
      cachedPin = null;
      isUnlocked.value = false;
    },
  };
}
