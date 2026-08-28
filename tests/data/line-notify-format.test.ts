import { describe, expect, it } from "vitest";
import {
  parsePayload,
  formatRoundMessage,
  parseBookingPayload,
  formatBookingMessage,
  type LineRoundPayload,
  parseSummaryPayload,
  formatSummaryMessage,
  parseReleasePayload,
  formatReleaseMessage,
} from "../../supabase/functions/line-notify/format";

const valid = (): LineRoundPayload => ({
  roundNo: 3,
  courts: [
    { number: 1, type: "doubles", teamA: ["田中", "佐藤"], teamB: ["山本", "鈴木"] },
    { number: 2, type: "singles", teamA: ["高橋"], teamB: ["渡辺"] },
  ],
  resters: ["高田"],
});

describe("parsePayload", () => {
  it("accepts a well-formed payload", () => {
    expect(parsePayload(valid())).toEqual(valid());
  });

  it("rejects non-objects and missing fields", () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload("hi")).toBeNull();
    expect(parsePayload({})).toBeNull();
    expect(parsePayload({ ...valid(), roundNo: 0 })).toBeNull();
    expect(parsePayload({ ...valid(), roundNo: 1.5 })).toBeNull();
    expect(parsePayload({ ...valid(), courts: [] })).toBeNull();
  });

  it("rejects malformed courts", () => {
    const p = valid();
    expect(parsePayload({ ...p, courts: [{ ...p.courts[0], type: "triples" }] })).toBeNull();
    expect(parsePayload({ ...p, courts: [{ ...p.courts[0], teamA: [] }] })).toBeNull();
    expect(parsePayload({ ...p, courts: [{ ...p.courts[0], teamA: [42] }] })).toBeNull();
    expect(
      parsePayload({ ...p, courts: [{ ...p.courts[0], teamA: ["a".repeat(31), "b"] }] }),
    ).toBeNull();
  });

  it("rejects oversized payloads (court/rester caps)", () => {
    const p = valid();
    const court = p.courts[0]!;
    expect(parsePayload({ ...p, courts: Array.from({ length: 9 }, () => ({ ...court })) })).toBeNull();
    expect(parsePayload({ ...p, resters: Array.from({ length: 31 }, () => "x") })).toBeNull();
  });

  it("strips control characters from names", () => {
    const p = valid();
    p.courts[0]!.teamA = ["田\u0000中", "佐藤"];
    const parsed = parsePayload(p);
    expect(parsed!.courts[0]!.teamA[0]).toBe("田中");
  });
});

describe("formatRoundMessage", () => {
  it("renders one block per court with singles marker and resters", () => {
    expect(formatRoundMessage(valid())).toBe(
      "🎾 R3 スタート！\n\n" +
        "🟢 コート1\n田中・佐藤 vs 山本・鈴木\n\n" +
        "🔵 コート2（シングルス）\n高橋 vs 渡辺\n\n" +
        "💤 休憩：高田",
    );
  });

  it("omits the rest line when nobody rests", () => {
    const p = { ...valid(), resters: [] };
    expect(formatRoundMessage(p)).not.toContain("休憩");
  });
});

describe("booking payload", () => {
  const booking = () => ({
    kind: "booking",
    date: "8/7（金）",
    start: "19:00",
    end: "20:00",
    court: "コート3",
    account: "Katsu",
    gatePin: "1234",
  });

  it("parses a valid booking and renders line-per-field", () => {
    const p = parseBookingPayload(booking())!;
    expect(p).not.toBeNull();
    expect(formatBookingMessage(p)).toBe(
      "✅ コート予約完了！\n\n" +
        "📅 8/7（金）\n" +
        "⏰ 19:00〜20:00\n" +
        "🎾 コート3\n" +
        "👤 予約アカウント：Katsu\n" +
        "🔑 ゲート：1234",
    );
  });

  it("gatePin is optional; missing required fields reject", () => {
    const noPin: Record<string, unknown> = { ...booking() };
    delete noPin.gatePin;
    const p = parseBookingPayload(noPin)!;
    expect(p.gatePin).toBeUndefined();
    expect(formatBookingMessage(p)).not.toContain("ゲート");
    expect(parseBookingPayload({ ...booking(), court: "" })).toBeNull();
    expect(parseBookingPayload({ ...booking(), kind: "round" })).toBeNull();
  });

  it("round payloads without kind are not misparsed as bookings", () => {
    expect(parseBookingPayload(valid())).toBeNull();
  });
});

describe("session summary payload", () => {
  const summary = () => ({
    kind: "summary" as const,
    rounds: 6,
    attendees: 4,
    standings: [
      { label: "①田中", wins: 5, losses: 1 },
      { label: "④鈴木", wins: 4, losses: 2 },
      { label: "②佐藤", wins: 4, losses: 2 },
      { label: "⑦山本", wins: 1, losses: 5 },
    ],
  });

  it("優勝者だけを出す（2位以下は伏せる）", () => {
    const p = parseSummaryPayload(summary())!;
    expect(p).not.toBeNull();
    const msg = formatSummaryMessage(p);
    expect(msg).toContain("🏆 今日のセッション終了！");
    expect(msg).toContain("🥇 ①田中  5勝1敗");
    expect(msg).toContain("全6ラウンド・参加4名");
    // 2位以下は名前も星も出さない
    expect(msg).not.toContain("④鈴木");
    expect(msg).not.toContain("②佐藤");
    expect(msg).not.toContain("⑦山本");
  });

  it("同率1位は全員出す", () => {
    const p = parseSummaryPayload({
      ...summary(),
      standings: [
        { label: "①田中", wins: 5, losses: 1 },
        { label: "④鈴木", wins: 5, losses: 1 },
        { label: "②佐藤", wins: 4, losses: 2 },
      ],
    })!;
    const msg = formatSummaryMessage(p);
    expect(msg).toContain("🥇 ①田中  5勝1敗");
    expect(msg).toContain("🥇 ④鈴木  5勝1敗");
    expect(msg).not.toContain("②佐藤");
  });

  it("rejects malformed payloads", () => {
    expect(parseSummaryPayload({ ...summary(), standings: [] })).toBeNull();
    expect(parseSummaryPayload({ ...summary(), kind: "booking" })).toBeNull();
    expect(parseSummaryPayload({ ...summary(), rounds: -1 })).toBeNull();
    expect(parseSummaryPayload({ ...summary(), standings: [{ label: "", wins: 1, losses: 0 }] })).toBeNull();
    expect(parseSummaryPayload({ roundNo: 1 })).toBeNull();
  });

  it("is not confused with round or booking payloads", () => {
    expect(parseBookingPayload(summary())).toBeNull();
    expect(parseSummaryPayload(valid())).toBeNull();
  });
});

describe("court release payload", () => {
  const release = () => ({
    kind: "release" as const,
    date: "8/15（土）",
    court: "コート5",
    yes: 7,
    slots: [
      { time: "10:00", ok: true },
      { time: "11:00", ok: true },
    ],
  });

  it("全部返せたら成功として出す", () => {
    const p = parseReleasePayload(release())!;
    const msg = formatReleaseMessage(p);
    expect(msg).toContain("🟢 コート5 を返却しました");
    expect(msg).toContain("📅 8/15（土）");
    expect(msg).toContain("👥 参加◯ 7名");
    expect(msg).toContain("✅ 10:00");
  });

  it("一部失敗は見出しで分かるようにする", () => {
    // 失敗を成功に埋めると、残ったコートに誰も気づかず当日を迎える。
    const p = parseReleasePayload({
      ...release(),
      slots: [{ time: "10:00", ok: true }, { time: "11:00", ok: false, reason: "該当なし" }],
    })!;
    const msg = formatReleaseMessage(p);
    expect(msg).toContain("⚠️");
    expect(msg).toContain("要手動確認");
    expect(msg).toContain("❌ 11:00");
    expect(msg).toContain("該当なし");
  });

  it("全部失敗も分かるようにする", () => {
    const p = parseReleasePayload({
      ...release(),
      slots: [{ time: "10:00", ok: false, reason: "x" }],
    })!;
    expect(formatReleaseMessage(p)).toContain("❌ コート5 の返却に失敗");
  });

  it("壊れたペイロードは拒否する", () => {
    expect(parseReleasePayload({ ...release(), slots: [] })).toBeNull();
    expect(parseReleasePayload({ ...release(), yes: -1 })).toBeNull();
    expect(parseReleasePayload({ ...release(), court: "" })).toBeNull();
    expect(parseReleasePayload({ ...release(), slots: [{ time: "10:00" }] })).toBeNull();
    expect(parseReleasePayload(valid())).toBeNull();
  });

  it("他の kind と取り違えない", () => {
    expect(parseBookingPayload(release())).toBeNull();
    expect(parseSummaryPayload(release())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-court booking (GG Booker sends all accounts in one message)
// ---------------------------------------------------------------------------
//
// LINE の無料枠はメッセージ数×人数で減る。1アカウント1通で送ると
// 3コート＝3通（グループ約19人で57通）。1通にまとめるため、slot ごとに
// どのコートかを持たせる。Hendon はコート系統ごとにゲートPINが違うので、
// コートを落とすと誰がどのPINを使うのか分からなくなる。
describe("multi-court booking", () => {
  const multi = () => ({
    kind: "booking",
    date: "9/5（土）",
    start: "11:00",
    end: "13:00",
    court: "コート1・5・6",
    account: "GG Booker",
    slots: [
      { court: "コート1", start: "11:00", end: "12:00", gatePin: "4630679" },
      { court: "コート1", start: "12:00", end: "13:00", gatePin: "8964630" },
      { court: "コート5", start: "11:00", end: "12:00", gatePin: "2883751" },
      { court: "コート5", start: "12:00", end: "13:00", gatePin: "6107822" },
    ],
  });

  it("keeps the court on every slot", () => {
    const p = parseBookingPayload(multi())!;
    expect(p).not.toBeNull();
    expect(p.slots!.map((s) => s.court)).toEqual([
      "コート1", "コート1", "コート5", "コート5",
    ]);
  });

  it("groups the gate PINs under each court", () => {
    const text = formatBookingMessage(parseBookingPayload(multi())!);
    expect(text).toContain("【コート1】");
    expect(text).toContain("【コート5】");
    expect(text).toContain("・11:00〜12:00：4630679");
    expect(text).toContain("・11:00〜12:00：2883751");
    // コート1の見出しはコート5より先に出る
    expect(text.indexOf("【コート1】")).toBeLessThan(text.indexOf("【コート5】"));
  });

  it("still renders a flat list when slots carry no court", () => {
    const p = parseBookingPayload({
      kind: "booking", date: "9/5（土）", start: "11:00", end: "13:00",
      court: "コート5", account: "ReturnAce",
      slots: [{ start: "11:00", end: "12:00", gatePin: "111" }],
    })!;
    const text = formatBookingMessage(p);
    expect(text).toContain("・11:00〜12:00：111");
    expect(text).not.toContain("【");
  });

  it("accepts 3 courts x 3 hours (9 slots)", () => {
    const slots = [];
    for (const c of ["コート1", "コート5", "コート6"]) {
      for (const h of ["11:00", "12:00", "13:00"]) {
        slots.push({ court: c, start: h, end: h, gatePin: "1" });
      }
    }
    expect(parseBookingPayload({ ...multi(), slots })).not.toBeNull();
  });

  it("rejects a slot whose court is not a string", () => {
    const bad = multi();
    (bad.slots[0] as Record<string, unknown>).court = 5;
    expect(parseBookingPayload(bad)).toBeNull();
  });
});
