-- §11.2 + §17.9 — Row Level Security

alter table members enable row level security;
alter table venues enable row level security;
alter table sessions enable row level security;
alter table pair_history enable row level security;
alter table match_log enable row level security;
alter table settings enable row level security;
alter table admins enable row level security;
alter table planned_sessions enable row level security;
alter table rsvps enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from admins a
    where a.email = (auth.jwt() ->> 'email')
  );
$$;

-- READ: public — everyone with the URL can read these tables.
create policy "read members anon"            on members          for select using (true);
create policy "read venues anon"             on venues           for select using (true);
create policy "read sessions anon"           on sessions         for select using (true);
create policy "read pair_history anon"       on pair_history     for select using (true);
create policy "read match_log anon"          on match_log        for select using (true);
create policy "read settings anon"           on settings         for select using (true);
create policy "read admins anon"             on admins           for select using (true);
create policy "read planned_sessions anon"   on planned_sessions for select using (true);
create policy "read rsvps anon"              on rsvps            for select using (true);

-- WRITE: admin-only by default.
create policy "admin write members"          on members          for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write venues"           on venues           for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write sessions"         on sessions         for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write pair_history"     on pair_history     for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write match_log"        on match_log        for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write settings"         on settings         for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write admins"           on admins           for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write planned_sessions" on planned_sessions for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin write rsvps (any)"      on rsvps            for all to authenticated using (is_admin()) with check (is_admin());

-- WRITE (anon): RSVP only, only on planned_sessions with a non-null public_rsvp_token,
-- and only when self_token is provided (client-issued LocalStorage token for self-edit).
create policy "anon insert rsvp via token" on rsvps for insert to anon
  with check (
    updated_by = 'self_public_link'
    and self_token is not null
    and exists (
      select 1 from planned_sessions ps
      where ps.id = planned_session_id and ps.public_rsvp_token is not null
    )
  );

create policy "anon update own rsvp" on rsvps for update to anon
  using (
    updated_by = 'self_public_link'
    and self_token is not null
  )
  with check (updated_by = 'self_public_link');
