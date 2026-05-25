-- Seed data for local Supabase emulator (Task 2.8 RLS integration tests).
-- Production deploys should NOT run this.

-- Admin allowlist
insert into admins (email) values ('admin@example.com') on conflict do nothing;

-- Sample member used by RLS RSVP tests
insert into members (id, name, status)
  values (1, 'Test User', 'active')
  on conflict do nothing;

-- Planned session with a known token so anon RSVP tests can target it
insert into planned_sessions (
  id, date, location, court_count, allow_singles,
  public_rsvp_token, show_going_list_on_public
) values (
  '11111111-1111-1111-1111-111111111111',
  '2026-06-01',
  'Golders Hill',
  3,
  true,
  'public-token-abc',
  true
) on conflict do nothing;
