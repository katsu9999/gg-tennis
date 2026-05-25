# GG Tennis Court Shuffle — UK GDPR §17.11 Checklist (v1)

Status as of v1 release. See `docs/superpowers/specs/2026-05-25-gg-tennis-shuffle-design.md` §17.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 17.11.1 | Supabase region = **eu-west-2 (London)** | 🔧 Operator | `README.md` "Supabase setup" |
| 17.11.2 | DPA acceptance recorded | 🔧 Operator | `README.md` "Supabase setup" step 4 |
| 17.11.3 | Bilingual `/privacy` page (JA + EN) | ✅ Done | `src/ui/pages/privacy.tsx` + `src/ui/privacy-content.ts` |
| 17.11.4 | Member hard-delete with confirmation modal | ✅ Done | `src/ui/pages/roster.tsx` `delete-modal` + `src/state/roster-store.ts` `hardDelete` |
| 17.11.5 | Per-member data export (JSON) | ✅ Done | `src/data/gdpr-export.ts` + `src/ui/pages/roster.tsx` `export-{id}` button |
| 17.11.6 | `noindex,nofollow` on public RSVP page | ✅ Done | `src/ui/pages/public-rsvp.tsx` `applyNoIndexMeta` |
| 17.11.7 | CI guard against third-party resources | ✅ Done | `tests/no-third-party.test.ts` |
| 17.11.8 | RLS integration tests | ✅ Done (scaffolded) | `tests/data/rls.integration.test.ts` — runs against `supabase start` |

🔧 = needs operator action (browser/cloud config); ✅ = code is in place.

## Notes on v1 limitations (deferred to v1.5)

- **Anon RSVP self-token check**: enforced at the application layer via WHERE clause + a `rsvp_protect_self_token` trigger (token-immutable). RLS cannot compare a request-bound token to a row column directly. v1.5 introduces full member auth.
- **Brightness control**: Web browsers do not expose screen brightness control. v1.5's Capacitor wrap will add native control.
- **Pair-history flush ordering**: persisted on `endSession`, not per-round, to minimise upserts. See `session-store.ts` for the trust boundary discussion.

## Operator action items (do before launching publicly)

1. ☐ Supabase project in `eu-west-2 (London)`
2. ☐ Supabase DPA accepted (date: ________________)
3. ☐ `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in repo Secrets
4. ☐ Optional `VITE_BASE_URL` in repo Variables if not using a custom domain
5. ☐ Replace placeholder `public/icons/*.png` with real 192×192 + 512×512 artwork
6. ☐ Custom domain CNAME or accept the `<user>.github.io/<repo>/` path
7. ☐ Verify deploy succeeded (Settings → Pages → live URL)
8. ☐ End-to-end smoke test with the seed admin (see README "Day-of UI verification")
