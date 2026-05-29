-- v1.2 — allow winner-deselect and past-session deletion.
--
-- Two changes:
--   1. Allow anon DELETE on match_log so the round screen can clear a winner
--      by tapping the same team twice (the toggle path inserts the new winner
--      after first deleting any prior row for that court).
--   2. Add a PIN-gated RPC delete_session(p_pin, p_session_id) so operators
--      can remove a past session from history. The match_log FK cascades, so
--      we only need to delete the sessions row.

-- 1. anon delete on match_log -----------------------------------------------
drop policy if exists "anon delete match_log" on match_log;
create policy "anon delete match_log" on match_log for delete to anon using (true);

-- 2. PIN-gated session deletion --------------------------------------------
create or replace function delete_session(p_pin text, p_session_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  delete from sessions where id = p_session_id;
end;
$$;

grant execute on function delete_session(text, uuid) to anon, authenticated;
