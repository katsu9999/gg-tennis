# Store Version — Market Research Summary (2026-07-05)

Condensed from the 2026-07-03 deep-research run (20 sources, 25 claims adversarially
verified 3-vote, 0 killed). Full report lives in Katsu's memory
(`reference_gg_tennis_market_research.md`).

## Verdict

Conditional Go — ship as a zero-cost portfolio product, not a revenue bet.
Realistic ceiling for solo-dev apps in this niche: hundreds to low thousands
of GBP per year.

## Direct competitors (all verified live 2026-07-03)

| App | Model | Traction | Weakness |
|---|---|---|---|
| Pickleheads (US) | freemium sub | 9.9K ratings @ 4.9 | pickleball-only, US-only |
| Round Robin Assistant (SE) | sub $22.99/yr, $99.99 forever | 10K+ DL, 3.9★/533 | unfair rotation complaints, paywall resentment |
| MatchUp Tennis & Pickleball | free <15 players + $24.99 lifetime | 31 ratings in 8 years | no live share, dated |
| Pickleball Rotator (UK solo dev) | $2.99 one-time | 0–4 ratings in 6.5 months | none — market just didn't come |
| Padel Mates | sub £5.99/mo | 986 ratings @ 4.4 | booking platform, not a shuffle tool |

Key negative signal: Pickleball Rotator is nearly identical to this product
(no-login, fair rotation, one-time price, actively updated) and got no organic
traction. Discovery, not price, is the bottleneck.

## Market context

- US pickleball: 24.3M players 2025 (+479%/5yr), 7.5M core.
- GB padel: 860K → 1M+ players, 69 → 1,550+ courts (~2.8 courts/venue).
- GB tennis: 5.8M adult annual participation (record).
- Real TAM = session hosts, likely low tens of thousands globally.
- Padel social culture centres on "Americano" (rotating-pairs social format)
  — the magic ASO keyword for a future padel-branded variant.
- Threat: Playtomic is building "Open Play" (auto court/partner rotation)
  into its venue SaaS.

## Differentiators that survive scrutiny

- Cross-session pair-history fairness (no competitor has it; RRA reviews
  complain about repeated partners and uneven byes).
- No accounts, no tracking, no ads (matches the niche's stated preferences).
- Multi-sport rules-agnostic shuffle (doubles = 4 per court everywhere).

NOT unique: host-only operation, no player logins (MatchUp, Pickleball
Rotator both have them).

## ASO copy sources (verbatim competitor complaints)

- "players were getting multiple byes" (RRA, 1★)
- forced round counts (13 players → 13 rounds)
- "truly random" pairing, repeated partners on consecutive games
- "Wish I hadn't paid for a full year" (subscription resentment)

## Decisions taken (2026-07-04/05, Katsu)

- Two tracks: GG live version (Supabase, club-only) stays as is; store version
  is device-local only (Option A) — no shared DB, no GDPR custody, no server cost.
- v1: completely free (no billing), shuffle-only (no ranking page), generic
  brand (working title: Court Shuffle), English-only UI, Android first
  (Play account already paid; Apple $99/yr deferred; iPhone users get the PWA).
- v1.1 candidates by observed demand: one-time organizer unlock (~£9.99),
  padel-branded blue variant ("Americano" naming), local standings.
