-- v1.6: gender-balance shuffle
-- 1) members.gender — 男/女/未設定
alter table members add column if not exists gender text not null default 'unknown'
  check (gender in ('male', 'female', 'unknown'));

-- 2) sessions.shuffle_config — 開始時のシャッフルルールのスナップショット
alter table sessions add column if not exists shuffle_config jsonb;

-- 3) upsert_member gains p_gender. The old 4-arg signature is dropped; the new
--    one defaults p_gender so not-yet-deployed clients keep working.
drop function if exists upsert_member(text, bigint, text, text);
create or replace function upsert_member(
  p_pin text,
  p_id bigint,
  p_name text,
  p_status text,
  p_gender text default 'unknown'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid_status'; end if;
  if p_gender not in ('male', 'female', 'unknown') then raise exception 'invalid_gender'; end if;
  if p_id is null then
    insert into members(name, status, gender) values (p_name, p_status, p_gender) returning id into v_id;
  else
    update members set name = p_name, status = p_status, gender = p_gender where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function upsert_member(text, bigint, text, text, text) to anon, authenticated;
