import { signal } from "@preact/signals";
import type { PinStore } from "@/state/pin-store";

/**
 * PinStore for the local flavour: permanently unlocked.
 *
 * The PIN exists to protect a shared server from other club members; a
 * device-local app has neither. Destructive actions keep their appDialog
 * confirms — this only removes the PIN prompt layer. The empty-string PIN is
 * handed to repo methods that require one and is ignored by the local repos.
 */
export function createLocalPinStore(): PinStore {
  return {
    isUnlocked: signal(true),
    verifying: signal(false),
    lastError: signal<string | null>(null),
    async verify() {
      return true;
    },
    getPin() {
      // Must be truthy: useRequirePin's gate() checks `isUnlocked && getPin()`
      // — an empty string would pop the PIN modal. Local repos ignore the value.
      return "local";
    },
    lock() {
      // no-op: there is nothing to lock on a single-user device
    },
    async setClubPin() {
      throw new Error("setClubPin is not available in the local flavour");
    },
  };
}
