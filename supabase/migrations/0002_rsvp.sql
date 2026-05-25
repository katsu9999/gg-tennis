-- §5 + §7 — Planned sessions and RSVPs

create table if not exists planned_sessions (
  id                          uuid primary key default gen_random_uuid(),
  date                        date not null,
  location                    text not null,
  court_count                 int  not null check (court_count between 1 and 6),
  allow_singles               boolean not null default true,
  public_rsvp_token           text unique,
  show_going_list_on_public   boolean not null default true,
  created_at                  timestamptz not null default now(),
  created_by                  text -- admin email
);
create index if not exists planned_sessions_date_idx on planned_sessions(date);
create unique index if not exists planned_sessions_token_idx on planned_sessions(public_rsvp_token) where public_rsvp_token is not null;

create table if not exists rsvps (
  planned_session_id  uuid not null references planned_sessions(id) on delete cascade,
  member_id           bigint not null references members(id) on delete cascade,
  status              text not null check (status in ('going', 'not_going', 'maybe')),
  note                text,
  updated_at          timestamptz not null default now(),
  updated_by          text not null check (updated_by in ('admin', 'self_public_link')),
  self_token          text, -- LocalStorage-issued token to allow self-edit via public link
  primary key (planned_session_id, member_id)
);
create index if not exists rsvps_status_idx on rsvps(planned_session_id, status);
