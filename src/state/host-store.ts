import { signal, type Signal } from "@preact/signals";

/**
 * Tracks the "host of the day" using a LocalStorage-issued token.
 *
 * Per Model A (v1.1):
 *   - Anyone can start a session; doing so writes our `hostToken` to the
 *     session row's `host_token` column. The label is shown on live views.
 *   - Once a session is `ongoing`, ANY visitor can operate it (open access).
 *     The host label is purely informational ("○○ さんが運営中").
 *   - The token is NOT a security boundary — destructive operations are
 *     protected by the club PIN (see pin-store.ts), not by host status.
 */

const TOKEN_KEY = "gg_host_token";
const LABEL_KEY = "gg_host_label";

export interface HostStore {
  token: Signal<string>;
  label: Signal<string>;
  setLabel(label: string): void;
  isHost(hostToken: string | null | undefined): boolean;
}

function ensureToken(): string {
  if (typeof localStorage === "undefined") {
    return cryptoRandomToken();
  }
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && existing.length >= 16) return existing;
  const fresh = cryptoRandomToken();
  localStorage.setItem(TOKEN_KEY, fresh);
  return fresh;
}

function cryptoRandomToken(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback (SSR or very old browser): time + random.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function readLabel(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(LABEL_KEY) ?? "";
}

export function createHostStore(): HostStore {
  const token = signal(ensureToken());
  const label = signal(readLabel());

  return {
    token,
    label,
    setLabel(next) {
      label.value = next;
      if (typeof localStorage !== "undefined") {
        if (next) localStorage.setItem(LABEL_KEY, next);
        else localStorage.removeItem(LABEL_KEY);
      }
    },
    isHost(hostToken) {
      if (!hostToken) return false;
      return hostToken === token.value;
    },
  };
}
