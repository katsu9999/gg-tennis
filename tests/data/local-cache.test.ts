import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { cacheGet, cacheSet, cacheDelete } from "@/data/local-cache";

describe("local cache", () => {
  beforeEach(async () => {
    await cacheDelete("k");
  });

  it("round-trips a JSON value", async () => {
    await cacheSet("k", { foo: 1 });
    expect(await cacheGet<{ foo: number }>("k")).toEqual({ foo: 1 });
  });

  it("returns null when missing", async () => {
    expect(await cacheGet("missing")).toBeNull();
  });
});
