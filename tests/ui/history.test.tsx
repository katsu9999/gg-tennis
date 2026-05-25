import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const sessionSignal = signal<unknown>(null);
  const allSignal = signal([
    { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
    { id: 3, name: "田中", status: "active" as const, createdAt: new Date() },
    { id: 4, name: "鈴木", status: "active" as const, createdAt: new Date() },
  ]);
  return {
    sessionStore: {
      session: sessionSignal,
      startNewSession: vi.fn(),
      nextRound: vi.fn(),
      recordWinner: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn(),
    },
    rosterStore: {
      all: allSignal,
      active: computed(() => allSignal.value),
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

import { render, fireEvent } from "@testing-library/preact";
import { HistoryPage, resetHistoryState } from "@/ui/pages/history";
import { sessionStore } from "@/ui/stores";
import { currentPath } from "@/ui/router";

function makeSession(rounds: number): unknown {
  const baseRound = (idx: number) => ({
    index: idx,
    courts: [
      {
        number: 1,
        type: "doubles" as const,
        teamA: [
          { kind: "member" as const, memberId: 1 },
          { kind: "member" as const, memberId: 2 },
        ],
        teamB: [
          { kind: "member" as const, memberId: 3 },
          { kind: "member" as const, memberId: 4 },
        ],
        winner: "none" as const,
      },
    ],
    resters: [],
  });
  return {
    id: "s1",
    status: "ongoing" as const,
    plannedSessionId: null,
    date: new Date(),
    location: "X",
    courtCount: 1,
    allowSingles: true,
    attendees: [
      { ref: { kind: "member" as const, memberId: 1 }, todayNumber: 7, isGuest: false },
      { ref: { kind: "member" as const, memberId: 2 }, todayNumber: 3, isGuest: false },
      { ref: { kind: "member" as const, memberId: 3 }, todayNumber: 1, isGuest: false },
      { ref: { kind: "member" as const, memberId: 4 }, todayNumber: 5, isGuest: false },
    ],
    rounds: Array.from({ length: rounds }, (_, i) => baseRound(i)),
    currentRoundIndex: rounds - 1,
    todayStats: new Map(),
    prevResters: [],
    rngSeed: 1,
  };
}

beforeEach(() => {
  resetHistoryState();
  currentPath.value = "/session/history";
  (sessionStore.session as { value: unknown }).value = null;
});

describe("HistoryPage", () => {
  it("shows the no-session notice when sessionStore.session is null", () => {
    (sessionStore.session as { value: unknown }).value = null;
    const { getByText } = render(<HistoryPage />);
    expect(getByText(/セッションが開始されていません/)).toBeDefined();
  });

  it("shows the 'no rounds yet' state when session has zero rounds", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(0);
    const { getByText } = render(<HistoryPage />);
    expect(getByText(/履歴なし/)).toBeDefined();
  });

  it("renders the first round with today-numbers by default", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(3);
    const { getByText, container } = render(<HistoryPage />);
    expect(container.textContent).toContain("R1");
    expect(container.textContent).toContain("/ 3");
    expect(getByText("7")).toBeDefined();
    expect(getByText("3")).toBeDefined();
  });

  it("toggling 'name display' shows real member names", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(1);
    const { getByText, getByTestId } = render(<HistoryPage />);
    fireEvent.click(getByTestId("name-toggle"));
    expect(getByText("佐藤")).toBeDefined();
    expect(getByText("山本")).toBeDefined();
  });

  it("next/prev round buttons navigate the cursor", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(3);
    const { container, getByTestId } = render(<HistoryPage />);
    expect(container.textContent).toContain("R1");
    fireEvent.click(getByTestId("next-round"));
    expect(container.textContent).toContain("R2");
    fireEvent.click(getByTestId("prev-round"));
    expect(container.textContent).toContain("R1");
  });

  it("prev button is disabled at the first round", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(2);
    const { getByTestId } = render(<HistoryPage />);
    expect((getByTestId("prev-round") as HTMLButtonElement).disabled).toBe(true);
  });

  it("next button is disabled at the last round", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(2);
    const { getByTestId } = render(<HistoryPage />);
    fireEvent.click(getByTestId("next-round")); // move to R2 (last)
    expect((getByTestId("next-round") as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking '現在のラウンドへ' navigates back to /session/round", () => {
    (sessionStore.session as { value: unknown }).value = makeSession(1);
    const { getByText } = render(<HistoryPage />);
    fireEvent.click(getByText(/現在のラウンドへ/));
    expect(currentPath.value).toBe("/session/round");
  });
});
