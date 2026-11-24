/**
 * Build flavour switch.
 *
 * - "gg" (default): Supabase-backed club deployment for Golders Green TC.
 * - "local": device-only storage (IndexedDB), no network — the Google Play
 *   "Court Shuffle" build.
 *
 * The flavour decides which composition root Vite bundles (see the
 * `@/ui/stores` alias in vite.config.ts); this constant is for the few
 * page-level presentation diffs (Phase 2).
 */
export type Flavor = "gg" | "local";

export const FLAVOR: Flavor = import.meta.env.VITE_FLAVOR === "local" ? "local" : "gg";
export const IS_LOCAL = FLAVOR === "local";

/** Short brand mark shown in page headers. */
export const BRAND = IS_LOCAL ? "Court Shuffle" : "GG";

/**
 * クラブ専用の公開（2026-11-24）。VITE_FIXED_CLUB=ravens でビルドすると、その
 * クラブだけを開くアプリになる（例: katsu9999.github.io/ravens/）。URL に /c/<slug>
 * は付かず、別クラブ（GG を含む）への切り替えもしない。未指定なら通常の GG 公開。
 */
export function parseFixedClub(raw: string | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,29}$/.test(v) && v !== "gg" ? v : null;
}

export const FIXED_CLUB: string | null = IS_LOCAL ? null : parseFixedClub(import.meta.env.VITE_FIXED_CLUB);
