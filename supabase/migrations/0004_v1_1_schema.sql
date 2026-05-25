-- v1.1 Model A — schema additions
-- 1) session host label (LocalStorage token + optional display name)
-- 2) club PIN hash on settings
-- 3) operation_log for audit trail
-- 4) enable pgcrypto for PIN hashing

create extension if not exists pgcrypto;

-- Sessions: host attribution (label only; operation remains open to everyone)
alter table sessions add column if not exists host_token text;
alter table sessions add column if not exists host_label text;

-- Settings: club PIN (bcrypt hash). Null = PIN gating disabled (dev convenience).
alter table settings add column if not exists club_pin_hash text;

-- Audit log: immutable trail of writes performed via the app.
create table if not exists operation_log (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_token text,
  actor_label text,
  op          text not null,
  target_kind text,
  target_id   text,
  payload     jsonb not null default '{}'
);
create index if not exists operation_log_occurred_at_idx on operation_log(occurred_at desc);
create index if not exists operation_log_op_idx on operation_log(op);
