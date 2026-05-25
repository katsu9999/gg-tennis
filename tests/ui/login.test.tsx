import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal } = await import("@preact/signals");
  const signInWithMagicLink = vi.fn().mockResolvedValue(undefined);
  const signOut = vi.fn().mockResolvedValue(undefined);
  const init = vi.fn().mockResolvedValue(undefined);

  return {
    authStore: {
      email: signal<string | null>(null),
      isAdmin: signal(false),
      loading: signal(false),
      init,
      signInWithMagicLink,
      signOut,
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { LoginPage, resetLoginState } from "@/ui/pages/login";
import { authStore } from "@/ui/stores";

const mocked = authStore as unknown as {
  signInWithMagicLink: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  isAdmin: { value: boolean };
  email: { value: string | null };
};

beforeEach(() => {
  resetLoginState();
  mocked.signInWithMagicLink.mockReset();
  mocked.signInWithMagicLink.mockResolvedValue(undefined);
  mocked.init.mockReset();
  mocked.init.mockResolvedValue(undefined);
  mocked.isAdmin.value = false;
  mocked.email.value = null;
});

describe("LoginPage", () => {
  it("renders header and email input by default", () => {
    const { getByTestId, getByText } = render(<LoginPage />);
    expect(getByText("GG")).toBeDefined();
    expect(getByText(/幹事ログイン/)).toBeDefined();
    expect(getByTestId("login-email")).toBeDefined();
    expect(getByTestId("login-submit")).toBeDefined();
  });

  it("submit button is disabled when email is empty", () => {
    const { getByTestId } = render(<LoginPage />);
    const btn = getByTestId("login-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("typing an email enables submit; clicking calls signInWithMagicLink", async () => {
    const { getByTestId } = render(<LoginPage />);
    fireEvent.input(getByTestId("login-email"), { target: { value: "admin@example.com" } });
    const btn = getByTestId("login-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(mocked.signInWithMagicLink).toHaveBeenCalledWith("admin@example.com"));
  });

  it("on successful send, shows the 'sent' confirmation panel", async () => {
    const { getByTestId, queryByTestId, findByTestId } = render(<LoginPage />);
    fireEvent.input(getByTestId("login-email"), { target: { value: "admin@example.com" } });
    fireEvent.click(getByTestId("login-submit"));
    expect(await findByTestId("login-sent")).toBeDefined();
    expect(queryByTestId("login-email")).toBeNull();
  });

  it("on error, surfaces the message and keeps the form visible", async () => {
    mocked.signInWithMagicLink.mockRejectedValueOnce(new Error("rate limited"));
    const { getByTestId, findByTestId } = render(<LoginPage />);
    fireEvent.input(getByTestId("login-email"), { target: { value: "admin@example.com" } });
    fireEvent.click(getByTestId("login-submit"));
    const err = await findByTestId("login-error");
    expect(err.textContent).toContain("rate limited");
  });
});
