-- v1.1 Model A — RPC functions for PIN-gated destructive operations
-- All functions:
--   * are SECURITY DEFINER (bypass RLS)
--   * verify the club PIN first
--   * have a stable search_path

-- PIN verification helper
create or replace function verify_club_pin(pin_input text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  stored_hash text;
begin
  select club_pin_hash into stored_hash from settings where id = 1;
  -- Null hash = PIN gating disabled (dev convenience; safe in production only if
  -- the project is private). Operators MUST set the PIN before sharing the URL.
  if stored_hash is null then
    return true;
  end if;
  return crypt(pin_input, stored_hash) = stored_hash;
end;
$$;

-- Settings ----------------------------------------------------------
create or replace function set_club_pin(p_pin text, p_new_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_new_pin is null or length(p_new_pin) < 4 then
    raise exception 'pin_too_short';
  end if;
  update settings set club_pin_hash = crypt(p_new_pin, gen_salt('bf')), updated_at = now() where id = 1;
end;
$$;

create or replace function update_settings(
  p_pin text,
  p_season_start_month int,
  p_show_going_list_on_public_default boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  update settings set
    season_start_month = coalesce(p_season_start_month, season_start_month),
    show_going_list_on_public_default = coalesce(p_show_going_list_on_public_default, show_going_list_on_public_default),
    updated_at = now()
  where id = 1;
end;
$$;

-- Members -----------------------------------------------------------
create or replace function upsert_member(
  p_pin text,
  p_id bigint,
  p_name text,
  p_status text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid_status'; end if;
  if p_id is null then
    insert into members(name, status) values (p_name, p_status) returning id into v_id;
  else
    update members set name = p_name, status = p_status where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function delete_member(p_pin text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  delete from members where id = p_id;
end;
$$;

-- Venues ------------------------------------------------------------
create or replace function upsert_venue(p_pin text, p_id bigint, p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_id is null then
    insert into venues(name) values (p_name) returning id into v_id;
  else
    update venues set name = p_name where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function delete_venue(p_pin text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  delete from venues where id = p_id;
end;
$$;

-- Planned sessions --------------------------------------------------
create or replace function upsert_planned_session(
  p_pin text,
  p_id uuid,
  p_date date,
  p_location text,
  p_court_count int,
  p_allow_singles boolean,
  p_show_going_list_on_public boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_id is null then
    insert into planned_sessions(date, location, court_count, allow_singles, show_going_list_on_public)
      values (p_date, p_location, p_court_count, coalesce(p_allow_singles, true), coalesce(p_show_going_list_on_public, true))
      returning id into v_id;
  else
    update planned_sessions set
      date = coalesce(p_date, date),
      location = coalesce(p_location, location),
      court_count = coalesce(p_court_count, court_count),
      allow_singles = coalesce(p_allow_singles, allow_singles),
      show_going_list_on_public = coalesce(p_show_going_list_on_public, show_going_list_on_public)
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function delete_planned_session(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  delete from planned_sessions where id = p_id;
end;
$$;

create or replace function rotate_public_rsvp_token(p_pin text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update planned_sessions set public_rsvp_token = v_token where id = p_id;
  return v_token;
end;
$$;

create or replace function revoke_public_rsvp_token(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  update planned_sessions set public_rsvp_token = null where id = p_id;
end;
$$;

-- Grants ------------------------------------------------------------
grant execute on function verify_club_pin(text) to anon, authenticated;
grant execute on function set_club_pin(text, text) to anon, authenticated;
grant execute on function update_settings(text, int, boolean) to anon, authenticated;
grant execute on function upsert_member(text, bigint, text, text) to anon, authenticated;
grant execute on function delete_member(text, bigint) to anon, authenticated;
grant execute on function upsert_venue(text, bigint, text) to anon, authenticated;
grant execute on function delete_venue(text, bigint) to anon, authenticated;
grant execute on function upsert_planned_session(text, uuid, date, text, int, boolean, boolean) to anon, authenticated;
grant execute on function delete_planned_session(text, uuid) to anon, authenticated;
grant execute on function rotate_public_rsvp_token(text, uuid) to anon, authenticated;
grant execute on function revoke_public_rsvp_token(text, uuid) to anon, authenticated;
