/**
 * Pure payload validation + message formatting for the line-notify Edge
 * Function. No Deno APIs here so the same code is unit-tested with vitest
 * (tests/data/line-notify-format.test.ts) and typechecked by the app tsconfig.
 */

export interface LineRoundCourt {
  number: number;
  type: "doubles" | "singles";
  teamA: string[];
  teamB: string[];
}

export interface LineRoundPayload {
  roundNo: number;
  courts: LineRoundCourt[];
  resters: string[];
}

const MAX_COURTS = 8;
const MAX_TEAM = 4;
const MAX_RESTERS = 30;
const MAX_NAME_LEN = 30;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control characters; keep it one line.
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (s.length === 0 || s.length > MAX_NAME_LEN) return null;
  return s;
}

/** Parse + validate an unknown request body. Returns null when malformed —
 *  the caller answers 400 and nothing reaches the LINE group. */
export function parsePayload(body: unknown): LineRoundPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const roundNo = b.roundNo;
  if (typeof roundNo !== "number" || !Number.isInteger(roundNo) || roundNo < 1 || roundNo > 99) {
    return null;
  }

  if (!Array.isArray(b.courts) || b.courts.length === 0 || b.courts.length > MAX_COURTS) {
    return null;
  }
  const courts: LineRoundCourt[] = [];
  for (const raw of b.courts) {
    if (typeof raw !== "object" || raw === null) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.number !== "number" || !Number.isInteger(c.number) || c.number < 1 || c.number > 99) {
      return null;
    }
    if (c.type !== "doubles" && c.type !== "singles") return null;
    if (!Array.isArray(c.teamA) || !Array.isArray(c.teamB)) return null;
    if (c.teamA.length < 1 || c.teamA.length > MAX_TEAM) return null;
    if (c.teamB.length < 1 || c.teamB.length > MAX_TEAM) return null;
    const teamA = c.teamA.map(cleanName);
    const teamB = c.teamB.map(cleanName);
    if (teamA.some((n) => n === null) || teamB.some((n) => n === null)) return null;
    courts.push({
      number: c.number,
      type: c.type,
      teamA: teamA as string[],
      teamB: teamB as string[],
    });
  }

  if (!Array.isArray(b.resters) || b.resters.length > MAX_RESTERS) return null;
  const resters = b.resters.map(cleanName);
  if (resters.some((n) => n === null)) return null;

  return { roundNo, courts, resters: resters as string[] };
}

/** Render the round message with one block per court:
 *
 *   🎾 R3 スタート！
 *
 *   ▶ コート1
 *   ①田中・②佐藤 vs ③山本・④鈴木
 *
 *   ▶ コート2（シングルス）
 *   ⑤高橋 vs ⑥渡辺
 *
 *   💤 休憩：⑦高田
 */
const COURT_MARKS = ["🟢", "🔵", "🟠", "🟣", "🟡", "🔴", "🟤", "⚪"];

export function formatRoundMessage(p: LineRoundPayload): string {
  const blocks: string[] = [`🎾 R${p.roundNo} スタート！`];
  for (const c of p.courts) {
    const suffix = c.type === "singles" ? "（シングルス）" : "";
    const mark = COURT_MARKS[(c.number - 1) % COURT_MARKS.length];
    blocks.push(`${mark} コート${c.number}${suffix}\n${c.teamA.join("・")} vs ${c.teamB.join("・")}`);
  }
  if (p.resters.length > 0) {
    blocks.push(`💤 休憩：${p.resters.join("・")}`);
  }
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Booking result (GG Booker → LINE)
// ---------------------------------------------------------------------------

export interface LineBookingPayload {
  kind: "booking";
  /** e.g. "8/7（金）" — display string, built by the caller. */
  date: string;
  /** e.g. "19:00" / "20:00" */
  start: string;
  end: string;
  /** e.g. "コート3" */
  court: string;
  /** Which account made the booking, e.g. "Katsu" */
  account: string;
  /** Optional gate code for the venue entrance. */
  gatePin?: string;
}

function cleanField(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (s.length === 0 || s.length > maxLen) return null;
  return s;
}

export function parseBookingPayload(body: unknown): LineBookingPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind !== "booking") return null;
  const date = cleanField(b.date, 40);
  const start = cleanField(b.start, 10);
  const end = cleanField(b.end, 10);
  const court = cleanField(b.court, 30);
  const account = cleanField(b.account, 30);
  if (!date || !start || !end || !court || !account) return null;
  const payload: LineBookingPayload = { kind: "booking", date, start, end, court, account };
  if (b.gatePin !== undefined) {
    const pin = cleanField(b.gatePin, 12);
    if (!pin) return null;
    payload.gatePin = pin;
  }
  return payload;
}

/** Render the booking confirmation:
 *
 *   ✅ コート予約完了！
 *
 *   📅 8/7（金）
 *   ⏰ 19:00〜20:00
 *   🎾 コート3
 *   👤 予約アカウント：Katsu
 *   🔑 ゲート：1234
 */
export function formatBookingMessage(p: LineBookingPayload): string {
  const lines = [
    "✅ コート予約完了！",
    "",
    `📅 ${p.date}`,
    `⏰ ${p.start}〜${p.end}`,
    `🎾 ${p.court}`,
    `👤 予約アカウント：${p.account}`,
  ];
  if (p.gatePin) lines.push(`🔑 ゲート：${p.gatePin}`);
  return lines.join("\n");
}
