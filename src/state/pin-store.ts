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
  /** Last error message from a verify call (RPC-level), or null. */
  lastError: Signal<string | null>;
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
  const lastError = signal<string | null>(null);
  let cachedPin: string | null = null;

  return {
    isUnlocked,
    verifying,
    lastError,
    async verify(pin) {
      if (!pin) {
        lastError.value = null;
        return false;
      }
      verifying.value = true;
      lastError.value = null;
      try {
        const { data, error } = await supabase.rpc("verify_club_pin", {
          pin_input: pin,
        });
        if (error) {
          console.error("verify_club_pin RPC failed:", error);
          lastError.value = `サーバーエラー: ${error.message ?? "不明"} (migrations 0004-0006 が未適用かも)`;
          return false;
        }
        const ok = data === true;
        if (ok) {
          cachedPin = pin;
          isUnlocked.value = true;
        }
        return ok;
      } catch (e) {
        console.error("verify_club_pin threw:", e);
        lastError.value = `通信エラー: ${e instanceof Error ? e.message : String(e)}`;
        return false;
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
