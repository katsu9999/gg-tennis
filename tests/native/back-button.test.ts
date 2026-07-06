import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  minimizeApp: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  isNative: true,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => hoisted.isNative },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: hoisted.addListener, minimizeApp: hoisted.minimizeApp },
}));

import { decideBackAction, registerAndroidBackButton } from "@/native/back-button";
import { currentPath } from "@/ui/router";

beforeEach(() => {
  hoisted.addListener.mockClear();
  hoisted.minimizeApp.mockClear();
  hoisted.isNative = true;
  currentPath.value = "/";
});

describe("decideBackAction", () => {
  it("minimizes on home, walks history everywhere else", () => {
    expect(decideBackAction("/")).toBe("minimize");
    expect(decideBackAction("")).toBe("minimize");
    expect(decideBackAction("/roster")).toBe("historyBack");
    expect(decideBackAction("/session/round")).toBe("historyBack");
  });
});

describe("registerAndroidBackButton", () => {
  it("does nothing outside a native shell (plain browser dev)", async () => {
    hoisted.isNative = false;
    await registerAndroidBackButton();
    expect(hoisted.addListener).not.toHaveBeenCalled();
  });

  it("registers a backButton listener that minimizes on home", async () => {
    await registerAndroidBackButton();
    expect(hoisted.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    const handler = hoisted.addListener.mock.calls[0]![1] as () => void;

    currentPath.value = "/";
    handler();
    expect(hoisted.minimizeApp).toHaveBeenCalledTimes(1);
  });

  it("walks browser history on inner pages instead of minimizing", async () => {
    await registerAndroidBackButton();
    const handler = hoisted.addListener.mock.calls[0]![1] as () => void;
    const backSpy = vi.spyOn(history, "back").mockImplementation(() => undefined);

    currentPath.value = "/session/round";
    handler();
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(hoisted.minimizeApp).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
