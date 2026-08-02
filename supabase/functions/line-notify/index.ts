/**
 * line-notify — push the current round's court assignments to the club's
 * LINE group (LINE Messaging API).
 *
 * POST { roundNo, courts: [{number, type, teamA, teamB}], resters } →
 * formats the message server-side and pushes it to LINE_GROUP_ID.
 *
 * Secrets (supabase secrets set …):
 *   LINE_CHANNEL_ACCESS_TOKEN — Messaging API long-lived channel token
 *   LINE_GROUP_ID             — target group (captured once via line-webhook)
 *
 * Deployed with verify_jwt=false (see supabase/config.toml): the PWA calls
 * this directly from the browser and the sb_publishable API key is not a JWT.
 * Guard rails instead: strict payload validation (nothing free-form reaches
 * the group) + best-effort rate limit per isolate.
 */

import {
  parsePayload,
  formatRoundMessage,
  parseBookingPayload,
  formatBookingMessage,
} from "./format.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Best-effort rate limit: isolates are ephemeral, so this resets on cold
// start — fine as a spam brake, not a security boundary.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
let windowStart = 0;
let windowCount = 0;

function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > MAX_PER_WINDOW;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (rateLimited()) {
    return json(429, { error: "rate_limited" });
  }

  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  const groupId = Deno.env.get("LINE_GROUP_ID");
  if (!token || !groupId) {
    return json(500, { error: "not_configured", detail: "LINE secrets missing" });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  // Two message kinds share this function: round announcements from the
  // shuffle PWA (no `kind` field) and booking confirmations from GG Booker
  // (`kind: "booking"`).
  const booking = parseBookingPayload(body);
  const round = booking ? null : parsePayload(body);
  if (!booking && !round) {
    return json(400, { error: "invalid_payload" });
  }
  const text = booking ? formatBookingMessage(booking) : formatRoundMessage(round!);

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("LINE push failed", res.status, detail);
    return json(502, { error: "line_push_failed", status: res.status });
  }
  return json(200, { ok: true });
});
