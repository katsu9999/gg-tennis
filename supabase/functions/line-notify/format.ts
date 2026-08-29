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
// All rounds in one message (GG Shuffle → LINE, at the start of the night)
// ---------------------------------------------------------------------------
//
// 1ラウンド1通だと 2時間6ラウンドで6メッセージ。LINE の無料枠は
// メッセージ数×人数で減るので、グループ(約19人)では114通/回になる。
// 夜のぶんを先に組んで1通で流す。早く終わった夜は残りを使わないだけ。

export interface LineRoundsPayload {
  kind: "rounds";
  rounds: LineRoundPayload[];
}

const MAX_ROUNDS = 12;

export function parseRoundsPayload(body: unknown): LineRoundsPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind !== "rounds") return null;
  if (!Array.isArray(b.rounds) || b.rounds.length === 0 || b.rounds.length > MAX_ROUNDS) {
    return null;
  }
  const rounds: LineRoundPayload[] = [];
  for (const raw of b.rounds) {
    const r = parsePayload(raw);
    if (!r) return null;
    rounds.push(r);
  }
  return { kind: "rounds", rounds };
}

/** Render the whole night:
 *
 *   🎾 今日の組み合わせ（全6ラウンド）
 *
 *   ━━ R1 ━━
 *   🟢 コート1
 *   ①田中・②佐藤 vs ③山本・④鈴木
 *   💤 休憩：⑦高田
 *
 *   ━━ R2 ━━
 *   …
 */
export function formatRoundsMessage(p: LineRoundsPayload): string {
  const blocks: string[] = [`🎾 今日の組み合わせ（全${p.rounds.length}ラウンド）`];
  for (const r of p.rounds) {
    const lines = [`━━ R${r.roundNo} ━━`];
    for (const c of r.courts) {
      const suffix = c.type === "singles" ? "（シングルス）" : "";
      const mark = COURT_MARKS[(c.number - 1) % COURT_MARKS.length];
      lines.push(`${mark} コート${c.number}${suffix}`);
      lines.push(`${c.teamA.join("・")} vs ${c.teamB.join("・")}`);
    }
    if (r.resters.length > 0) lines.push(`💤 休憩：${r.resters.join("・")}`);
    blocks.push(lines.join("\n"));
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
  /**
   * Optional per-hour breakdown. Hendon issues a different gate PIN for every
   * hour, so a 10:00-12:00 block needs two of them — one `gatePin` cannot
   * carry that. When present this replaces the single-PIN line.
   */
  slots?: LineBookingSlot[];
}

export interface LineBookingSlot {
  start: string;
  end: string;
  gatePin?: string;
  /**
   * Which court this hour belongs to, e.g. "コート5". Present when GG Booker
   * sends every account's bookings in one message (Hendon issues a different
   * PIN per court group, so a flat PIN list would be unusable).
   */
  court?: string;
}

// 3コート×3時間＝9枠まで想定し、余裕をみて24。
const MAX_SLOTS = 24;

function parseSlots(raw: unknown): LineBookingSlot[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SLOTS) return null;
  const out: LineBookingSlot[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    const start = cleanField(s.start, 10);
    const end = cleanField(s.end, 10);
    if (!start || !end) return null;
    const slot: LineBookingSlot = { start, end };
    if (s.court !== undefined) {
      const court = cleanField(s.court, 30);
      if (!court) return null;
      slot.court = court;
    }
    // 空文字は「PIN なし」の意味で送られてくる。欠落と同じ扱いにする。
    if (typeof s.gatePin === "string" && s.gatePin.trim() !== "") {
      const pin = cleanField(s.gatePin, 12);
      if (!pin) return null;
      slot.gatePin = pin;
    }
    out.push(slot);
  }
  return out;
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
  const slots = parseSlots(b.slots);
  if (slots === null) return null;
  if (slots) payload.slots = slots;
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
  const withPins = (p.slots ?? []).filter((s) => s.gatePin);
  if (withPins.length > 0) {
    lines.push("", "🔑 ゲートPIN");
    // 複数コートをまとめて送るときはコート見出しで束ねる。PIN はコート系統
    // ごとに違うので、平らに並べるとどれを使うのか分からない。
    if (withPins.some((s) => s.court)) {
      let current = "";
      for (const s of withPins) {
        const court = s.court ?? "";
        if (court !== current) {
          lines.push(`【${court}】`);
          current = court;
        }
        lines.push(`・${s.start}〜${s.end}：${s.gatePin}`);
      }
    } else {
      for (const s of withPins) lines.push(`・${s.start}〜${s.end}：${s.gatePin}`);
    }
  } else if (p.gatePin) {
    lines.push(`🔑 ゲート：${p.gatePin}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Session summary (GG Shuffle → LINE, at "End session")
// ---------------------------------------------------------------------------

export interface LineStanding {
  /** e.g. "①田中" — todayNumber + display name, built by the caller. */
  label: string;
  wins: number;
  losses: number;
}

export interface LineSummaryPayload {
  kind: "summary";
  rounds: number;
  attendees: number;
  standings: LineStanding[];
}

const MAX_STANDINGS = 40;

function wholeCount(raw: unknown, max: number): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > max) {
    return null;
  }
  return raw;
}

export function parseSummaryPayload(body: unknown): LineSummaryPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind !== "summary") return null;

  const rounds = wholeCount(b.rounds, 200);
  const attendees = wholeCount(b.attendees, 200);
  if (rounds === null || attendees === null) return null;

  if (!Array.isArray(b.standings) || b.standings.length === 0 ||
      b.standings.length > MAX_STANDINGS) {
    return null;
  }
  const standings: LineStanding[] = [];
  for (const item of b.standings) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    const label = cleanField(s.label, 40);
    const wins = wholeCount(s.wins, 500);
    const losses = wholeCount(s.losses, 500);
    if (!label || wins === null || losses === null) return null;
    standings.push({ label, wins, losses });
  }
  return { kind: "summary", rounds, attendees, standings };
}

/** Render the end-of-session result. Only the winner is named:
 *
 *   🏆 今日のセッション終了！
 *
 *   🥇 ①田中  5勝1敗
 *
 *   全6ラウンド・参加12名
 *   おつかれさまでした！
 *
 * The app sends the full standings, but the group message names only the top
 * score — a public list of who lost most is not what the day was about. Ties
 * for first are all named. Standings arrive pre-sorted from the app.
 */
export function formatSummaryMessage(p: LineSummaryPayload): string {
  const top = p.standings[0]!.wins;
  const winners = p.standings.filter((s) => s.wins === top);

  const lines = ["🏆 今日のセッション終了！", ""];
  for (const w of winners) lines.push(`🥇 ${w.label}  ${w.wins}勝${w.losses}敗`);
  lines.push("", `全${p.rounds}ラウンド・参加${p.attendees}名`, "おつかれさまでした！");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Court release (GG Booker → LINE, when the headcount doesn't need 3 courts)
// ---------------------------------------------------------------------------

export interface LineReleaseSlot {
  time: string;
  ok: boolean;
  /** Why it failed. Only meaningful when ok is false. */
  reason?: string;
}

export interface LineReleasePayload {
  kind: "release";
  date: string;
  court: string;
  /** Headcount that triggered the release ("◯" on Chouseisan). */
  yes: number;
  slots: LineReleaseSlot[];
}

const MAX_RELEASE_SLOTS = 8;

export function parseReleasePayload(body: unknown): LineReleasePayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.kind !== "release") return null;

  const date = cleanField(b.date, 40);
  const court = cleanField(b.court, 30);
  const yes = wholeCount(b.yes, 200);
  if (!date || !court || yes === null) return null;

  if (!Array.isArray(b.slots) || b.slots.length === 0 ||
      b.slots.length > MAX_RELEASE_SLOTS) {
    return null;
  }
  const slots: LineReleaseSlot[] = [];
  for (const item of b.slots) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    const time = cleanField(s.time, 10);
    if (!time || typeof s.ok !== "boolean") return null;
    const slot: LineReleaseSlot = { time, ok: s.ok };
    if (typeof s.reason === "string" && s.reason.trim() !== "") {
      const reason = cleanField(s.reason, 80);
      if (!reason) return null;
      slot.reason = reason;
    }
    slots.push(slot);
  }
  return { kind: "release", date, court, yes, slots };
}

/** Render the release result:
 *
 *   🟢 コート5 を返却しました
 *
 *   📅 8/15（土）
 *   👥 参加◯ 7名
 *
 *   ✅ 10:00
 *   ✅ 11:00
 *
 * A partial failure gets its own heading. Burying a failed slot inside a
 * success message is how a court nobody released goes unnoticed until the day.
 */
export function formatReleaseMessage(p: LineReleasePayload): string {
  const failed = p.slots.filter((s) => !s.ok);
  const head = failed.length === 0
    ? `🟢 ${p.court} を返却しました`
    : failed.length === p.slots.length
      ? `❌ ${p.court} の返却に失敗（要手動確認）`
      : `⚠️ ${p.court} の返却が一部失敗（要手動確認）`;

  const lines = [head, "", `📅 ${p.date}`, `👥 参加◯ ${p.yes}名`, ""];
  for (const s of p.slots) {
    lines.push(s.ok ? `✅ ${s.time}` : `❌ ${s.time}（${s.reason ?? "理由不明"}）`);
  }
  return lines.join("\n");
}
