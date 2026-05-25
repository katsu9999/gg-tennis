# GG — Tennis Court Shuffle

Web/PWA app that produces fair, fresh court assignments for tennis club sessions.
Shared club-wide via Supabase, deployed on GitHub Pages. URL-only access for
iPhone / Android / PC. Ready for v1.5 Capacitor wrapping (Android / iOS native).

- **Spec:** [`docs/superpowers/specs/2026-05-25-gg-tennis-shuffle-design.md`](docs/superpowers/specs/2026-05-25-gg-tennis-shuffle-design.md)
- **Implementation plan:** [`docs/superpowers/plans/2026-05-25-gg-tennis-shuffle-v1.md`](docs/superpowers/plans/2026-05-25-gg-tennis-shuffle-v1.md)
- **Visual overview (printable):** [`docs/GG-design-overview.html`](docs/GG-design-overview.html)

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

## Roadmap

- **v1 (this branch):** Web/PWA on GitHub Pages + Supabase. URL-only access.
- **v1.5:** Capacitor wrap → Android (Play Store) + iOS (App Store). Same
  codebase, plus native picks up brightness control automatically.
- **v2:** detailed scores, Elo-balanced matchmaking, hall of fame, multi-club.

See plan §15 for details.

## License

Internal use, Golders Green Tennis Club.
