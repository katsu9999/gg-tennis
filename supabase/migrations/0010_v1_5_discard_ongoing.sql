-- v1.5 — allow discarding an ongoing session (2026-08-02).
--
-- Background: 2026-07-18 ended with four 'past' rows for the same morning —
-- three false starts (zero winners recorded) next to the one real session.
-- The round screen now offers 破棄 (discard) when ending a session where no
-- winner was ever recorded; that path DELETEs the ongoing row directly.
--
-- Scope: anon may DELETE only while status='ongoing' — the same trust level
-- as the existing anon UPDATE (ongoing) policy. Past rows stay frozen behind
-- the PIN-gated delete_session RPC. match_log rows cascade via FK (a
-- winner-less session normally has none anyway).

drop policy if exists "anon delete sessions (ongoing)" on sessions;
create policy "anon delete sessions (ongoing)" on sessions for delete to anon
  using (status = 'ongoing');
