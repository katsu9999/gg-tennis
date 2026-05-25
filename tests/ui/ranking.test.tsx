import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const rosterAll = signal([
    { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
    { id: 3, name: "田中", status: "active" as const, createdAt: new Date() },
  ]);

  const rankingSignal = signal<unknown>({
    elo: new Map([[1, 1550], [2, 1490], [3, 1500]]),
    record: new Map([[1, { win: 5, loss: 2 }], [2, { win: 2, loss: 5 }], [3, { win: 3, loss: 3 }]]),
    pair: new Map([
      ["1:2", { win: 4, loss: 1 }],
      ["1:3", { win: 3, loss: 2 }],
    ]),
    attendance: new Map([[1, 10], [2, 8], [3, 5]]),
  });

  const yearSignal = signal(2026);
  const loadingSignal = signal(false);
  const setYearMock = vi.fn().mockImplementation(async (y: number) => {
    yearSignal.value = y;
  });

  return {
    rankingStore: {
      ranking: rankingSignal,
      year: yearSignal,
      loading: loadingSignal,
      load: vi.fn().mockResolvedValue(undefined),
      setYear: setYearMock,
    },
    rosterStore: {
      all: rosterAll,
      active: computed(() => rosterAll.value),
      archived: computed(() => []),
      load: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { RankingPage, resetRankingState } from "@/ui/pages/ranking";
import { rankingStore } from "@/ui/stores";

const rs = rankingStore as unknown as {
  ranking: { value: unknown };
  year: { value: number };
  loading: { value: boolean };
  setYear: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetRankingState();
  rs.year.value = 2026;
  rs.loading.value = false;
  rs.setYear.mockClear();
});

describe("RankingPage", () => {
  it("renders the year display and 3 tabs", () => {
    const { getByTestId } = render(<RankingPage />);
    expect(getByTestId("year-display").textContent).toContain("2026");
    expect(getByTestId("tab-elo")).toBeDefined();
    expect(getByTestId("tab-pair")).toBeDefined();
    expect(getByTestId("tab-attendance")).toBeDefined();
  });

  it("year-prev clicks setYear with year-1", async () => {
    const { getByTestId } = render(<RankingPage />);
    fireEvent.click(getByTestId("year-prev"));
    await waitFor(() => expect(rs.setYear).toHaveBeenCalledWith(2025));
  });

  it("year-next is disabled when at the current year", () => {
    const { getByTestId } = render(<RankingPage />);
    const btn = getByTestId("year-next") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("elo tab shows members sorted by score descending", () => {
    const { getByTestId } = render(<RankingPage />);
    const list = getByTestId("ranking-elo");
    const items = list.querySelectorAll("li");
    expect(items[0]!.textContent).toContain("佐藤");
    expect(items[0]!.textContent).toContain("1550");
    expect(items[1]!.textContent).toContain("田中");
    expect(items[2]!.textContent).toContain("山本");
  });

  it("clicking the pair tab shows pair winrates", () => {
    const { getByTestId } = render(<RankingPage />);
    fireEvent.click(getByTestId("tab-pair"));
    const list = getByTestId("ranking-pair");
    expect(list.textContent).toContain("佐藤");
    expect(list.textContent).toContain("山本");
    expect(list.textContent).toContain("80%");
  });

  it("clicking the attendance tab shows session counts", () => {
    const { getByTestId } = render(<RankingPage />);
    fireEvent.click(getByTestId("tab-attendance"));
    const list = getByTestId("ranking-attendance");
    expect(list.textContent).toContain("佐藤");
    expect(list.textContent).toContain("10回");
  });

  it("shows loading indicator when loading is true", () => {
    rs.loading.value = true;
    const { getByTestId } = render(<RankingPage />);
    expect(getByTestId("ranking-loading")).toBeDefined();
  });

  it("shows empty pair list message when no pairs meet the threshold", () => {
    (rs.ranking.value as { pair: Map<string, unknown> }).pair = new Map();
    const { getByTestId } = render(<RankingPage />);
    fireEvent.click(getByTestId("tab-pair"));
    expect(getByTestId("ranking-pair").textContent).toContain("最低3試合のペア");
  });
});
