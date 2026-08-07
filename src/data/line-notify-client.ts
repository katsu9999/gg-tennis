import type { LineRoundPayload, LineSummaryPayload } from "../../supabase/functions/line-notify/format";

export type { LineRoundPayload, LineSummaryPayload };

/**
 * Thin client for the line-notify Edge Function. Plain fetch on purpose —
 * no @supabase/supabase-js import, so pulling this into the shared UI pages
 * keeps the local (device-only) flavour's import graph clean.
 */
export async function sendLineNotify(payload: LineRoundPayload): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("VITE_SUPABASE_URL is not set");
  const res = await fetch(`${base}/functions/v1/line-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`line-notify ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/** Same endpoint, end-of-session standings payload. */
export async function sendLineSummary(payload: LineSummaryPayload): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("VITE_SUPABASE_URL is not set");
  const res = await fetch(`${base}/functions/v1/line-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`line-notify ${res.status}: ${detail.slice(0, 200)}`);
  }
}
