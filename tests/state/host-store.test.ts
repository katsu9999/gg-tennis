import { beforeEach, describe, expect, it } from "vitest";
import { createHostStore } from "@/state/host-store";

beforeEach(() => {
  localStorage.clear();
});

describe("host store", () => {
  it("generates and persists a token on first construction", () => {
    const store = createHostStore();
    expect(store.token.value).toMatch(/^[0-9a-f-]{16,}$/);
    expect(localStorage.getItem("gg_host_token")).toBe(store.token.value);
  });

  it("reuses the existing token across constructions", () => {
    const a = createHostStore();
    const b = createHostStore();
    expect(a.token.value).toBe(b.token.value);
  });

  it("starts with empty label", () => {
    const store = createHostStore();
    expect(store.label.value).toBe("");
  });

  it("setLabel persists the label", () => {
    const store = createHostStore();
    store.setLabel("Katsu");
    expect(store.label.value).toBe("Katsu");
    expect(localStorage.getItem("gg_host_label")).toBe("Katsu");
  });

  it("setLabel('') clears the label", () => {
    const store = createHostStore();
    store.setLabel("X");
    store.setLabel("");
    expect(store.label.value).toBe("");
    expect(localStorage.getItem("gg_host_label")).toBeNull();
  });

  it("isHost compares against the current token", () => {
    const store = createHostStore();
    expect(store.isHost(store.token.value)).toBe(true);
    expect(store.isHost("other-token")).toBe(false);
    expect(store.isHost(null)).toBe(false);
    expect(store.isHost(undefined)).toBe(false);
  });
});
