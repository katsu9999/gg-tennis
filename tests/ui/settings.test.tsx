import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/data/supabase-client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock("@/ui/stores", async () => {
  const { signal } = await import("@preact/signals");
  return {
    hostStore: {
      token: signal("host-token"),
      label: signal(""),
      setLabel: vi.fn(),
      isHost: vi.fn().mockReturnValue(false),
    },
    pinStore: {
      isUnlocked: signal(false),
      verifying: signal(false),
      verify: vi.fn().mockResolvedValue(true),
      getPin: vi.fn().mockReturnValue("test-pin"),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { SettingsPage } from "@/ui/pages/settings";
import { hostStore, pinStore } from "@/ui/stores";

const h = hostStore as unknown as {
  label: { value: string };
  setLabel: ReturnType<typeof vi.fn>;
};
const p = pinStore as unknown as {
  isUnlocked: { value: boolean };
  lock: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  h.label.value = "";
  h.setLabel.mockClear();
  p.isUnlocked.value = false;
  p.lock.mockClear();
});

describe("SettingsPage", () => {
  it("renders the host-label, PIN, outdoor and privacy sections", () => {
    const { getByText, getByTestId } = render(<SettingsPage />);
    expect(getByText(/あなたの表示名/)).toBeDefined();
    expect(getByText(/クラブ PIN/)).toBeDefined();
    expect(getByText(/屋外モード/)).toBeDefined();
    expect(getByTestId("host-label-input")).toBeDefined();
  });

  it("saving the host label calls hostStore.setLabel", async () => {
    const { getByTestId } = render(<SettingsPage />);
    fireEvent.input(getByTestId("host-label-input"), { target: { value: "Katsu" } });
    fireEvent.click(getByTestId("host-label-save"));
    await waitFor(() => expect(h.setLabel).toHaveBeenCalledWith("Katsu"));
  });

  it("PIN status shows 'ロック中' when locked and 'lock' button is hidden", () => {
    const { getByText, queryByTestId } = render(<SettingsPage />);
    expect(getByText(/ロック中/)).toBeDefined();
    expect(queryByTestId("pin-lock")).toBeNull();
  });

  it("when unlocked, the lock button is rendered and calls pinStore.lock", () => {
    p.isUnlocked.value = true;
    const { getByTestId } = render(<SettingsPage />);
    const lockBtn = getByTestId("pin-lock");
    fireEvent.click(lockBtn);
    expect(p.lock).toHaveBeenCalled();
  });

  it("links to /privacy", () => {
    const { container } = render(<SettingsPage />);
    const link = container.querySelector('a[href="/privacy"]')!;
    expect(link).not.toBeNull();
  });
});
