/**
 * Integration tests for the LOCAL flavour pages: the REAL local composition
 * root (stores.local.ts over fake-indexeddb) drives the real pages, exactly
 * as the Vite alias wires them in a VITE_FLAVOR=local build.
 *
 * This is the regression net for P5 finding #2: shared pages call
 * plannedSessionStore.loadNext() / liveSessionStore.subscribe() /
 * rankingStore.load() unconditionally on mount — undefined stores would
 * crash at startup.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";

vi.mock("@/flavor", () => ({
  FLAVOR: "local",
  IS_LOCAL: true,
  BRAND: "Court Shuffle",
}));
vi.mock("@/ui/stores", () => import("@/ui/stores.local"));
// Drive the pages with the EN table, exactly as VITE_LOCALE=en builds do —
// this is the en "snapshot" net (testids alone can't catch interpolation
// mistakes or missed extractions).
vi.mock("@/ui/i18n", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/ui/i18n")>();
  return { ...mod, LOCALE: "en", t: mod.en };
});

import { HomePage } from "@/ui/pages/home";
import { RoundPage } from "@/ui/pages/round";
import { SettingsLocalPage } from "@/ui/pages/settings-local";
import { PrivacyPage } from "@/ui/pages/privacy";
import { sessionStore } from "@/ui/stores";
import { appDialog } from "@/ui/components/app-dialog";
import type { InMemorySession } from "@/state/session-store";

function ongoingSession(): InMemorySession {
  return {
    id: "s-local-1",
    status: "ongoing",
    plannedSessionId: null,
    date: new Date(),
    location: "Local Park",
    courtCount: 1,
    allowSingles: false,
    attendees: [1, 2, 3, 4].map((id) => ({
      ref: { kind: "member" as const, memberId: id },
      todayNumber: id,
      isGuest: false,
    })),
    rounds: [
      {
        index: 0,
        courts: [
          {
            number: 1,
            type: "doubles" as const,
            teamA: [{ kind: "member" as const, memberId: 1 }, { kind: "member" as const, memberId: 2 }],
            teamB: [{ kind: "member" as const, memberId: 3 }, { kind: "member" as const, memberId: 4 }],
            winner: "none" as const,
          },
        ],
        resters: [],
      },
    ],
    currentRoundIndex: 0,
    todayStats: new Map(),
    prevResters: [],
    rngSeed: 42,
    hostToken: null,
    hostLabel: null,
  };
}

beforeEach(() => {
  sessionStore.session.value = null;
});

describe("HomePage (local flavour, real local stores)", () => {
  it("mounts without crashing and shows the generic brand", async () => {
    const { container, queryByText } = render(<HomePage />);
    // Mount effect fires loadNext/refresh/subscribe on the stubs — give the
    // microtasks a tick and assert nothing blew up.
    await waitFor(() => expect(container.textContent).toContain("Court Shuffle"));
    expect(queryByText("GG")).toBeNull();
  });

  it("hides server-only UI: next-session card, planned + ranking nav", async () => {
    const { container, queryByText } = render(<HomePage />);
    await waitFor(() => expect(container.textContent).toContain("Court Shuffle"));
    expect(container.querySelector('[data-testid="next-session-card"]')).toBeNull();
    expect(queryByText(/Planned/)).toBeNull();
    expect(queryByText("Rankings")).toBeNull();
    // Core shuffle nav stays — in English.
    expect(queryByText("Roster")).not.toBeNull();
    expect(queryByText("Past sessions")).not.toBeNull();
    expect(queryByText("Settings")).not.toBeNull();
    // Nothing Japanese leaks into the EN build.
    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
  });
});

describe("RoundPage (local flavour)", () => {
  it("winner taps are inert — match log is cut from local v1", async () => {
    sessionStore.session.value = ongoingSession();
    const { container } = render(<RoundPage />);
    const teamA = container.querySelector('[data-testid="team-a"]')!;
    fireEvent.click(teamA);
    // No ✓ appears and the session's winner stays none.
    await new Promise((r) => setTimeout(r, 0));
    expect(teamA.textContent).not.toContain("✓");
    expect(sessionStore.session.value!.rounds[0]!.courts[0]!.winner).toBe("none");
    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
  });
});

describe("SettingsLocalPage", () => {
  it("renders host label, JSON export, and wipe-all controls — in English", () => {
    const { container } = render(<SettingsLocalPage />);
    expect(container.querySelector('[data-testid="host-label-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="export-all-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="wipe-all-btn"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ一-龯]/);
  });

  it("wipe-all demands TWO confirms before touching data", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false); // second confirm declined
    const { container, queryByTestId } = render(<SettingsLocalPage />);
    fireEvent.click(container.querySelector('[data-testid="wipe-all-btn"]')!);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
    expect(queryByTestId("data-msg")).toBeNull(); // declined → no wipe message
    confirmSpy.mockRestore();
  });

  it("wipe-all with double confirm wipes and reports", async () => {
    const confirmSpy = vi.spyOn(appDialog, "confirm").mockResolvedValue(true);
    const { container, findByTestId } = render(<SettingsLocalPage />);
    fireEvent.click(container.querySelector('[data-testid="wipe-all-btn"]')!);
    const msg = await findByTestId("data-msg");
    expect(msg.textContent).toContain("All data deleted");
    confirmSpy.mockRestore();
  });
});

describe("PrivacyPage (local flavour)", () => {
  it("shows the device-only English notice without a language toggle", () => {
    const { container, queryByTestId } = render(<PrivacyPage />);
    expect(container.textContent).toContain("no data");
    expect(container.textContent).toContain("Court Shuffle");
    expect(queryByTestId("lang-ja")).toBeNull();
  });
});
