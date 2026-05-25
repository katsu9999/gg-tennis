import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Member } from "@/engine/models";

// vi.hoisted runs synchronously before the mock factory is hoisted,
// allowing us to share mutable state between the factory and test bodies.
const hoisted = vi.hoisted(() => {
  // We can't import from the module here; use plain objects and let the mock
  // factory use them directly.
  return {
    isAdminValue: { current: true as boolean },
    startNewSessionMock: vi.fn().mockResolvedValue(undefined),
    venueAddMock: vi.fn().mockResolvedValue(undefined),
    venueListMock: vi.fn().mockResolvedValue(["Golders Hill", "Hampstead"]),
    loadMock: vi.fn().mockResolvedValue(undefined),
  };
});

// The factory must be self-contained — no top-level variable references from
// outside vi.hoisted are allowed because vi.mock is hoisted above all imports.
vi.mock("@/ui/stores", async () => {
  const { signal, computed } = await import("@preact/signals");

  const members: Member[] = [
    { id: 1, name: "佐藤", status: "active", createdAt: new Date() },
    { id: 2, name: "山本", status: "active", createdAt: new Date() },
    { id: 3, name: "田中", status: "active", createdAt: new Date() },
  ];

  const allSignal = signal<Member[]>(members);
  const activeSignal = computed(() => allSignal.value.filter(m => m.status === "active"));
  const archivedSignal = computed(() => allSignal.value.filter(m => m.status === "archived"));
  const isAdminSignal = signal(hoisted.isAdminValue.current);

  // Re-sync isAdmin signal from the mutable ref on every access by wrapping
  // in a getter so tests can update it via hoisted.isAdminValue.current.
  // Simpler: expose the signal directly from hoisted so tests mutate it.
  // We'll swap to that pattern — hoist the signal itself.
  // (Signals are objects; vi.hoisted returns them by reference fine.)

  return {
    rosterStore: {
      all: allSignal,
      active: activeSignal,
      archived: archivedSignal,
      load: hoisted.loadMock,
      add: vi.fn(),
      rename: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      hardDelete: vi.fn(),
    },
    sessionStore: {
      session: signal(null),
      startNewSession: hoisted.startNewSessionMock,
      nextRound: vi.fn(),
      recordWinner: vi.fn(),
      endSession: vi.fn(),
    },
    venueRepo: {
      list: hoisted.venueListMock,
      add: hoisted.venueAddMock,
    },
    authStore: {
      email: signal("admin@example.com"),
      isAdmin: isAdminSignal,
      loading: signal(false),
      init: vi.fn(),
      signInWithMagicLink: vi.fn(),
      signOut: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { NewSessionPage, resetFormState } from "@/ui/pages/new-session";
import { currentPath } from "@/ui/router";
// Import the mocked stores so we can access isAdmin signal directly.
import { authStore } from "@/ui/stores";

beforeEach(() => {
  hoisted.startNewSessionMock.mockClear();
  hoisted.venueAddMock.mockClear();
  authStore.isAdmin.value = true;
  currentPath.value = "/session/new";
  // Reset module-scoped form signals between tests to prevent state leakage.
  resetFormState();
});

describe("NewSessionPage", () => {
  it("renders admin-only notice when not signed in as admin", () => {
    authStore.isAdmin.value = false;
    const { getByText } = render(<NewSessionPage />);
    expect(getByText(/幹事のみ/)).toBeDefined();
  });

  it("renders form sections when admin", async () => {
    const { getByText, findByText } = render(<NewSessionPage />);
    await waitFor(() => expect(getByText("日付")).toBeDefined());
    expect(getByText("会場")).toBeDefined();
    expect(getByText("コート数 (1-6)")).toBeDefined();
    expect(await findByText("佐藤")).toBeDefined();
  });

  it("submit is disabled until at least 2 members and location are set", async () => {
    const { getByText, findByTestId } = render(<NewSessionPage />);
    const btn = getByText(/次へ：番号を抽選/).closest("button")!;
    expect(btn.disabled).toBe(true);
    // Select 2 members but no location
    fireEvent.click(await findByTestId("member-1"));
    fireEvent.click(await findByTestId("member-2"));
    expect(btn.disabled).toBe(true);
  });

  it("submit calls sessionStore.startNewSession and navigates", async () => {
    const { getByText, findByTestId, container } = render(<NewSessionPage />);

    // Wait for initial render to stabilise (loadAux is async).
    await waitFor(() => expect(container.querySelector('input[type="text"]')).toBeTruthy());

    // Fill in location.
    // testing-library's fireEvent.input does Object.assign(node, target) before
    // dispatching, so e.currentTarget.value will be the new value inside onInput.
    const locInput = container.querySelector('input[type="text"]')! as HTMLInputElement;
    fireEvent.input(locInput, { target: { value: "Golders Hill" } });

    // Wait for Preact to re-render with updated location signal.
    await waitFor(() => expect(locInput.value).toBe("Golders Hill"));

    // Select 2 members
    fireEvent.click(await findByTestId("member-1"));
    fireEvent.click(await findByTestId("member-2"));

    // Wait until button becomes enabled
    const btn = getByText(/次へ：番号を抽選/).closest("button")!;
    await waitFor(() => expect(btn.disabled).toBe(false));

    fireEvent.click(btn);

    await waitFor(() => expect(hoisted.startNewSessionMock).toHaveBeenCalled());
    expect(hoisted.startNewSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      location: "Golders Hill",
      memberIds: expect.arrayContaining([1, 2]),
      courtCount: 3,
      allowSingles: true,
    }));
    // navigate() is called after the async venueRepo.add() resolves, so wait for it.
    await waitFor(() => expect(currentPath.value).toBe("/session/number-map"));
  });
});
