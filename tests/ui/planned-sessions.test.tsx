import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");

  const plannedList = signal<unknown[]>([]);
  const plannedNext = signal<unknown | null>(null);
  const rsvpsBySession = signal<Map<string, unknown[]>>(new Map());
  const rosterAll = signal([
    { id: 1, name: "佐藤", status: "active" as const, createdAt: new Date() },
    { id: 2, name: "山本", status: "active" as const, createdAt: new Date() },
  ]);

  return {
    plannedSessionStore: {
      list: plannedList,
      next: plannedNext,
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      loadNext: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
        const row = {
          id: "p1",
          created_at: new Date().toISOString(),
          ...input,
        };
        plannedList.value = [...plannedList.value, row];
        return row;
      }),
      rotateToken: vi.fn().mockImplementation(async (id: string) => {
        const token = `token-${id}`;
        plannedList.value = plannedList.value.map((p) =>
          (p as { id: string }).id === id ? { ...(p as object), public_rsvp_token: token } : p,
        );
        return token;
      }),
      delete: vi.fn().mockImplementation(async (id: string) => {
        plannedList.value = plannedList.value.filter((p) => (p as { id: string }).id !== id);
      }),
    },
    rsvpStore: {
      bySession: rsvpsBySession,
      loadForSession: vi.fn().mockResolvedValue([]),
      adminUpsert: vi.fn().mockImplementation(async (row: { planned_session_id: string; member_id: number; status: string }) => {
        const existing = rsvpsBySession.value.get(row.planned_session_id) ?? [];
        const without = existing.filter((r) => (r as { member_id: number }).member_id !== row.member_id);
        const next = new Map(rsvpsBySession.value);
        next.set(row.planned_session_id, [...without, { ...row, note: null, updated_at: new Date().toISOString(), updated_by: "admin", self_token: null }]);
        rsvpsBySession.value = next;
      }),
      publicUpsertWithToken: vi.fn().mockResolvedValue(undefined),
      countsFor: () => ({ going: 0, not_going: 0, maybe: 0 }),
      goingMemberIds: () => [],
    },
    rosterStore: {
      all: rosterAll,
      active: computed(() => rosterAll.value.filter((m) => m.status === "active")),
      archived: computed(() => []),
      load: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
    },
    pinStore: {
      isUnlocked: signal(true),
      verifying: signal(false),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue("test-pin"),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { PlannedSessionsPage, resetPlannedSessionsState } from "@/ui/pages/planned-sessions";
import { plannedSessionStore, rsvpStore, pinStore } from "@/ui/stores";

const ps = plannedSessionStore as unknown as {
  list: { value: { id: string; date: string; location: string; public_rsvp_token: string | null }[] };
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  rotateToken: ReturnType<typeof vi.fn>;
};
const rs = rsvpStore as unknown as {
  adminUpsert: ReturnType<typeof vi.fn>;
  bySession: { value: Map<string, unknown[]> };
};
const p = pinStore as unknown as {
  isUnlocked: { value: boolean };
  getPin: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetPlannedSessionsState();
  ps.list.value = [];
  ps.create.mockClear();
  ps.delete.mockClear();
  ps.rotateToken.mockClear();
  rs.adminUpsert.mockClear();
  rs.bySession.value = new Map();
  p.isUnlocked.value = true;
  p.getPin.mockReturnValue("test-pin");
  // Stub clipboard
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("PlannedSessionsPage", () => {
  it("renders empty-state when no planned sessions", () => {
    const { getByText } = render(<PlannedSessionsPage />);
    expect(getByText(/まだ将来セッションがありません/)).toBeDefined();
  });

  it("create button is disabled when location is cleared", () => {
    const { getByTestId } = render(<PlannedSessionsPage />);
    const btn = getByTestId("planned-create") as HTMLButtonElement;
    // Default location is "Hendon" — button starts enabled.
    expect(btn.disabled).toBe(false);
    // Clearing the location disables it.
    fireEvent.input(getByTestId("planned-location"), { target: { value: "" } });
    expect((getByTestId("planned-create") as HTMLButtonElement).disabled).toBe(true);
  });

  it("filling form and clicking create calls plannedSessionStore.create with PIN", async () => {
    const { getByTestId } = render(<PlannedSessionsPage />);
    fireEvent.input(getByTestId("planned-location"), { target: { value: "Golders Hill" } });
    fireEvent.click(getByTestId("planned-create"));
    await waitFor(() => expect(ps.create).toHaveBeenCalled());
    const call = ps.create.mock.calls[0]!;
    const input = call[0] as { location: string; court_count: number };
    expect(input.location).toBe("Golders Hill");
    expect(input.court_count).toBe(3);
    expect(call[1]).toBe("test-pin");
  });

  it("after creation, the session appears in the list", async () => {
    const { getByTestId, findByTestId } = render(<PlannedSessionsPage />);
    fireEvent.input(getByTestId("planned-location"), { target: { value: "Golders Hill" } });
    fireEvent.click(getByTestId("planned-create"));
    expect(await findByTestId("planned-p1")).toBeDefined();
  });

  it("setting an RSVP calls rsvpStore.adminUpsert with the right shape", async () => {
    ps.list.value = [
      { id: "p1", date: "2026-06-01", location: "Golders", public_rsvp_token: null },
    ];
    const { getByTestId } = render(<PlannedSessionsPage />);
    fireEvent.click(getByTestId("rsvp-set-p1-1-going"));
    await waitFor(() => expect(rs.adminUpsert).toHaveBeenCalled());
    const call = rs.adminUpsert.mock.calls[0]![0] as { planned_session_id: string; member_id: number; status: string };
    expect(call.planned_session_id).toBe("p1");
    expect(call.member_id).toBe(1);
    expect(call.status).toBe("going");
    // Admin RSVP entry is a PIN-gated RPC — the PIN must be passed through.
    expect(rs.adminUpsert.mock.calls[0]![1]).toBe("test-pin");
  });

  it("copy-link button rotates and copies a fresh token when none exists, passing PIN", async () => {
    ps.list.value = [
      { id: "p1", date: "2026-06-01", location: "Golders", public_rsvp_token: null },
    ];
    const { getByTestId } = render(<PlannedSessionsPage />);
    fireEvent.click(getByTestId("planned-copy-link-p1"));
    await waitFor(() => expect(ps.rotateToken).toHaveBeenCalledWith("p1", "test-pin"));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("delete confirm calls plannedSessionStore.delete with PIN", async () => {
    ps.list.value = [
      { id: "p1", date: "2026-06-01", location: "Golders", public_rsvp_token: null },
    ];
    // Stub window.confirm
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { getByTestId } = render(<PlannedSessionsPage />);
    fireEvent.click(getByTestId("planned-delete-p1"));
    await waitFor(() => expect(ps.delete).toHaveBeenCalledWith("p1", "test-pin"));
    vi.unstubAllGlobals();
  });
});
