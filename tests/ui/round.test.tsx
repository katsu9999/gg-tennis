import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Member, Round } from "@/engine/models";

// The factory must be self-contained — no top-level variable references from
// outside vi.hoisted are allowed because vi.mock is hoisted above all imports.
vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");

  const members: Member[] = [
    { id: 1, name: "佐藤", status: "active", createdAt: new Date() },
    { id: 2, name: "山本", status: "active", createdAt: new Date() },
    { id: 3, name: "田中", status: "active", createdAt: new Date() },
    { id: 4, name: "鈴木", status: "active", createdAt: new Date() },
  ];

  const allSignal = signal(members);
  const activeSignal = computed(() => allSignal.value.filter((m) => m.status === "active"));

  return {
    rosterStore: {
      all: allSignal,
      active: activeSignal,
      archived: signal([] as Member[]),
      load: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
    },
    sessionStore: {
      session: signal(null),
      startNewSession: vi.fn(),
      nextRound: vi.fn().mockResolvedValue(undefined),
      goToPreviousRound: vi.fn(),
      cancelCurrentRound: vi.fn().mockResolvedValue(undefined),
      recordWinner: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { RoundPage } from "@/ui/pages/round";
import { currentPath } from "@/ui/router";
import { sessionStore } from "@/ui/stores";

function makeRound(): Round {
  return {
    index: 0,
    courts: [
      {
        number: 1,
        type: "doubles",
        teamA: [
          { kind: "member", memberId: 1 },
          { kind: "member", memberId: 2 },
        ],
        teamB: [
          { kind: "member", memberId: 3 },
          { kind: "member", memberId: 4 },
        ],
        winner: "none",
      },
    ],
    resters: [],
  };
}

function makeSession(round: Round, resters: { kind: "member"; memberId: number }[] = []) {
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
    rounds: [{ ...round, resters }],
    currentRoundIndex: 0,
    todayStats: new Map(),
    prevResters: [],
    rngSeed: 1,
      hostToken: null,
      hostLabel: null,
  };
}

beforeEach(async () => {
  vi.mocked(sessionStore.recordWinner).mockClear();
  vi.mocked(sessionStore.nextRound).mockClear();
  vi.mocked(sessionStore.goToPreviousRound).mockClear();
  vi.mocked(sessionStore.cancelCurrentRound).mockClear();
  vi.unstubAllGlobals();
  sessionStore.session.value = null;
  currentPath.value = "/session/round";
  const { resetRoundState } = await import("@/ui/pages/round");
  resetRoundState();
});

describe("RoundPage", () => {
  it("shows the no-session notice when sessionStore.session is null", () => {
    sessionStore.session.value = null;
    const { getByText } = render(<RoundPage />);
    expect(getByText(/セッションが開始されていません/)).toBeDefined();
  });

  it("shows a 'preparing' fallback when there is a session but no current round", () => {
    sessionStore.session.value = { ...makeSession(makeRound()), rounds: [], currentRoundIndex: 0 };
    const { getByText } = render(<RoundPage />);
    expect(getByText(/準備中/)).toBeDefined();
  });

  it("renders the round header with R-number and rounds count", () => {
    sessionStore.session.value = makeSession(makeRound());
    const { container } = render(<RoundPage />);
    expect(container.textContent).toContain("R1");
    expect(container.textContent).toMatch(/R1 \/ 1/);
  });

  it("renders each court via CourtView with the today-numbers shown", () => {
    sessionStore.session.value = makeSession(makeRound());
    const { getByText } = render(<RoundPage />);
    // teamA today-numbers are 7 and 3
    expect(getByText("7")).toBeDefined();
    expect(getByText("3")).toBeDefined();
  });

  it("shows the rester bar with today-numbers when resters exist", () => {
    const r = makeRound();
    sessionStore.session.value = makeSession(r, [{ kind: "member", memberId: 4 }]);
    const { getByTestId } = render(<RoundPage />);
    const bar = getByTestId("rester-bar");
    expect(bar.textContent).toContain("休憩");
    expect(bar.textContent).toContain("5"); // memberId 4 → todayNumber 5
  });

  it("does NOT show the rester bar when there are no resters", () => {
    sessionStore.session.value = makeSession(makeRound());
    const { queryByTestId } = render(<RoundPage />);
    expect(queryByTestId("rester-bar")).toBeNull();
  });

  it("tapping team A calls sessionStore.recordWinner(courtNumber, 'A')", async () => {
    sessionStore.session.value = makeSession(makeRound());
    const { getAllByTestId } = render(<RoundPage />);
    // CourtView renders [data-testid='team-a']
    const a = getAllByTestId("team-a")[0]!;
    fireEvent.click(a);
    await waitFor(() => expect(sessionStore.recordWinner).toHaveBeenCalled());
    expect(sessionStore.recordWinner).toHaveBeenCalledWith(1, "A");
  });

  it("clicking next-round calls sessionStore.nextRound (after confirm when no result yet)", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    sessionStore.session.value = makeSession(makeRound());
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("next-round-btn"));
    await waitFor(() => expect(sessionStore.nextRound).toHaveBeenCalled());
  });

  it("clicking next-round on a result-less latest round asks for confirmation; cancel aborts", () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmFn);
    sessionStore.session.value = makeSession(makeRound());
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("next-round-btn"));
    expect(confirmFn).toHaveBeenCalledOnce();
    expect(sessionStore.nextRound).not.toHaveBeenCalled();
  });

  it("clicking next-round needs NO confirmation once a winner is recorded", async () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmFn);
    const r = makeRound();
    r.courts[0]!.winner = "A";
    sessionStore.session.value = makeSession(r);
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("next-round-btn"));
    await waitFor(() => expect(sessionStore.nextRound).toHaveBeenCalled());
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("clicking next-round needs NO confirmation when browsing back through rounds", async () => {
    const confirmFn = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmFn);
    const base = makeSession(makeRound());
    sessionStore.session.value = {
      ...base,
      rounds: [base.rounds[0]!, base.rounds[0]!],
      currentRoundIndex: 0, // browsing an earlier round
    };
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("next-round-btn"));
    await waitFor(() => expect(sessionStore.nextRound).toHaveBeenCalled());
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("shows このラウンドを取り消す on a result-less latest round and calls cancelCurrentRound", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    sessionStore.session.value = makeSession(makeRound());
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("cancel-round-btn"));
    await waitFor(() => expect(sessionStore.cancelCurrentRound).toHaveBeenCalled());
  });

  it("hides the cancel button once a winner is recorded", () => {
    const r = makeRound();
    r.courts[0]!.winner = "B";
    sessionStore.session.value = makeSession(r);
    const { queryByTestId } = render(<RoundPage />);
    expect(queryByTestId("cancel-round-btn")).toBeNull();
  });

  it("hides the cancel button when browsing an earlier round", () => {
    const base = makeSession(makeRound());
    sessionStore.session.value = {
      ...base,
      rounds: [base.rounds[0]!, base.rounds[0]!],
      currentRoundIndex: 0,
    };
    const { queryByTestId } = render(<RoundPage />);
    expect(queryByTestId("cancel-round-btn")).toBeNull();
  });

  it("cancel button confirm dismissal does NOT call cancelCurrentRound", () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    sessionStore.session.value = makeSession(makeRound());
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("cancel-round-btn"));
    expect(sessionStore.cancelCurrentRound).not.toHaveBeenCalled();
  });

  it("clicking 前のラウンド calls goToPreviousRound", () => {
    const base = makeSession(makeRound());
    sessionStore.session.value = {
      ...base,
      rounds: [base.rounds[0]!, base.rounds[0]!],
      currentRoundIndex: 1,
    };
    const { getByTestId } = render(<RoundPage />);
    fireEvent.click(getByTestId("prev-round-btn"));
    expect(sessionStore.goToPreviousRound).toHaveBeenCalled();
  });

  it("前のラウンド is disabled on round 0", () => {
    sessionStore.session.value = makeSession(makeRound());
    const { getByTestId } = render(<RoundPage />);
    const btn = getByTestId("prev-round-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
