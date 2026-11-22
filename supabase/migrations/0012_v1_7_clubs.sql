-- v1.7 — 複数クラブ（2026-11-22）
--
-- 1つのアプリを複数のクラブで使い、データは混ぜない。
--
-- * settings をクラブ表にする。1行 = 1クラブ。id=1 が GG（既存データは全部 GG）。
--   PIN・シーズン開始月・公開RSVPの既定値は、もともと settings にあったのでそのまま
--   クラブごとの値になる。slug（URL の /c/<slug>）・name・locale・line_enabled を足す。
-- * members / venues / sessions / planned_sessions に club_id。既定値 1 なので、
--   このマイグレーションを当てた直後も、今の（club_id を知らない）アプリは GG として
--   そのまま動く。新しいアプリは常に club_id を明示する。
-- * pair_history は会員 id の組で持っていて、会員はどれか1クラブに属するので
--   クラブをまたいだ組は生まれない＝分ける必要がない。match_log・rsvps は
--   sessions / planned_sessions 経由でクラブが決まる。
-- * PIN で守る RPC は全部 p_club（既定 1）を受け取り、そのクラブの PIN で照合し、
--   そのクラブの行しか触らない。引数名で呼ぶ PostgREST なので、p_club を送らない
--   今のアプリの呼び出しは GG として通る。
-- * settings.club_pin_hash が誰でも読めていたので、列単位で読み取りを絞る
--   （アプリは settings を直接読んでいない）。
-- * create_club: GG の PIN を持つ人（Katsu）が新しいクラブを作る。

-- 1. settings → クラブ表 ---------------------------------------------------

do $$
declare c record;
begin
  -- 0001 の check (id = 1) を外す（自動命名なので定義で探す）
  for c in
    select conname from pg_constraint
    where conrelid = 'public.settings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%id = 1%'
  loop
    execute format('alter table settings drop constraint %I', c.conname);
  end loop;
end $$;

alter table settings add column if not exists slug text;
alter table settings add column if not exists name text;
alter table settings add column if not exists locale text not null default 'ja';
alter table settings add column if not exists line_enabled boolean not null default false;
alter table settings add column if not exists created_at timestamptz not null default now();

update settings
  set slug = 'gg', name = coalesce(name, 'Golders Green Tennis Club'), line_enabled = true
  where id = 1 and slug is null;

alter table settings alter column slug set not null;
alter table settings alter column name set not null;
create unique index if not exists settings_slug_key on settings(slug);
alter table settings drop constraint if exists settings_slug_format;
alter table settings add constraint settings_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,29}$');
alter table settings drop constraint if exists settings_locale_check;
alter table settings add constraint settings_locale_check check (locale in ('ja', 'en'));

create sequence if not exists settings_id_seq owned by settings.id;
select setval('settings_id_seq', greatest((select max(id) from settings), 1));
alter table settings alter column id set default nextval('settings_id_seq');

-- PIN のハッシュは読ませない
revoke select on table settings from anon, authenticated;
grant select (id, slug, name, locale, line_enabled, season_start_month,
              show_going_list_on_public_default, updated_at, created_at)
  on settings to anon, authenticated;

-- 2. club_id -----------------------------------------------------------------

alter table members          add column if not exists club_id int not null default 1 references settings(id);
alter table venues           add column if not exists club_id int not null default 1 references settings(id);
alter table sessions         add column if not exists club_id int not null default 1 references settings(id);
alter table planned_sessions add column if not exists club_id int not null default 1 references settings(id);

create index if not exists members_club_idx          on members(club_id);
create index if not exists venues_club_idx           on venues(club_id);
create index if not exists sessions_club_status_idx  on sessions(club_id, status);
create index if not exists planned_sessions_club_idx on planned_sessions(club_id, date);

-- 会場名はクラブごとに一意（別のクラブが同じ「Hendon」を使えるように）
alter table venues drop constraint if exists venues_name_key;
create unique index if not exists venues_club_name_key on venues(club_id, name);

-- 3. PIN 照合（クラブ別） ------------------------------------------------------

drop function if exists verify_club_pin(text);
create or replace function verify_club_pin(pin_input text, p_club int default 1) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  stored_hash text;
  v_found boolean;
  v_ip text;
  v_key text;
  v_locked timestamptz;
  v_xff text;
  v_xff_parts text[];
  ok boolean;
begin
  select true, club_pin_hash into v_found, stored_hash from settings where id = p_club;
  if v_found is null then
    raise exception 'club_not_found';
  end if;
  -- PIN 未設定は GG の開発時の名残。新しいクラブは create_club で必ず PIN を持つ。
  if stored_hash is null then
    return p_club = 1;
  end if;
  -- NULL は crypt() も比較も NULL になり、呼び出し側の `if not ...` をすり抜ける。
  if pin_input is null or pin_input = '' then
    return false;
  end if;

  begin
    v_ip := current_setting('request.headers', true)::json ->> 'x-real-ip';
    if v_ip is null or v_ip = '' then
      v_xff := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
      if v_xff is not null and v_xff <> '' then
        v_xff_parts := string_to_array(v_xff, ',');
        v_ip := btrim(v_xff_parts[array_length(v_xff_parts, 1)]);
      end if;
    end if;
    if v_ip is null or v_ip = '' then
      v_ip := 'unknown';
    end if;
  exception when others then
    v_ip := 'unknown';
  end;
  -- 失敗回数はクラブごと。IP だけだと、別クラブの正しい PIN で成功させて
  -- このクラブへの失敗回数を消せてしまう。
  v_key := md5(v_ip || ':' || p_club::text);

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
    delete from pin_attempts where last_attempt_at < now() - interval '1 day';
  end if;

  return coalesce(ok, false);
end;
$$;
grant execute on function verify_club_pin(text, int) to anon, authenticated;

drop function if exists set_club_pin(text, text);
create or replace function set_club_pin(p_pin text, p_new_pin text, p_club int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if p_new_pin is null or length(p_new_pin) < 6 then
    raise exception 'pin_too_short';
  end if;
  update settings set club_pin_hash = crypt(p_new_pin, gen_salt('bf')), updated_at = now() where id = p_club;
end;
$$;
grant execute on function set_club_pin(text, text, int) to anon, authenticated;

drop function if exists update_settings(text, int, boolean);
create or replace function update_settings(
  p_pin text,
  p_season_start_month int,
  p_show_going_list_on_public_default boolean,
  p_club int default 1
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  update settings set
    season_start_month = coalesce(p_season_start_month, season_start_month),
    show_going_list_on_public_default = coalesce(p_show_going_list_on_public_default, show_going_list_on_public_default),
    updated_at = now()
  where id = p_club;
end;
$$;
grant execute on function update_settings(text, int, boolean, int) to anon, authenticated;

-- 4. 会員・会場 ----------------------------------------------------------------

drop function if exists upsert_member(text, bigint, text, text, text);
create or replace function upsert_member(
  p_pin text,
  p_id bigint,
  p_name text,
  p_status text,
  p_gender text default 'unknown',
  p_club int default 1
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid_status'; end if;
  if p_gender not in ('male', 'female', 'unknown') then raise exception 'invalid_gender'; end if;
  if p_id is null then
    insert into members(name, status, gender, club_id) values (p_name, p_status, p_gender, p_club)
      returning id into v_id;
  else
    update members set name = p_name, status = p_status, gender = p_gender
      where id = p_id and club_id = p_club returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_member(text, bigint, text, text, text, int) to anon, authenticated;

drop function if exists delete_member(text, bigint);
create or replace function delete_member(p_pin text, p_id bigint, p_club int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  delete from members where id = p_id and club_id = p_club;
end;
$$;
grant execute on function delete_member(text, bigint, int) to anon, authenticated;

drop function if exists upsert_venue(text, bigint, text);
create or replace function upsert_venue(p_pin text, p_id bigint, p_name text, p_club int default 1) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if p_id is null then
    insert into venues(name, club_id) values (p_name, p_club)
      on conflict (club_id, name) do update set name = excluded.name
      returning id into v_id;
  else
    update venues set name = p_name where id = p_id and club_id = p_club returning id into v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_venue(text, bigint, text, int) to anon, authenticated;

drop function if exists delete_venue(text, bigint);
create or replace function delete_venue(p_pin text, p_id bigint, p_club int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  delete from venues where id = p_id and club_id = p_club;
end;
$$;
grant execute on function delete_venue(text, bigint, int) to anon, authenticated;

-- 5. 予定セッション・RSVP --------------------------------------------------------

drop function if exists upsert_planned_session(text, uuid, date, text, int, boolean, boolean);
create or replace function upsert_planned_session(
  p_pin text,
  p_id uuid,
  p_date date,
  p_location text,
  p_court_count int,
  p_allow_singles boolean,
  p_show_going_list_on_public boolean,
  p_club int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if p_id is null then
    insert into planned_sessions(date, location, court_count, allow_singles, show_going_list_on_public, club_id)
      values (p_date, p_location, p_court_count, coalesce(p_allow_singles, true),
              coalesce(p_show_going_list_on_public, true), p_club)
      returning id into v_id;
  else
    update planned_sessions set
      date = coalesce(p_date, date),
      location = coalesce(p_location, location),
      court_count = coalesce(p_court_count, court_count),
      allow_singles = coalesce(p_allow_singles, allow_singles),
      show_going_list_on_public = coalesce(p_show_going_list_on_public, show_going_list_on_public)
    where id = p_id and club_id = p_club
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_planned_session(text, uuid, date, text, int, boolean, boolean, int) to anon, authenticated;

drop function if exists delete_planned_session(text, uuid);
create or replace function delete_planned_session(p_pin text, p_id uuid, p_club int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  delete from planned_sessions where id = p_id and club_id = p_club;
end;
$$;
grant execute on function delete_planned_session(text, uuid, int) to anon, authenticated;

drop function if exists rotate_public_rsvp_token(text, uuid);
create or replace function rotate_public_rsvp_token(p_pin text, p_id uuid, p_club int default 1) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update planned_sessions set public_rsvp_token = v_token where id = p_id and club_id = p_club;
  if not found then raise exception 'not_found'; end if;
  return v_token;
end;
$$;
grant execute on function rotate_public_rsvp_token(text, uuid, int) to anon, authenticated;

drop function if exists revoke_public_rsvp_token(text, uuid);
create or replace function revoke_public_rsvp_token(p_pin text, p_id uuid, p_club int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  update planned_sessions set public_rsvp_token = null where id = p_id and club_id = p_club;
end;
$$;
grant execute on function revoke_public_rsvp_token(text, uuid, int) to anon, authenticated;

drop function if exists admin_upsert_rsvp(text, uuid, bigint, text, text);
create or replace function admin_upsert_rsvp(
  p_pin text,
  p_planned_session_id uuid,
  p_member_id bigint,
  p_status text,
  p_note text,
  p_club int default 1
) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if p_status not in ('going', 'not_going', 'maybe') then raise exception 'invalid_status'; end if;
  if not exists (select 1 from planned_sessions where id = p_planned_session_id and club_id = p_club)
     or not exists (select 1 from members where id = p_member_id and club_id = p_club) then
    raise exception 'not_found';
  end if;

  insert into rsvps (planned_session_id, member_id, status, note, updated_at, updated_by, self_token)
  values (p_planned_session_id, p_member_id, p_status, p_note, now(), 'admin', null)
  on conflict (planned_session_id, member_id) do update
    set status = excluded.status,
        note = excluded.note,
        updated_at = now(),
        updated_by = 'admin';
end;
$$;
grant execute on function admin_upsert_rsvp(text, uuid, bigint, text, text, int) to anon, authenticated;

-- 6. 過去セッション ---------------------------------------------------------------

drop function if exists delete_session(text, uuid);
create or replace function delete_session(p_pin text, p_session_id uuid, p_club int default 1)
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  delete from sessions where id = p_session_id and club_id = p_club;
end;
$$;
grant execute on function delete_session(text, uuid, int) to anon, authenticated;

drop function if exists edit_past_court_winner(text, uuid, int, bigint[], bigint[], text, text, jsonb);
create or replace function edit_past_court_winner(
  p_pin text,
  p_session_id uuid,
  p_round_index int,
  p_team_a bigint[],
  p_team_b bigint[],
  p_court_type text,
  p_winner text,
  p_rounds jsonb,
  p_club int default 1
) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin, p_club) then raise exception 'invalid_pin'; end if;
  if not exists (select 1 from sessions where id = p_session_id and status = 'past' and club_id = p_club) then
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
grant execute on function edit_past_court_winner(text, uuid, int, bigint[], bigint[], text, text, jsonb, int)
  to anon, authenticated;

-- 7. 公開リンクからの出欠: 予定と会員が同じクラブであること -----------------------
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
    join members m on m.id = p_member_id and m.club_id = ps.club_id
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
    raise exception 'rsvp_token_mismatch';
  else
    update rsvps
      set status = p_status, note = p_note, updated_at = now(), updated_by = 'self_public_link'
      where planned_session_id = p_planned_session_id and member_id = p_member_id;
  end if;
end;
$$;
grant execute on function upsert_rsvp_with_token(uuid, bigint, text, text, text) to anon, authenticated;

-- 8. 行はクラブをまたいで移せない --------------------------------------------------
-- セッションの更新は匿名でもできる（試合中の保存）。club_id を書き換えて別クラブへ
-- 移す・別クラブの行を自分のクラブに取り込む、を DB 側で止める。

create or replace function keep_club_id() returns trigger
language plpgsql as $$
begin
  if new.club_id is distinct from old.club_id then
    raise exception 'club_id_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists members_keep_club on members;
create trigger members_keep_club before update on members for each row execute function keep_club_id();
drop trigger if exists venues_keep_club on venues;
create trigger venues_keep_club before update on venues for each row execute function keep_club_id();
drop trigger if exists sessions_keep_club on sessions;
create trigger sessions_keep_club before update on sessions for each row execute function keep_club_id();
drop trigger if exists planned_sessions_keep_club on planned_sessions;
create trigger planned_sessions_keep_club before update on planned_sessions for each row execute function keep_club_id();

-- 9. クラブを作る ------------------------------------------------------------------

create or replace function create_club(
  p_admin_pin text,
  p_slug text,
  p_name text,
  p_locale text,
  p_pin text
) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id int;
begin
  -- 作れるのは GG の PIN を持つ人だけ（無料枠を荒らされないように）
  if not verify_club_pin(p_admin_pin, 1) then raise exception 'invalid_pin'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,29}$' then raise exception 'invalid_slug'; end if;
  if p_slug in ('c', 'admin', 'api', 'rsvp', 'session', 'sessions', 'roster', 'ranking', 'settings') then
    raise exception 'reserved_slug';
  end if;
  if exists (select 1 from settings where slug = p_slug) then raise exception 'slug_taken'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'invalid_name'; end if;
  if p_locale not in ('ja', 'en') then raise exception 'invalid_locale'; end if;
  if p_pin is null or length(p_pin) < 6 then raise exception 'pin_too_short'; end if;

  insert into settings (slug, name, locale, line_enabled, club_pin_hash)
    values (p_slug, btrim(p_name), p_locale, false, crypt(p_pin, gen_salt('bf')))
    returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_club(text, text, text, text, text) to anon, authenticated;
