/**
 * Runtime locale switch: an English-speaking club runs the SERVER flavour
 * (IS_LOCAL false) with setLocale("en") at boot, so the GG-only pages must
 * render without a single Japanese character.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/data/supabase-client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const rosterAll = signal([
    { id: 1, name: "Alice", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "Ben", status: "active" as const, createdAt: new Date() },
    { id: 3, name: "Chloe", status: "active" as const, createdAt: new Date() },
  ]);
  return {
    rankingStore: {
      ranking: signal<unknown>({
        elo: new Map([[1, 1550], [2, 1490], [3, 1500]]),
        record: new Map([[1, { win: 5, loss: 2 }], [2, { win: 2, loss: 5 }], [3, { win: 3, loss: 3 }]]),
        pair: new Map([["1:2", { win: 4, loss: 1 }]]),
        attendance: new Map([[1, 10], [2, 1], [3, 5]]),
      }),
      year: signal(2026),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      setYear: vi.fn(),
    },
    rosterStore: {
      all: rosterAll,
      active: computed(() => rosterAll.value),
      archived: computed(() => []),
      load: vi.fn().mockResolvedValue(undefined),
    },
    hostStore: {
      token: signal("host-token"),
      label: signal(""),
      setLabel: vi.fn(),
      isHost: vi.fn().mockReturnValue(false),
    },
    pinStore: {
      isUnlocked: signal(false),
      verifying: signal(false),
      lastError: signal<string | null>(null),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue(null),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent } from "@testing-library/preact";
import { t, setLocale, getLocale, ja, en } from "@/ui/i18n";
import { RankingPage, resetRankingState } from "@/ui/pages/ranking";
import { SettingsPage } from "@/ui/pages/settings";
import { RsvpSummary } from "@/ui/components/rsvp-summary";
import { pinStore } from "@/ui/stores";

const JAPANESE = /[぀-ヿ一-鿿]/;

const p = pinStore as unknown as { isUnlocked: { value: boolean } };

/** Every text node plus the attributes users can see or hear. */
function visibleText(root: Element): string {
  const attrs = [...root.querySelectorAll("[placeholder],[title],[aria-label]")].map((el) =>
    ["placeholder", "title", "aria-label"].map((a) => el.getAttribute(a) ?? "").join(" "),
  );
  return `${root.textContent ?? ""} ${attrs.join(" ")}`;
}

afterEach(() => {
  setLocale("ja");
  resetRankingState();
  p.isUnlocked.value = false;
});

describe("runtime locale", () => {
  it("defaults to ja when VITE_LOCALE is unset", () => {
    expect(getLocale()).toBe("ja");
    expect(t.settings.title).toBe(ja.settings.title);
  });

  it("setLocale('en') makes t return English; setLocale('ja') restores Japanese", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t.common.cancel).toBe("Cancel");
    expect(t.ranking.season(2026)).toBe("2026 season");
    expect(document.documentElement.lang).toBe("en");

    setLocale("ja");
    expect(getLocale()).toBe("ja");
    expect(t.common.cancel).toBe("キャンセル");
    expect(t.ranking.season(2026)).toBe("2026 シーズン");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("t mirrors the current table's sections", () => {
    setLocale("en");
    expect(Object.keys(t)).toEqual(Object.keys(en));
    expect("ranking" in t).toBe(true);
  });

  it("the en table has no Japanese anywhere (server flavour)", () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (typeof v === "function") strings.push(String((v as (...a: unknown[]) => unknown)(1, 2, 3)));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(en);
    const offenders = strings.filter((s) => JAPANESE.test(s));
    expect(offenders).toEqual([]);
  });
});

describe("pages under setLocale('en')", () => {
  it("RankingPage renders no Japanese on any tab", () => {
    setLocale("en");
    const { container, getByTestId } = render(<RankingPage />);
    expect(visibleText(container)).not.toMatch(JAPANESE);
    expect(getByTestId("year-display").textContent).toBe("2026 season");

    fireEvent.click(getByTestId("tab-pair"));
    expect(getByTestId("ranking-pair").textContent).toContain("Alice & Ben");
    expect(visibleText(container)).not.toMatch(JAPANESE);

    fireEvent.click(getByTestId("tab-attendance"));
    const att = getByTestId("ranking-attendance").textContent ?? "";
    expect(att).toContain("10 sessions");
    expect(att).toContain("1 session");
    expect(visibleText(container)).not.toMatch(JAPANESE);
  });

  it("SettingsPage renders no Japanese (locked, unlocked, and with the PIN modal open)", () => {
    setLocale("en");
    const { container, getByTestId, getByText } = render(<SettingsPage />);
    expect(visibleText(container)).not.toMatch(JAPANESE);
    expect(getByText("Locked")).toBeDefined();

    // Rotating the PIN while locked opens the PIN modal.
    fireEvent.input(getByTestId("new-pin-input"), { target: { value: "1234" } });
    fireEvent.click(getByTestId("rotate-pin"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(visibleText(container)).not.toMatch(JAPANESE);
  });

  it("SettingsPage unlocked state is English", () => {
    setLocale("en");
    p.isUnlocked.value = true;
    const { container, getByTestId } = render(<SettingsPage />);
    expect(getByTestId("pin-lock").textContent).toBe("Lock");
    expect(visibleText(container)).not.toMatch(JAPANESE);
  });

  it("RsvpSummary renders no Japanese in either layout", () => {
    setLocale("en");
    const members = [
      { id: 1, name: "Alice", status: "active" as const, createdAt: new Date() },
      { id: 2, name: "Ben", status: "active" as const, createdAt: new Date() },
    ];
    const rsvps = [{ planned_session_id: "ps", member_id: 1, status: "going" as const, note: null }];
    for (const layout of ["lines", "chips"] as const) {
      const { container, unmount } = render(
        <RsvpSummary rsvps={rsvps as never} activeMembers={members as never} layout={layout} />,
      );
      expect(visibleText(container)).not.toMatch(JAPANESE);
      unmount();
    }
  });

  it("switching back to ja restores the Japanese UI", () => {
    setLocale("en");
    setLocale("ja");
    const { getByTestId } = render(<RankingPage />);
    expect(getByTestId("year-display").textContent).toBe("2026 シーズン");
  });
});
