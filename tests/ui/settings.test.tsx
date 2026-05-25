import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal } = await import("@preact/signals");
  return {
    authStore: {
      email: signal<string | null>(null),
      isAdmin: signal(false),
      loading: signal(false),
      init: vi.fn(),
      signInWithMagicLink: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { SettingsPage } from "@/ui/pages/settings";
import { authStore } from "@/ui/stores";

const a = authStore as unknown as {
  email: { value: string | null };
  isAdmin: { value: boolean };
  signOut: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  a.email.value = null;
  a.isAdmin.value = false;
  a.signOut.mockClear();
});

describe("SettingsPage", () => {
  it("shows the not-logged-in state by default", () => {
    const { getByText } = render(<SettingsPage />);
    expect(getByText(/未ログイン/)).toBeDefined();
  });

  it("shows the email + admin badge when logged in as admin", () => {
    a.email.value = "admin@example.com";
    a.isAdmin.value = true;
    const { getByTestId } = render(<SettingsPage />);
    expect(getByTestId("auth-status").textContent).toContain("admin@example.com");
    expect(getByTestId("auth-status").textContent).toContain("幹事");
  });

  it("clicking sign-out calls authStore.signOut", async () => {
    a.email.value = "admin@example.com";
    a.isAdmin.value = true;
    const { getByTestId } = render(<SettingsPage />);
    fireEvent.click(getByTestId("sign-out"));
    await waitFor(() => expect(a.signOut).toHaveBeenCalled());
  });

  it("links to /privacy", () => {
    const { container } = render(<SettingsPage />);
    const link = container.querySelector('a[href="/privacy"]')!;
    expect(link).not.toBeNull();
  });
});
