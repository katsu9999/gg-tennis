# Court Shuffle (store version) — Design Spec

Date: 2026-07-05 · Status: revised after P5 adversarial review (senior-engineer, FIX-FIRST verdict — all fixes folded in below)
Owner decisions locked in P0: v1 free / shuffle-only / generic brand / English-only / Android-first.

## Goal

One codebase, two build flavours:

- **GG flavour** (existing): Supabase-backed, live URL sharing, Japanese UI,
  deployed to GitHub Pages for Golders Green TC. Unchanged behaviour.
- **Local flavour** (new): all data on-device (IndexedDB), no network at all,
  English UI, wrapped with Capacitor and shipped to Google Play as
  "Court Shuffle" (working title).

Principles (P0): usable in 30 seconds court-side; demands nothing from members
(one organizer phone runs everything); fairness the organizer can defend.

## Architecture

### 1. Storage flavour switch — composition root only

`src/ui/stores.ts` is the single place repositories are wired. Introduce:

```
VITE_FLAVOR = "gg" (default) | "local"
```

- `flavor === "local"` → wire `createLocal*Repository()` implementations
  (IndexedDB via the existing `idb-keyval` dependency + `local-cache.ts` helpers).
- Everything below the repository interfaces (stores, engine) stays identical.
- **Known exception (P5 #1, BLOCKER)**: `settings.tsx` imports `supabase`
  directly and calls the `set_club_pin` RPC. Settings gets a **separate local
  component** (`settings-local.tsx`: default venue, JSON export, wipe-all);
  the router picks per flavour. No other page imports supabase-client
  (verified by import-graph guard test, see Test strategy).

**Precondition task (P5 #3)**: before implementing, enumerate every
repo/store method each shared page actually calls (grep table checked into
the plan). "full impl" is too coarse — e.g. `sessionRepo.deleteById(id, pin)`
takes a PIN the local impl accepts and ignores.

Local implementations needed (same interfaces as the Supabase ones):

| Repo | v1 local impl |
|---|---|
| SessionRepository | full (sessions list, ongoing, upsert, delete-with-ignored-pin) |
| MemberRepository | full (roster CRUD, archive) |
| VenueRepository | full (names list) |
| HistoryRepository | full |
| MatchLogRepository | **CUT from local v1** (P5 scope note): its only remaining consumer after cutting ranking is past-session winner display. Local flavour hides winner-tap buttons (round) and winner edit (past-sessions) under the store no-op; pair-history fairness (core value) is unaffected — it lives in HistoryRepository. |
| PlannedSession / Rsvp | pages excluded from local router; stores wired as no-op stubs (see below) |

Server-concept stores in local flavour — **wired as no-op stubs, never
undefined** (P5 #2: `home.tsx` calls `plannedSessionStore.loadNext()`,
`liveSessionStore.subscribe()`, `rsvpStore.loadForSession()` unconditionally
in a mount effect; `past-sessions.tsx` calls `rankingStore.load()` after
edits — undefined stores crash on startup):

- `pinStore` → `createLocalPinStore()`: always unlocked (no server to protect;
  destructive actions keep their appDialog confirms).
- `liveSessionStore` → local variant: `refresh()` reads sessionRepo once on
  mount; `subscribe()`/`unsubscribe()` are no-ops. **No polling** (P5 #4:
  a single offline device has no external writers — YAGNI).
- `plannedSessionStore`, `rsvpStore`, `rankingStore` → no-op stubs (empty
  signals, resolved promises); their pages are excluded from the local router.

### 2. Page set per flavour (router-level gating)

| Page | GG | Local v1 |
|---|---|---|
| home | ✓ | ✓ (no RSVP card, no live-share hint) |
| new-session | ✓ | ✓ |
| number-map / history | ✓ | ✓ |
| round | ✓ | ✓ (winner-tap buttons hidden — match_log cut) |
| roster | ✓ | ✓ (no PIN gate) |
| past-sessions | ✓ | ✓ (delete without PIN; winner display/edit hidden) |
| settings | ✓ | **separate component** `settings-local.tsx` (venue defaults, JSON export, wipe-all) — GG settings talks to supabase directly |
| privacy | ✓ | ✓ (rewritten: "all data stays on this device") |
| planned-sessions, public-rsvp, ranking | ✓ | ✗ |

Mechanism: `router.ts` gets a flavour-aware route table; excluded routes fall
through to home. Nav links conditioned on flavour constant, not runtime checks
scattered in pages.

### 3. i18n — minimal string table, no library

~150–200 user-facing strings, two locales, no plural/gender complexity →
a hand-rolled module beats adding an i18n dependency:

```
src/ui/i18n.ts
  export const t = strings[import.meta.env.VITE_LOCALE ?? "ja"]
```

- `t.endSession`, `t.confirmEndSession`, … typed keys, `ja` + `en` tables.
- **Interpolated strings are function entries** (P5 #5): home.tsx alone has
  `{host_label} さんが開始`, `開始から {n} 時間`, conditional stale/live labels
  — these become `t.hostStarted(name)`, `t.ageHours(n)` etc. Not purely
  mechanical; budgeted accordingly.
- GG flavour builds with `VITE_LOCALE=ja` (zero visible change);
  local flavour builds with `en`.
- Extraction of existing literals; tests assert via testids (mostly already
  do), remaining text assertions updated alongside. **Because testids don't
  verify display text, add en-locale snapshot tests for key pages** —
  interpolation mistakes would otherwise slip through.

### 4. Capacitor wrap (Android)

- `@capacitor/core` + `@capacitor/android`, `capacitor.config.ts` with
  `webDir: dist-local`.
- Build scripts: `build:gg` (今のbuild), `build:local`
  (`VITE_FLAVOR=local VITE_LOCALE=en VITE_BASE_URL=/ vite build --outDir dist-local`).
- PWA plugin disabled for local flavour (Capacitor shell replaces SW updates;
  avoids stale-cache class of bugs entirely).
- Icons/splash via `@capacitor/assets` from one 1024px master (Katsu Labs
  style guide: navy circle #09091f + gold letter — decide final art at listing time).
- **Android hardware back button** (P5 #7): the app uses a custom
  `history.pushState` router; wire `@capacitor/app`'s `backButton` listener
  to it (back = router back; on home = minimize app). Smoke checklist covers
  back behaviour on every screen.
- **Origin is frozen at v1** (P5 #8): IndexedDB is partitioned by WebView
  origin, which Capacitor derives from `androidScheme` + `hostname`. These are
  set once in `capacitor.config.ts` (https / `localhost` default) and must
  never change across releases, or all user data is orphaned.
- Signing: Play App Signing. Upload keystore (`.jks`) gets an **encrypted
  file backup** (not just a vault note of the password) — losing it means a
  Play Support recovery process (P5 #9).
- Target SDK: Play requires targetSdk 35 for new apps (2025+); verify what
  Capacitor 7 scaffolds and bump if needed (P5 #9).

### 5. Out of scope for v1 (recorded Won'ts)

Live sharing, RSVP, rankings page, PIN, billing, iOS build, padel theme,
Japanese UI for store flavour, cloud backup, **winner recording / match log**
(P5 scope cut — pair-history fairness stays; standings would bring winners
back in v1.x). Each is a v1.x candidate gated on observed demand (research
doc lists triggers).

Kept despite being small: JSON export in settings-local — it's the only
backup path for device-local data.

Privacy page hosting note: the Play listing needs a public privacy-policy
URL. Host a store-flavour copy on the existing GitHub Pages deploy (e.g.
`/gg-tennis/privacy-store.html`) — a static file added to the GG deploy,
the one deliberate cross-flavour artefact.

## Data model note

Local repos reuse the exact row shapes the Supabase repos return (snake_case
rows already mapped in repositories) so stores/engine don't change. Keys:
`cs_members`, `cs_venues`, `cs_sessions`, `cs_session_ongoing`, `cs_history`
via idb-keyval; one JSON blob per collection (row counts are tiny — a club
season is < 1k rows) with a `schemaVersion` field for future migration.

Atomicity notes (P5 #6):

- **The ongoing session lives in its own key** (`cs_session_ongoing`), not
  inside the `cs_sessions` blob — round-by-round hot writes rewrite a small
  blob, not the whole past-session history (rounds JSONB included).
- **All writes go through a per-key serialization queue** (a tiny
  promise-chain map in the local-repo module) so concurrent read-modify-write
  on the same key can't lose updates. idb-keyval ops aren't transactional
  across keys; single-key RMW + queue is enough at this scale, and cutting
  match_log removed the only multi-key write path (recordWinner).

## Risks / mitigations

- **Divergence between flavours** → flavour logic confined to stores.ts,
  router table, i18n locale; CI runs the full test suite in BOTH flavours.
- **IndexedDB eviction on Android WebView** → Capacitor persists storage by
  default (native shell, not browser tab); add JSON export in settings as
  belt-and-braces.
- **String extraction regressions** → testids already cover interactive
  elements; extraction PR runs the suite unchanged before locale swap.
- **Play policy** → no data collection at all → simplest Data Safety form;
  privacy page rewritten to match.

## Test strategy (P7/P8)

- Local repos: contract tests — run the SAME test suite against Supabase fakes
  and local impls where interfaces overlap (table-driven).
- Flavour wiring: unit test that local flavour never imports supabase-client
  (static import graph assertion, mirrors existing no-third-party.test.ts).
- i18n: type-level exhaustiveness (en keys ≡ ja keys), snapshot of key pages in en.
- Existing 259-test suite must stay green in GG flavour.
