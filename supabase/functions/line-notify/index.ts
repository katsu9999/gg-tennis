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

// Booking confirmations carry a screenshot of the club's "Your bookings" page —
// the only proof that the slot is really held. LINE image messages need a public
// HTTPS URL, so the PNG arrives here as base64 and we park it in Storage. The
// booker never sees a Supabase key; the service role stays inside this function.
const SHOT_BUCKET = "booking-shots";
const MAX_SHOT_BYTES = 3_000_000;

async function uploadShot(base64Png: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("shot upload skipped: storage env missing");
    return null;
  }
  let bytes: Uint8Array;
  try {
    const bin = atob(base64Png);
    if (bin.length > MAX_SHOT_BYTES) {
      console.error("shot upload skipped: too large", bin.length);
      return null;
    }
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    console.error("shot upload skipped: not valid base64");
    return null;
  }

  const name = `${crypto.randomUUID()}.png`;
  const res = await fetch(`${url}/storage/v1/object/${SHOT_BUCKET}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    console.error("shot upload failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  return `${url}/storage/v1/object/public/${SHOT_BUCKET}/${name}`;
}

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

  const messages: Record<string, unknown>[] = [{ type: "text", text }];

  // The screenshot is a nice-to-have: if Storage hiccups, still send the text.
  const rawShot = (body as Record<string, unknown>).imagePng;
  if (booking && typeof rawShot === "string" && rawShot.length > 0) {
    const shotUrl = await uploadShot(rawShot);
    if (shotUrl) {
      messages.push({
        type: "image",
        originalContentUrl: shotUrl,
        previewImageUrl: shotUrl,
      });
    }
  }

  // 呼ばれたこと自体を必ず残す。Supabase の edge ログは取りこぼすので、
  // 「押したのに届かない」を切り分けるにはこちらの関数ログが要る。
  // 宛先は先頭だけ（1:1 の U… とグループの C… を区別できれば十分）。
  const kind = booking ? "booking" : `round:${round!.roundNo}`;
  console.log(`notify start kind=${kind} to=${groupId.slice(0, 5)}… msgs=${messages.length}`);

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: groupId, messages }),
  });
  console.log(`notify done kind=${kind} line_status=${res.status}`);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("LINE push failed", res.status, detail);
    return json(502, { error: "line_push_failed", status: res.status });
  }
  return json(200, { ok: true });
});
