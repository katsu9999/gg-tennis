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

/** Render the group message, e.g.
 *
 *   🎾 R3 スタート！
 *   コート1: 田中・佐藤 vs 山本・鈴木
 *   コート2: 高橋 vs 渡辺（シングルス）
 *   休憩: 高田
 */
export function formatRoundMessage(p: LineRoundPayload): string {
  const lines: string[] = [`🎾 R${p.roundNo} スタート！`];
  for (const c of p.courts) {
    const suffix = c.type === "singles" ? "（シングルス）" : "";
    lines.push(`コート${c.number}: ${c.teamA.join("・")} vs ${c.teamB.join("・")}${suffix}`);
  }
  if (p.resters.length > 0) {
    lines.push(`休憩: ${p.resters.join("・")}`);
  }
  return lines.join("\n");
}
