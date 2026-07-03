import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const rosterAll = signal([
    { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
  ]);
  const loadPast = vi.fn().mockResolvedValue([]);
  return {
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
    sessionRepo: {
      loadOngoing: vi.fn(),
      loadPast,
      loadById: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteById: vi.fn(),
    },
    matchLogRepo: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      deleteBySession: vi.fn().mockResolvedValue(undefined),
      deleteByRoundCourt: vi.fn().mockResolvedValue(undefined),
      editPastCourtWinner: vi.fn().mockResolvedValue(undefined),
    },
    pinStore: {
      isUnlocked: signal(true),
      verifying: signal(false),
      lastError: signal(null),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue("1234"),
      lock: vi.fn(),
    },
    rankingStore: {
      load: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { PastSessionsPage, resetPastSessionsState } from "@/ui/pages/past-sessions";
import { sessionRepo, matchLogRepo } from "@/ui/stores";

const sr = sessionRepo as unknown as { loadPast: ReturnType<typeof vi.fn> };
const ml = matchLogRepo as unknown as { editPastCourtWinner: ReturnType<typeof vi.fn> };

const sampleSession = {
  id: "s1",
  status: "past" as const,
  planned_session_id: null,
  date: "2026-05-25",
  location: "Golders Hill",
  court_count: 1,
  allow_singles: true,
  attendees: [
    { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
    { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
  ],
  rounds: [
    {
      index: 0,
      courts: [
        {
          number: 1,
          type: "doubles" as const,
          teamA: [{ kind: "member", memberId: 1 }],
          teamB: [{ kind: "member", memberId: 2 }],
          winner: "A" as const,
        },
      ],
      resters: [],
    },
  ],
  today_stats: {},
  next_today_number: 3,
  current_round_index: 0,
  created_at: "2026-05-25T00:00:00Z",
};

beforeEach(() => {
  resetPastSessionsState();
  sr.loadPast.mockReset();
});

describe("PastSessionsPage", () => {
  it("renders the loading state initially", () => {
    sr.loadPast.mockResolvedValue([]);
    const { getByTestId } = render(<PastSessionsPage />);
    expect(getByTestId("past-loading")).toBeDefined();
  });

  it("shows the empty state when no past sessions exist", async () => {
    sr.loadPast.mockResolvedValue([]);
    const { findByText } = render(<PastSessionsPage />);
    expect(await findByText(/まだ過去セッションがありません/)).toBeDefined();
  });

  it("lists past sessions with date and location", async () => {
    sr.loadPast.mockResolvedValue([sampleSession]);
    const { findByTestId } = render(<PastSessionsPage />);
    const card = await findByTestId("past-s1");
    expect(card.textContent).toContain("2026-05-25");
    expect(card.textContent).toContain("Golders Hill");
  });

  it("clicking a session shows its round detail", async () => {
    sr.loadPast.mockResolvedValue([sampleSession]);
    const { findByTestId, getByTestId } = render(<PastSessionsPage />);
    fireEvent.click(await findByTestId("past-s1"));
    expect(getByTestId("past-round-0")).toBeDefined();
  });

  it("back button returns to the list", async () => {
    sr.loadPast.mockResolvedValue([sampleSession]);
    const { findByTestId, queryByTestId, getByTestId } = render(<PastSessionsPage />);
    fireEvent.click(await findByTestId("past-s1"));
    fireEvent.click(getByTestId("past-back"));
    await waitFor(() => expect(queryByTestId("past-round-0")).toBeNull());
    expect(getByTestId("past-s1")).toBeDefined();
  });

  it("editing a past winner goes through the PIN-gated editPastCourtWinner RPC", async () => {
    ml.editPastCourtWinner.mockClear();
    sr.loadPast.mockResolvedValue([sampleSession]);
    const { findByTestId, getByTestId } = render(<PastSessionsPage />);
    fireEvent.click(await findByTestId("past-s1"));

    // Tap team B — winner was "A", so this sets "B".
    fireEvent.click(getByTestId("team-b"));

    await waitFor(() => expect(ml.editPastCourtWinner).toHaveBeenCalled());
    const args = ml.editPastCourtWinner.mock.calls[0]![0] as {
      pin: string;
      sessionId: string;
      roundIndex: number;
      winner: string | null;
      teamA: number[];
      teamB: number[];
    };
    expect(args.pin).toBe("1234");
    expect(args.sessionId).toBe("s1");
    expect(args.roundIndex).toBe(0);
    expect(args.winner).toBe("B");
    expect(args.teamA).toEqual([1]);
    expect(args.teamB).toEqual([2]);
  });
});
