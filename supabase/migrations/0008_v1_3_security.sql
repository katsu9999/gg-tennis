-- v1.3 — security hardening (2026-07-02 review findings)
--
-- 1. match_log: anon INSERT/DELETE only while the parent session is ongoing.
--    Previously `using (true)` let anyone erase the entire ranking history
--    from the browser console. Past-session edits move to the PIN-gated RPC
--    edit_past_court_winner below.
-- 2. sessions: anon UPDATE only on ongoing rows. endSession's ongoing→past
--    transition still works (USING checks the OLD row); past rows are frozen.
-- 3. rsvps: self_token is no longer readable by anon (column-level grants) —
--    it was leaking every member's self-edit token to any visitor, allowing
--    RSVP impersonation. Direct anon INSERT/UPDATE policies are dropped;
--    writes go through the token-verifying RPC upsert_rsvp_with_token and the
--    PIN-gated admin_upsert_rsvp.
-- 4. verify_club_pin: per-IP rate limiting (5 failures → 15 min lock). A
--    4-digit PIN was brute-forceable in minutes via the open RPC.
-- 5. set_club_pin: minimum length raised 4 → 6.
-- 6. admins: drop public SELECT (leaks admin emails; is_admin() is SECURITY
--    DEFINER and keeps working).

-- 1. match_log ---------------------------------------------------------------

drop policy if exists "anon insert match_log" on match_log;
create policy "anon insert match_log (ongoing)" on match_log for insert to anon
  with check (
    exists (select 1 from sessions s where s.id = session_id and s.status = 'ongoing')
  );

drop policy if exists "anon delete match_log" on match_log;
create policy "anon delete match_log (ongoing)" on match_log for delete to anon
  using (
    exists (select 1 from sessions s where s.id = session_id and s.status = 'ongoing')
  );

-- 2. sessions ----------------------------------------------------------------

drop policy if exists "anon update sessions" on sessions;
create policy "anon update sessions (ongoing)" on sessions for update to anon
  using (status = 'ongoing')
  with check (status in ('ongoing', 'past'));

-- PIN-gated edit of a past court result: atomically replaces the match_log
-- row and stores the updated rounds JSONB. p_winner null clears the result
-- (or signals a guest-only court where no match_log row ever existed).
create or replace function edit_past_court_winner(
  p_pin text,
  p_session_id uuid,
  p_round_index int,
  p_team_a bigint[],
  p_team_b bigint[],
  p_court_type text,
  p_winner text,
  p_rounds jsonb
) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if not exists (select 1 from sessions where id = p_session_id and status = 'past') then
    raise exception 'not_a_past_session';
  end if;
  if p_winner is not null and p_winner not in ('A', 'B') then
    raise exception 'invalid_winner';
  end if;
  if p_court_type not in ('doubles', 'singles') then
    raise exception 'invalid_court_type';
  end if;

  delete from match_log
    where session_id = p_session_id
      and round_index = p_round_index
      and team_a = p_team_a;

  if p_winner is not null and array_length(p_team_a, 1) > 0 and array_length(p_team_b, 1) > 0 then
    insert into match_log (session_id, round_index, court_type, team_a, team_b, winner, played_at)
    values (p_session_id, p_round_index, p_court_type, p_team_a, p_team_b, p_winner, now());
  end if;

  update sessions set rounds = p_rounds where id = p_session_id;
end;
$$;

grant execute on function edit_past_court_winner(text, uuid, int, bigint[], bigint[], text, text, jsonb)
  to anon, authenticated;

-- 3. rsvps -------------------------------------------------------------------

-- Hide self_token from anon reads. The RLS read policy still controls row
-- visibility; the column grant controls which columns can appear in SELECT.
revoke select on table rsvps from anon;
grant select (planned_session_id, member_id, status, note, updated_at, updated_by)
  on rsvps to anon;

-- All anon writes now go through the RPCs below.
drop policy if exists "anon insert rsvp via token" on rsvps;
drop policy if exists "anon update own rsvp" on rsvps;

-- Token-verifying self-RSVP upsert. Unlike the old direct upsert, the token
-- comparison happens server-side, so a forged row can no longer flip another
-- member's RSVP or lock them out by pre-inserting a token they don't hold.
create or replace function upsert_rsvp_with_token(
  p_planned_session_id uuid,
  p_member_id bigint,
  p_status text,
  p_note text,
  p_token text
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_existing_token text;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'invalid_token'; end if;
  if p_status not in ('going', 'not_going', 'maybe') then raise exception 'invalid_status'; end if;
  if not exists (
    select 1 from planned_sessions ps
    where ps.id = p_planned_session_id and ps.public_rsvp_token is not null
  ) then
    raise exception 'invalid_session';
  end if;

  select self_token into v_existing_token
    from rsvps
    where planned_session_id = p_planned_session_id and member_id = p_member_id;

  if not found then
    insert into rsvps (planned_session_id, member_id, status, note, updated_at, updated_by, self_token)
    values (p_planned_session_id, p_member_id, p_status, p_note, now(), 'self_public_link', p_token);
  elsif v_existing_token is distinct from p_token then
    -- Covers both a stolen/guessed token and an admin-entered row (null token):
    -- neither may be overwritten from the public link.
    raise exception 'rsvp_token_mismatch';
  else
    update rsvps
      set status = p_status, note = p_note, updated_at = now(), updated_by = 'self_public_link'
      where planned_session_id = p_planned_session_id and member_id = p_member_id;
  end if;
end;
$$;

grant execute on function upsert_rsvp_with_token(uuid, bigint, text, text, text)
  to anon, authenticated;

-- PIN-gated admin RSVP entry (the old direct upsert violated the anon RLS
-- policies and failed silently — this makes the admin path work AND gated).
create or replace function admin_upsert_rsvp(
  p_pin text,
  p_planned_session_id uuid,
  p_member_id bigint,
  p_status text,
  p_note text
) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_status not in ('going', 'not_going', 'maybe') then raise exception 'invalid_status'; end if;

  insert into rsvps (planned_session_id, member_id, status, note, updated_at, updated_by, self_token)
  values (p_planned_session_id, p_member_id, p_status, p_note, now(), 'admin', null)
  on conflict (planned_session_id, member_id) do update
    set status = excluded.status,
        note = excluded.note,
        updated_at = now(),
        updated_by = 'admin';
end;
$$;

grant execute on function admin_upsert_rsvp(text, uuid, bigint, text, text)
  to anon, authenticated;

-- 4. PIN rate limiting ---------------------------------------------------------

create table if not exists pin_attempts (
  ip_hash         text primary key,
  fail_count      int not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now()
);
alter table pin_attempts enable row level security;
-- No policies + no grants: only SECURITY DEFINER functions touch this table.
revoke all on table pin_attempts from anon, authenticated;

-- verify_club_pin, now volatile (it records failed attempts) and rate-limited:
-- 5 consecutive failures from one IP lock that IP out for 15 minutes.
create or replace function verify_club_pin(pin_input text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  stored_hash text;
  v_ip text;
  v_key text;
  v_locked timestamptz;
  ok boolean;
begin
  select club_pin_hash into stored_hash from settings where id = 1;
  -- Null hash = PIN gating disabled (dev convenience; safe in production only
  -- if the project is private). Operators MUST set the PIN before sharing.
  if stored_hash is null then
    return true;
  end if;

  -- Best-effort client IP from PostgREST request headers (null in SQL editor).
  begin
    v_ip := coalesce(
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
      'unknown'
    );
  exception when others then
    v_ip := 'unknown';
  end;
  v_key := md5(v_ip);

  select locked_until into v_locked from pin_attempts where ip_hash = v_key;
  if v_locked is not null and v_locked > now() then
    raise exception 'pin_locked: too many failed attempts, try again in 15 minutes';
  end if;

  ok := crypt(pin_input, stored_hash) = stored_hash;

  if ok then
    delete from pin_attempts where ip_hash = v_key;
  else
    insert into pin_attempts (ip_hash, fail_count, last_attempt_at)
    values (v_key, 1, now())
    on conflict (ip_hash) do update set
      fail_count = case
        when pin_attempts.last_attempt_at < now() - interval '15 minutes' then 1
        else pin_attempts.fail_count + 1
      end,
      locked_until = case
        when (case
                when pin_attempts.last_attempt_at < now() - interval '15 minutes' then 1
                else pin_attempts.fail_count + 1
              end) >= 5 then now() + interval '15 minutes'
        else null
      end,
      last_attempt_at = now();
    -- Opportunistic cleanup so the table never accumulates stale rows.
    delete from pin_attempts where last_attempt_at < now() - interval '1 day';
  end if;

  return ok;
end;
$$;

-- 5. set_club_pin: minimum length 6 -------------------------------------------

create or replace function set_club_pin(p_pin text, p_new_pin text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_new_pin is null or length(p_new_pin) < 6 then
    raise exception 'pin_too_short';
  end if;
  update settings set club_pin_hash = crypt(p_new_pin, gen_salt('bf')), updated_at = now() where id = 1;
end;
$$;

-- 6. admins ---------------------------------------------------------------------

drop policy if exists "read admins anon" on admins;
