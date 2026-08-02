# Plan: Court Shuffle store version (local flavour + Capacitor + Play)

Goal: ship a device-local, English, free Android app from the existing codebase
without changing GG-flavour behaviour.
Architecture: see specs/2026-07-05-store-local-version-design.md.
Stack: existing (Preact + signals + Vite + vitest) + idb-keyval (already a dep)
+ Capacitor 7 (current stable) — chosen because the PWA already meets its
constraints and README planned for it ("Ready for v1.5 Capacitor wrapping").

Each phase = one PR, suite green in both flavours before merge.

Revised after P5 adversarial review (senior-engineer): settings rewrite,
no-op store stubs, match_log cut, i18n function entries, back button,
frozen origin, realistic timeline.

## Phase 1 — flavour switch + local repositories (core, ~2.5 days)

0. **Method census first** (P5 #3): grep table of every repo/store method
   each shared page calls, checked into this doc's appendix. Drives the
   local interfaces — no "full impl" guesswork.
1. `src/flavor.ts`: `export const FLAVOR`, `IS_LOCAL` from `import.meta.env.VITE_FLAVOR`.
2. Contract test harness `tests/data/repo-contract.ts`: table of interface
   behaviours (add/list/update/delete/ongoing rules) parameterised over impl.
3. TDD: `createLocalSessionRepository` — ongoing session in its own key
   `cs_session_ongoing` (hot writes stay small), past sessions in
   `cs_sessions`, schemaVersion=1, per-key write-serialization queue →
   contract tests RED→GREEN. `deleteById(id, pin)` accepts and ignores pin.
4. TDD: local member / venue / history repos (same pattern). **No match-log
   repo** — cut from local v1.
5. `stores.ts`: flavour-based wiring; `createLocalPinStore` (always unlocked);
   local `liveSessionStore` (refresh reads repo once; subscribe/unsubscribe
   no-op — NO polling); `plannedSessionStore` / `rsvpStore` / `rankingStore`
   as no-op stubs so shared-page mount effects don't crash.
6. Static guard test: local flavour import graph must not reach
   `supabase-client.ts` (extend no-third-party.test.ts approach).
7. `npm run dev:local` script for manual smoke.

## Phase 2 — router gating + page diffs (~1.5 days)

1. Route table gains `flavors` field; local build drops planned-sessions,
   public-rsvp, ranking (fall through to home).
2. home: hide RSVP/next-session card + live-share copy under `IS_LOCAL`
   (mount effect is already safe via no-op stubs).
3. round: hide winner-tap buttons under `IS_LOCAL` (match_log cut).
4. roster/past-sessions: bypass PIN gate in local flavour (keep appDialog
   confirms); past-sessions hides winner display/edit.
5. settings: **new `settings-local.tsx` component** (GG settings imports
   supabase directly — not reusable): default venue, JSON export (share
   sheet), wipe-all (double confirm). Router picks per flavour.
6. privacy page: local-flavour copy ("everything stays on this device");
   store copy also published as static page on the GG Pages deploy for the
   Play listing URL.
7. Tests: router gating unit tests; page tests run with flavour mocked both ways.

## Phase 3 — i18n extraction (~1.5 days)

1. `src/ui/i18n.ts` with typed key table; `ja` table = current literals
   verbatim (GG pixel-identical), `en` table translated. Interpolated
   strings become **function entries** (`t.hostStarted(name)`, `t.ageHours(n)`)
   — home.tsx has many; not purely mechanical.
2. Extract page by page (round → home → new-session → roster → past-sessions →
   settings → dialogs); suite after each page.
3. Type-level test: `en` keys ≡ `ja` keys; **en snapshot tests for key pages**
   (testids don't catch interpolation mistakes). CI job builds both flavours.

## Phase 4 — Capacitor + Android (~1.5-2 days incl. first-device debugging)

1. Add capacitor deps, `capacitor.config.ts` (appId `uk.katsulabs.courtshuffle`;
   **androidScheme/hostname set once and frozen** — origin change orphans all
   IndexedDB data), `build:local` script (VITE_FLAVOR=local VITE_LOCALE=en,
   PWA plugin off, outDir dist-local).
2. `npx cap add android`; verify targetSdk ≥ 35 (Play requirement for new
   apps); icons/splash via @capacitor/assets from master art.
3. **Hardware back button**: `@capacitor/app` backButton listener wired to
   the custom router (back = router back; on home = minimize).
4. Physical-device smoke checklist (doc'd): new session → 3 rounds → lock
   phone 5 min → resume → end session → past sessions shows it → export JSON
   → **back button behaves on every screen** → kill app → relaunch → data intact.
5. Versioning: versionName from package.json, versionCode date-based.
6. Signing: generate upload keystore; **encrypted backup of the .jks file
   itself** (vault note alone is not enough).

## Phase 5 — Play listing + release (~0.5 day + review wait)

1. Play Console: check account standing + whether the 12-tester/14-day closed
   testing rule applies (account age); plan release track accordingly
   (internal → closed w/ GG members → production).
2. Listing: title/short/full description mined from research ASO notes
   (byes fairness, no repeated partners, no accounts/ads/subscription);
   screenshots from Phase 4 build (framed, EN).
3. Data Safety form: "no data collected"; privacy policy URL = GitHub Pages
   privacy page (local-flavour copy hosted at /privacy-store or similar).
4. Signed AAB upload; release notes v1.0.

## Verification gates

- P8 per phase: typecheck, lint, suite green (both flavours), no console.log.
- P9 after Phase 4: ui-ux-designer agent review of the EN build screenshots +
  on-device smoke by Katsu.
- P10 before each merge: code-review agent; security-review on Phase 1
  (storage) and Phase 5 (policy/privacy claims).

## Timeline (revised per P5 #10)

~7-8 dev days of build work (was optimistically 5.5), **plus real-world
gates that dominate the calendar**: if the personal Play account falls under
the post-Nov-2023 rule, production release requires a closed test with
12 testers for 14 continuous days — a hard 2+ week wall regardless of code.
Check account standing in Phase 5 step 1 FIRST (it can run in parallel with
Phase 1) so the closed test starts as early as possible.

## Explicitly deferred (v1.x, demand-gated)

Billing unlock · padel theme/brand · local standings page · iOS · cloud backup
· Japanese store locale · **winner recording/match log** (P5 cut; returns with
standings if demanded).
