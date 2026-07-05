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
