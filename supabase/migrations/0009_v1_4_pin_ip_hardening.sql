-- 0009_v1_4_pin_ip_hardening.sql
-- Security fix (2026-07-12, review HIGH-1): the PIN rate limiter keyed on the
-- FIRST entry of X-Forwarded-For, which the client fully controls. An attacker
-- rotating `X-Forwarded-For: <random>` on every request never trips the 5-fail
-- lockout and can brute-force the PIN.
--
-- Fix: prefer `x-real-ip`, which the Supabase gateway injects and the client
-- cannot override. Fall back to the LAST segment of `x-forwarded-for` (the
-- entry appended by the trusted proxy), never the first (client-supplied) one.
--
-- Only the IP-resolution block of verify_club_pin changes; the lockout logic
-- (5 fails → 15 min) is unchanged.

create or replace function verify_club_pin(pin_input text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  stored_hash text;
  v_ip text;
  v_key text;
  v_locked timestamptz;
  v_xff text;
  v_xff_parts text[];
  ok boolean;
begin
  select club_pin_hash into stored_hash from settings where id = 1;
  -- Null hash = PIN gating disabled (dev convenience; safe in production only
  -- if the project is private). Operators MUST set the PIN before sharing.
  if stored_hash is null then
    return true;
  end if;

  -- Trusted client IP. x-real-ip is set by the gateway and is not
  -- client-spoofable. x-forwarded-for CAN be forged by the client, but the
  -- trusted proxy APPENDS the real IP as the last element, so only the last
  -- segment is safe to trust — never split_part(..., 1).
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
