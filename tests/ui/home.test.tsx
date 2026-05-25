import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import type { Member } from "@/engine/models";
import type { PlannedSessionRow } from "@/data/planned-session-repository";
import type { RsvpRow } from "@/data/rsvp-repository";

const hoisted = vi.hoisted(() => {
  return {
    nextSignal: null as unknown as import("@preact/signals").Signal<PlannedSessionRow | null>,
    bySessionSignal: null as unknown as import("@preact/signals").Signal<Map<string, RsvpRow[]>>,
    liveSignal: null as unknown as import("@preact/signals").Signal<unknown>,
    allMembersSignal: null as unknown as import("@preact/signals").Signal<Member[]>,
    activeMembersSignal: null as unknown as import("@preact/signals").Signal<Member[]>,
    loadNextMock: vi.fn().mockResolvedValue(undefined),
    loadForSessionMock: vi.fn().mockResolvedValue([]),
    rosterLoadMock: vi.fn().mockResolvedValue(undefined),
    liveRefreshMock: vi.fn().mockResolvedValue(undefined),
    liveSubscribeMock: vi.fn(),
    liveUnsubscribeMock: vi.fn(),
  };
});

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");

  const members: Member[] = [
    { id: 1, name: "佐藤", status: "active", createdAt: new Date() },
    { id: 2, name: "山本", status: "active", createdAt: new Date() },
  ];

  const nextSig = signal<PlannedSessionRow | null>(null);
  const bySessionSig = signal<Map<string, RsvpRow[]>>(new Map());
  const allSig = signal<Member[]>(members);
  const activeSig = computed(() => allSig.value.filter(m => m.status === "active"));
  const liveSig = signal<unknown>(null);

  // Store references into hoisted so tests can mutate them
  hoisted.nextSignal = nextSig;
  hoisted.bySessionSignal = bySessionSig;
  hoisted.allMembersSignal = allSig;
  hoisted.activeMembersSignal = activeSig as unknown as import("@preact/signals").Signal<Member[]>;
  hoisted.liveSignal = liveSig;

  return {
    plannedSessionStore: {
      list: signal([]),
      next: nextSig,
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      loadNext: hoisted.loadNextMock,
      create: vi.fn(),
      rotateToken: vi.fn(),
      delete: vi.fn(),
    },
    rsvpStore: {
      bySession: bySessionSig,
      loadForSession: hoisted.loadForSessionMock,
      adminUpsert: vi.fn(),
      publicUpsertWithToken: vi.fn(),
      countsFor: vi.fn().mockReturnValue({ going: 0, not_going: 0, maybe: 0 }),
      goingMemberIds: vi.fn().mockReturnValue([]),
    },
    rosterStore: {
      all: allSig,
      active: activeSig,
      archived: computed(() => []),
      load: hoisted.rosterLoadMock,
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
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
      verify: vi.fn().mockResolvedValue(false),
      getPin: vi.fn().mockReturnValue(null),
      lock: vi.fn(),
    },
    liveSessionStore: {
      current: liveSig,
      refresh: hoisted.liveRefreshMock,
      subscribe: hoisted.liveSubscribeMock,
      unsubscribe: hoisted.liveUnsubscribeMock,
    },
    venueRepo: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
    },
    sessionStore: {
      session: signal(null),
      startNewSession: vi.fn().mockResolvedValue(undefined),
      nextRound: vi.fn(),
      recordWinner: vi.fn(),
      endSession: vi.fn(),
    },
  };
});

import { HomePage } from "@/ui/pages/home";
import { currentPath } from "@/ui/router";

beforeEach(() => {
  hoisted.loadNextMock.mockClear();
  hoisted.loadForSessionMock.mockClear();
  hoisted.rosterLoadMock.mockClear();
  hoisted.liveRefreshMock.mockClear();
  hoisted.liveSubscribeMock.mockClear();
  hoisted.liveUnsubscribeMock.mockClear();
  // Reset signals to defaults
  hoisted.nextSignal.value = null;
  hoisted.bySessionSignal.value = new Map();
  hoisted.liveSignal.value = null;
});

describe("HomePage", () => {
  it("renders the GG header and next-session card", () => {
    const { getByText, getByTestId } = render(<HomePage />);
    expect(getByText("GG")).toBeDefined();
    expect(getByText("Tennis Court Shuffle")).toBeDefined();
    expect(getByTestId("next-session-card")).toBeDefined();
  });

  it("renders all 6 nav buttons", () => {
    const { getByText } = render(<HomePage />);
    expect(getByText("セッション開始 →")).toBeDefined();
    expect(getByText(/将来セッション\s*\(準備中\)/)).toBeDefined();
    expect(getByText("名簿")).toBeDefined();
    expect(getByText("ランキング")).toBeDefined();
    expect(getByText("過去セッション")).toBeDefined();
    expect(getByText("設定")).toBeDefined();
  });

  it("clicking 'セッション開始' navigates to /session/new", () => {
    const { getByText } = render(<HomePage />);
    fireEvent.click(getByText("セッション開始 →"));
    expect(currentPath.value).toBe("/session/new");
  });

  it("renders empty next-session state when there are no planned sessions", async () => {
    // next.value is null by default (set in beforeEach)
    const { getByTestId } = render(<HomePage />);
    const card = getByTestId("next-session-card");
    expect(card.textContent).toContain("まだ将来セッションがありません");
  });

  it("renders a planned session's date/location and going-list when present", async () => {
    const plannedSession: PlannedSessionRow = {
      id: "ps1",
      date: "2025-09-10",
      location: "Golders Hill",
      court_count: 3,
      allow_singles: true,
      public_rsvp_token: "tok456",
      show_going_list_on_public: true,
      created_at: "2025-08-01T00:00:00Z",
      created_by: null,
    };
    const goingRsvp: RsvpRow = {
      planned_session_id: "ps1",
      member_id: 1,
      status: "going",
      note: null,
      updated_at: "2025-08-01T00:00:00Z",
      updated_by: "admin" as const,
      self_token: null,
    };

    hoisted.nextSignal.value = plannedSession;
    hoisted.bySessionSignal.value = new Map([["ps1", [goingRsvp]]]);

    const { getByTestId } = render(<HomePage />);

    // Wait for async useEffect to run (loadNext + loadForSession)
    await waitFor(() => {
      const card = getByTestId("next-session-card");
      return card.textContent?.includes("Golders Hill");
    });

    const card = getByTestId("next-session-card");
    expect(card.textContent).toContain("2025-09-10");
    expect(card.textContent).toContain("Golders Hill");
    // 佐藤 (member 1) should appear in the chip list
    expect(card.textContent).toContain("佐藤");
  });
});
