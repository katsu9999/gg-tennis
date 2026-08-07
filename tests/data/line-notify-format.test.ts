import { describe, expect, it } from "vitest";
import {
  parsePayload,
  formatRoundMessage,
  parseBookingPayload,
  formatBookingMessage,
  type LineRoundPayload,
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
