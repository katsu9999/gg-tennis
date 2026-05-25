-- v1.1 Model A — RLS rewrites
-- Strategy:
--   * Session-operation tables (sessions, match_log, pair_history): open to anon write
--     while a session is active. Reads remain public.
--   * PIN-gated tables (members, venues, planned_sessions, settings): direct writes
--     blocked; all writes must go through SECURITY DEFINER RPC functions defined in 0005.
--   * RSVP self-edit policies from 0003: unchanged.
--   * operation_log: anon insert + read, no update/delete (immutable).

-- Drop legacy admin-only write policies. We rely on PIN gating + open ops now.
drop policy if exists "admin write members"          on members;
drop policy if exists "admin write venues"           on venues;
drop policy if exists "admin write sessions"         on sessions;
drop policy if exists "admin write pair_history"     on pair_history;
drop policy if exists "admin write match_log"        on match_log;
drop policy if exists "admin write settings"         on settings;
drop policy if exists "admin write admins"           on admins;
drop policy if exists "admin write planned_sessions" on planned_sessions;
drop policy if exists "admin write rsvps (any)"      on rsvps;

-- Session operation: open to anon ----------------------------------
-- sessions: anyone may create a new ongoing session, and update an existing one.
create policy "anon insert sessions" on sessions for insert to anon
  with check (status = 'ongoing');

create policy "anon update sessions" on sessions for update to anon
  using (true) with check (status in ('ongoing', 'past'));

-- match_log: anyone may insert match results.
create policy "anon insert match_log" on match_log for insert to anon
  with check (true);

-- pair_history: anyone may upsert pair statistics (called on end-session).
create policy "anon write pair_history" on pair_history for all to anon
  using (true) with check (true);

-- PIN-gated tables: no direct write policy → all anon writes blocked.
-- (RPC functions in 0005 are SECURITY DEFINER and bypass RLS.)

-- Admin (still readable; writes go through RPC; v1.1 doesn't use this table actively)
-- Keep table for forward-compat with potential v1.5 per-user auth.

-- Operation log -----------------------------------------------------
alter table operation_log enable row level security;
create policy "read operation_log anon" on operation_log for select using (true);
create policy "anon insert operation_log" on operation_log for insert to anon
  with check (true);
-- No update/delete policies → immutable.
