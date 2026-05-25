import { describe, expect, it } from "vitest";
import { createWebStorage } from "@/data/capabilities/storage";
import { createWebBrightness } from "@/data/capabilities/brightness";

describe("KVStorage (Web)", () => {
  it("round-trips a value", async () => {
    const s = createWebStorage(new Map());
    await s.set("k", "hello");
    expect(await s.get("k")).toBe("hello");
  });
  it("remove deletes a key", async () => {
    const s = createWebStorage(new Map());
    await s.set("k", "v");
    await s.remove("k");
    expect(await s.get("k")).toBeNull();
  });
});

describe("Brightness (Web)", () => {
  it("noop API returns supported=false on Web", async () => {
    const b = createWebBrightness();
    expect(b.isSupported()).toBe(false);
    await expect(b.setMax()).resolves.toBeUndefined();
  });
});
