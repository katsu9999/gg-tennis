# GG — Tennis Court Shuffle

Web/PWA app that produces fair, fresh court assignments for tennis club sessions.
Shared club-wide via Supabase, deployed on GitHub Pages. URL-only access for
iPhone / Android / PC. Ready for v1.5 Capacitor wrapping (Android / iOS native).

- **Spec:** [`docs/superpowers/specs/2026-05-25-gg-tennis-shuffle-design.md`](docs/superpowers/specs/2026-05-25-gg-tennis-shuffle-design.md)
- **v1 plan:** [`docs/superpowers/plans/2026-05-25-gg-tennis-shuffle-v1.md`](docs/superpowers/plans/2026-05-25-gg-tennis-shuffle-v1.md)
- **v1.1 plan (Model A):** [`docs/superpowers/plans/2026-05-25-gg-tennis-v1.1-model-a.md`](docs/superpowers/plans/2026-05-25-gg-tennis-v1.1-model-a.md)
- **Visual overview (printable):** [`docs/GG-design-overview.html`](docs/GG-design-overview.html)

## How it works (v1.1 — Model A)

- **No login.** Anyone with the URL can view everything and start a session.
- **First to start = today's host.** The "セッション開始" button writes your
  browser as host. The label shows on the live-session card on the home page
  ("○○ さんが運営中").
- **Open operation.** Once a session is ongoing, ANY visitor can tap winners,
  advance rounds, or end the session. Supabase Realtime broadcasts every change
  so all phones stay in sync.
- **Club PIN for destructive actions.** Member delete, venue edit,
  planned-session creation, settings change → all require the shared club PIN.
  Rotate it from /settings.
- **Spectate.** When a session is live, every member sees a "🟢 ライブ中" card
  on home and can tap to follow along (or take over if needed).

See [`docs/superpowers/plans/2026-05-25-gg-tennis-v1.1-model-a.md`](docs/superpowers/plans/2026-05-25-gg-tennis-v1.1-model-a.md)
for the full design rationale (why we dropped the persistent admin allowlist).

## Setup

```bash
nvm use            # Node 20
npm install
cp .env.local.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see "Supabase setup" below)
npm run dev        # http://localhost:5173
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Production build (typecheck + bundle) |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint over `src` + `tests` |
| `npm run typecheck` | `tsc --noEmit` |

## Supabase setup (one-time, operator-driven)

1. Sign in to <https://supabase.com> → **New Project**
   - Name: `gg-tennis-shuffle`
   - **Region: `eu-west-2 (London)`** — required for UK GDPR (see GDPR section)
   - Plan: Free
2. Wait for the project to provision (~2 min).
3. Settings → **API** → copy:
   - `Project URL` → `VITE_SUPABASE_URL` in `.env.local`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` in `.env.local`
4. Settings → **Legal** → confirm acceptance of the GDPR-ready **Data Processing
   Agreement (DPA)**. Record the date in your operations notes.
5. The `service_role` key is the admin key — never commit it. Later, when
   GitHub Actions CD is wired up, store it in repo secrets as
   `SUPABASE_SERVICE_ROLE_KEY`. Not needed for local development.

Database migrations land in Phase 2 (Task 2.2) under `supabase/migrations/`.

## GDPR

This project is designed for a UK-based tennis club and complies with UK GDPR
(Data Protection Act 2018) + EU GDPR. See spec §17 for the full treatment.

Key choices implemented in code:

- **Supabase region:** `eu-west-2 (London)` — keeps all personal data in UK/EU.
- **GitHub Pages** serves only static assets; no personal data is hosted there.
- **No third-party trackers / fonts / CDNs.** Enforced by
  [`tests/no-third-party.test.ts`](tests/no-third-party.test.ts) in CI.
- **Cookie banner: not required.** No tracking cookies; auth tokens use
  LocalStorage which is "strictly necessary" under PECR.
- **Rights to erasure & portability:** admin UI exposes per-member hard-delete
  and JSON/CSV export (Phase 5).
- **Public RSVP page** carries `noindex,nofollow` and a 32-byte random
  token; admin can rotate or revoke it.

DPA acceptance: pending operator action — set the date in this README once
done.

## Day-of UI verification (Phase 4 manual E2E)

After the engine, data, and state layers are in place, the day-of UI is
verified by hand against a live Supabase project. This is operator-driven
because it needs a real auth flow and real RLS.

### Prerequisites

1. Supabase project created in **`eu-west-2 (London)`** (see "Supabase setup"
   above).
2. `.env.local` populated with the project URL + anon key.
3. Migrations applied. From the project root:

   ```bash
   # Option A — Supabase CLI (recommended; needs Docker for local emulator)
   npm run db:start        # supabase start
   # or push migrations to the remote project:
   supabase link --project-ref <ref> && supabase db push
   ```

   ```sql
   -- Option B — paste these in the Supabase SQL editor in order:
   --   supabase/migrations/0001_schema.sql
   --   supabase/migrations/0002_rsvp.sql
   --   supabase/migrations/0003_rls.sql
   --   supabase/migrations/0004_v1_1_schema.sql   -- v1.1: host_token, club_pin_hash, operation_log
   --   supabase/migrations/0005_v1_1_rpc.sql      -- v1.1: PIN-gated SECURITY DEFINER RPCs
   --   supabase/migrations/0006_v1_1_rls.sql      -- v1.1: open session writes + lock PIN tables
   ```

4. Seed members and set the initial club PIN:

   ```sql
   -- One-time: set the club PIN (use a strong value; rotate from /settings later).
   update settings set club_pin_hash = crypt('CHANGE_ME', gen_salt('bf')) where id = 1;

   insert into members (name, status) values
     ('佐藤', 'active'),
     ('山本', 'active'),
     ('田中', 'active'),
     ('鈴木', 'active'),
     ('高橋', 'active'),
     ('伊藤', 'active'),
     ('渡辺', 'active');
   ```

### Run the dev server

```bash
npm run dev          # http://localhost:5173
```

### Walk through the flow

1. Open `http://localhost:5173` — no login required.
2. The home page shows 6 nav buttons + the "📅 次回セッション" card. When a
   session is live, a "🟢 ライブ中" card appears above it.
3. Optional: visit **設定** → enter your display name (shown as
   "○○ さんが運営中" on the live card).
4. **セッション開始 →** brings up the new-session form. Pick a date, a
   location (autocomplete from `venues`), 3 courts, シングルス許可, and tap
   6+ members. The first PIN-gated action (e.g. saving a new venue) will
   prompt for the club PIN.
5. **次へ：番号を抽選 →** opens the number-map page showing 名前 → 1..N.
6. **ラウンド開始 →** generates the first round. Anyone (host or spectator)
   can tap a team to record them as the winner (✓ + lime fill).
7. Tap **次のラウンド →** several times. Play counts stay balanced
   (`max-min ≤ 1`). Other phones see updates instantly via Realtime.
8. Open **履歴** to navigate previous rounds with ←/→ and toggle name display.
9. Verify in Supabase: `sessions` has one `ongoing` row with your `host_token`,
   `match_log` has the winners you tapped, `pair_history` is empty until
   end-session, `operation_log` records the writes.

## PWA & pages (Phase 8)

- **PWA enabled** — `vite-plugin-pwa` generates `sw.js` and `manifest.webmanifest` at build time. The app installs as a standalone home-screen app.
- **Placeholder icons** — `public/icons/*.png` are gitignored 1×1 transparent PNGs regenerated by `prebuild`/`predev`. The operator must replace them with real 192×192 and 512×512 artwork before launch.
- **Privacy page** at `/privacy` — bilingual (日本語 / English) UK GDPR notice; no user input, no cookie banner required.
- **Settings page** at `/settings` — account status, outdoor-mode guidance, link to privacy notice.

## Deployment (GitHub Pages)

### One-time setup (operator)

1. Push the repo to GitHub: `git remote add origin git@github.com:<user>/gg-tennis-shuffle.git && git push -u origin main`.
2. Settings → **Pages** → Source = "GitHub Actions".
3. Settings → **Secrets and variables** → **Actions**:
   - Secret `VITE_SUPABASE_URL` = your project URL
   - Secret `VITE_SUPABASE_ANON_KEY` = your anon key
4. Settings → **Variables** → optional:
   - Variable `VITE_BASE_URL` = `/gg-tennis-shuffle/` if hosting from a repo path; leave unset (defaults to `/`) for a custom domain.
5. Push to `main` triggers the deploy workflow. The first deploy can take ~5 min.

### Custom domain (optional)

1. Create `public/CNAME` containing your domain (e.g. `gg.example.com`).
2. Configure DNS: `CNAME gg → <user>.github.io.`
3. Leave `VITE_BASE_URL` unset (defaults to `/`).

### How SPA routing works on GitHub Pages

The workflow copies `dist/index.html` → `dist/404.html` so deep links like `/rsvp/abc123` return the SPA bundle instead of a 404. The client router then handles the in-app route. This is the standard "404 trick" for GitHub Pages SPAs.

## Roadmap

- **v1 (this branch):** Web/PWA on GitHub Pages + Supabase. URL-only access.
- **v1.5:** Capacitor wrap → Android (Play Store) + iOS (App Store). Same
  codebase, plus native picks up brightness control automatically.
- **v2:** detailed scores, Elo-balanced matchmaking, hall of fame, multi-club.

See plan §15 for details.

## License

Internal use, Golders Green Tennis Club.
