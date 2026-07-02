import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted runs synchronously before the mock factory is hoisted,
// allowing us to share mutable state between the factory and test bodies.
const hoisted = vi.hoisted(() => {
  return {
    nextRoundMock: vi.fn().mockResolvedValue(undefined),
    loadMock: vi.fn().mockResolvedValue(undefined),
  };
});

// The factory must be self-contained — no top-level variable references from
// outside vi.hoisted are allowed because vi.mock is hoisted above all imports.
vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");
  const members = [
    { id: 1, name: "佐藤", status: "active", createdAt: new Date() },
    { id: 2, name: "山本", status: "active", createdAt: new Date() },
  ];

  const allSignal = signal(members);
  const activeSignal = computed(() => allSignal.value.filter((m) => m.status === "active"));

  return {
    rosterStore: {
      all: allSignal,
      active: activeSignal,
      archived: signal([]),
      load: hoisted.loadMock,
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
    },
    sessionStore: {
      session: signal(null),
      generating: signal(false),
      startNewSession: vi.fn(),
      nextRound: hoisted.nextRoundMock,
      recordWinner: vi.fn(),
      endSession: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { NumberMapPage } from "@/ui/pages/number-map";
import { currentPath } from "@/ui/router";
import { sessionStore } from "@/ui/stores";

beforeEach(() => {
  hoisted.nextRoundMock.mockClear();
  hoisted.loadMock.mockClear();
  sessionStore.session.value = null;
  sessionStore.generating.value = false;
  currentPath.value = "/session/number-map";
});

describe("NumberMapPage", () => {
  it("shows the no-session notice when sessionStore.session is null", () => {
    sessionStore.session.value = null;
    const { getByText } = render(<NumberMapPage />);
    expect(getByText(/セッションが開始されていません/)).toBeDefined();
  });

  it("renders attendees with todayNumbers and names", () => {
    sessionStore.session.value = {
      id: "x",
      status: "ongoing",
      plannedSessionId: null,
      date: new Date(),
      location: "test",
      courtCount: 3,
      allowSingles: true,
      attendees: [
        { ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false },
        { ref: { kind: "member", memberId: 2 }, todayNumber: 2, isGuest: false },
      ],
      rounds: [],
      currentRoundIndex: -1,
      todayStats: new Map(),
      prevResters: [],
      rngSeed: 0,
      hostToken: null,
      hostLabel: null,
    };
    const { getByText } = render(<NumberMapPage />);
    expect(getByText("1")).toBeDefined();
    expect(getByText("佐藤")).toBeDefined();
    expect(getByText("2")).toBeDefined();
    expect(getByText("山本")).toBeDefined();
  });

  it("falls back to #memberId when roster name is missing", () => {
    sessionStore.session.value = {
      id: "x",
      status: "ongoing",
      plannedSessionId: null,
      date: new Date(),
      location: "test",
      courtCount: 3,
      allowSingles: true,
      attendees: [{ ref: { kind: "member", memberId: 99 }, todayNumber: 1, isGuest: false }],
      rounds: [],
      currentRoundIndex: -1,
      todayStats: new Map(),
      prevResters: [],
      rngSeed: 0,
      hostToken: null,
      hostLabel: null,
    };
    const { getByText } = render(<NumberMapPage />);
    expect(getByText("#99")).toBeDefined();
  });

  it("clicking start triggers nextRound and navigates to /session/round", async () => {
    sessionStore.session.value = {
      id: "x",
      status: "ongoing",
      plannedSessionId: null,
      date: new Date(),
      location: "test",
      courtCount: 3,
      allowSingles: true,
      attendees: [{ ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false }],
      rounds: [],
      currentRoundIndex: -1,
      todayStats: new Map(),
      prevResters: [],
      rngSeed: 0,
      hostToken: null,
      hostLabel: null,
    };
    const { getByText } = render(<NumberMapPage />);
    fireEvent.click(getByText(/ラウンド開始/));
    await waitFor(() => expect(hoisted.nextRoundMock).toHaveBeenCalled());
    expect(currentPath.value).toBe("/session/round");
  });

  it("alerts and stays on the page when nextRound fails", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    hoisted.nextRoundMock.mockRejectedValueOnce(new Error("offline"));
    sessionStore.session.value = {
      id: "x",
      status: "ongoing",
      plannedSessionId: null,
      date: new Date(),
      location: "test",
      courtCount: 3,
      allowSingles: true,
      attendees: [{ ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false }],
      rounds: [],
      currentRoundIndex: -1,
      todayStats: new Map(),
      prevResters: [],
      rngSeed: 0,
      hostToken: null,
      hostLabel: null,
    };
    const { getByText } = render(<NumberMapPage />);
    fireEvent.click(getByText(/ラウンド開始/));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0]![0]).toMatch(/失敗/);
    expect(currentPath.value).toBe("/session/number-map");
    alertSpy.mockRestore();
  });

  it("disables the start button while a round is being generated", () => {
    sessionStore.session.value = {
      id: "x",
      status: "ongoing",
      plannedSessionId: null,
      date: new Date(),
      location: "test",
      courtCount: 3,
      allowSingles: true,
      attendees: [{ ref: { kind: "member", memberId: 1 }, todayNumber: 1, isGuest: false }],
      rounds: [],
      currentRoundIndex: -1,
      todayStats: new Map(),
      prevResters: [],
      rngSeed: 0,
      hostToken: null,
      hostLabel: null,
    };
    sessionStore.generating.value = true;
    const { getByText } = render(<NumberMapPage />);
    const btn = getByText(/ラウンド開始/).closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
