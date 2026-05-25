/**
 * RLS integration tests — verify that the Postgres policies in
 * `supabase/migrations/0003_rls.sql` and the `rsvp_protect_self_token` trigger
 * actually enforce GDPR §17.9 + the v1 trust model in §17.6.
 *
 * These tests SKIP unless `SUPABASE_LOCAL_URL` and `SUPABASE_LOCAL_ANON_KEY`
 * are set, because they need a real Postgres + PostgREST stack to run RLS.
 *
 * ## How to run locally
 *
 * 1. One-time tooling:
 *    brew install supabase/tap/supabase
 *    (Docker Desktop must also be installed and running.)
 *
 * 2. Start the emulator from the project root:
 *    supabase start
 *
 *    This applies `supabase/migrations/*` and `supabase/seed.sql`, then prints
 *    URLs and keys.
 *
 * 3. Export the env vars and run:
 *    eval $(supabase status --output env | grep -E 'API_URL|ANON_KEY')
 *    SUPABASE_LOCAL_URL=$API_URL SUPABASE_LOCAL_ANON_KEY=$ANON_KEY \
 *      npm run test:rls
 *
 *    (Or set the env directly if you prefer.)
 *
 * 4. When done:
 *    supabase stop
 *
 * If the env vars are missing, this whole suite skips silently — that's the
 * default for CI and dev machines without Docker.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_LOCAL_URL ?? "";
const ANON = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const HAS_EMULATOR = Boolean(URL && ANON);

const TEST_PLANNED_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const TEST_MEMBER_ID = 1;
const TEST_SELF_TOKEN = "test-self-token";
const ATTACKER_SELF_TOKEN = "attacker-token";

describe.skipIf(!HAS_EMULATOR)("RLS — anon write protection (GDPR §17.9)", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(URL, ANON);
  });

  // Clean up any rsvp rows we created so re-runs are idempotent.
  afterAll(async () => {
    // We can't delete as anon (RLS), so this requires the service role —
    // for v1 the user manually resets with `supabase db reset`. No automatic cleanup.
  });

  it("anon cannot insert into members", async () => {
    const { error } = await anon.from("members").insert({ name: "Sneaky", status: "active" });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/row-level security|permission|denied|policy/i);
  });

  it("anon cannot insert into sessions", async () => {
    const { error } = await anon.from("sessions").insert({
      status: "ongoing",
      date: "2026-06-01",
      location: "Anywhere",
      court_count: 3,
      allow_singles: true,
    });
    expect(error).toBeTruthy();
  });

  it("anon cannot insert into planned_sessions", async () => {
    const { error } = await anon.from("planned_sessions").insert({
      date: "2026-06-01",
      location: "Sneaky",
      court_count: 3,
      allow_singles: true,
    });
    expect(error).toBeTruthy();
  });

  it("anon CAN insert rsvp through the public-link path with self_token", async () => {
    // Clean any prior row first (admin would; we just upsert below).
    const { error } = await anon.from("rsvps").insert({
      planned_session_id: TEST_PLANNED_SESSION_ID,
      member_id: TEST_MEMBER_ID,
      status: "going",
      updated_by: "self_public_link",
      self_token: TEST_SELF_TOKEN,
    });
    // Either inserts or fails on the PK conflict if the row already exists from a prior run.
    if (error && !/duplicate key|conflict/i.test(error.message)) {
      throw new Error(`anon insert path unexpectedly blocked by RLS: ${error.message}`);
    }
  });

  it("anon cannot insert rsvp with updated_by='admin' (RLS rejects)", async () => {
    const { error } = await anon.from("rsvps").insert({
      planned_session_id: TEST_PLANNED_SESSION_ID,
      member_id: TEST_MEMBER_ID,
      status: "going",
      updated_by: "admin",
      self_token: TEST_SELF_TOKEN,
    });
    expect(error).toBeTruthy();
  });

  it("anon cannot insert rsvp without self_token (RLS rejects)", async () => {
    const { error } = await anon.from("rsvps").insert({
      planned_session_id: TEST_PLANNED_SESSION_ID,
      member_id: 999,
      status: "going",
      updated_by: "self_public_link",
      self_token: null,
    });
    expect(error).toBeTruthy();
  });

  it("anon CANNOT rotate another row's self_token (trigger blocks)", async () => {
    // Try to update the row we created above and change its self_token.
    const { error } = await anon
      .from("rsvps")
      .update({ self_token: ATTACKER_SELF_TOKEN, status: "not_going" })
      .eq("planned_session_id", TEST_PLANNED_SESSION_ID)
      .eq("member_id", TEST_MEMBER_ID);
    // The DB trigger raises an exception which Supabase surfaces as an error.
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/self_token is immutable/i);
  });
});
