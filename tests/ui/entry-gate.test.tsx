import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/ui/stores", async () => {
  const { signal } = await import("@preact/signals");
  return {
    pinStore: {
      isUnlocked: signal(false),
      verifying: signal(false),
      lastError: signal(null),
      verify: vi.fn(async (pin: string) => pin === "right-pin"),
      getPin: vi.fn(),
      lock: vi.fn(),
    },
  };
});

import { render, fireEvent, waitFor } from "@testing-library/preact";
import { EntryGate } from "@/ui/components/entry-gate";
import { entryUnlocked } from "@/state/entry-lock";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
  entryUnlocked.value = false;
});

describe("EntryGate（GG の入室 PIN）", () => {
  it("違う PIN では開かない", async () => {
    const { getByTestId, findByTestId } = render(<EntryGate />);
    fireEvent.input(getByTestId("entry-pin"), { target: { value: "wrong" } });
    fireEvent.click(getByTestId("entry-submit"));
    await findByTestId("entry-error");
    expect(entryUnlocked.value).toBe(false);
    expect(store.size).toBe(0);
  });

  it("正しい PIN で開き、この端末に覚える", async () => {
    const { getByTestId } = render(<EntryGate />);
    fireEvent.input(getByTestId("entry-pin"), { target: { value: "right-pin" } });
    fireEvent.click(getByTestId("entry-submit"));
    await waitFor(() => expect(entryUnlocked.value).toBe(true));
    expect(store.get("gg.entryPin.1")).toBe("right-pin");
  });
});
