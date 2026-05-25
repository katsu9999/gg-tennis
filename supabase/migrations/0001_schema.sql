-- §7 Data Model — core tables (excluding RSVP, see 0002)

create table if not exists members (
  id            bigserial primary key,
  name          text not null,
  status        text not null check (status in ('active', 'archived')),
  created_at    timestamptz not null default now()
);

create table if not exists venues (
  id            bigserial primary key,
  name          text not null unique
);

create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  status        text not null check (status in ('ongoing', 'past')),
  planned_session_id uuid,
  date          date not null,
  location      text not null,
  court_count   int  not null check (court_count between 1 and 6),
  allow_singles boolean not null default true,
  attendees     jsonb not null default '[]',
  next_today_number int not null default 1,
  rounds        jsonb not null default '[]',
  today_stats   jsonb not null default '{}',
  current_round_index int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_status_idx on sessions(status);
create index if not exists sessions_date_idx on sessions(date desc);

create table if not exists pair_history (
  member_a      bigint not null references members(id) on delete cascade,
  member_b      bigint not null references members(id) on delete cascade,
  partner_w     double precision not null default 0,
  opponent_w    double precision not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (member_a, member_b),
  check (member_a < member_b)
);

create table if not exists match_log (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  round_index     int  not null,
  court_type      text not null check (court_type in ('doubles', 'singles')),
  team_a          bigint[] not null,
  team_b          bigint[] not null,
  winner          text not null check (winner in ('A', 'B')),
  played_at       timestamptz not null
);
create index if not exists match_log_played_at_idx on match_log(played_at);

create table if not exists settings (
  id                    int primary key default 1,
  season_start_month    int not null default 1 check (season_start_month between 1 and 12),
  show_going_list_on_public_default boolean not null default true,
  updated_at            timestamptz not null default now(),
  check (id = 1)
);
insert into settings (id) values (1) on conflict do nothing;

-- Admin allowlist (emails). Future v2 will use auth.users joined with this.
create table if not exists admins (
  email         text primary key,
  added_at      timestamptz not null default now()
);
