import { afterEach, describe, expect, it, vi } from "vitest";
import { decideBootClub, LAST_CLUB_KEY, rememberLastClub } from "@/boot-club";
import { parseFixedClub } from "@/flavor";

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    map: m,
  };
}

describe("parseFixedClub", () => {
  it("accepts a valid slug, lower-cased and trimmed", () => {
    expect(parseFixedClub(" Ravens ")).toBe("ravens");
  });
  it("rejects empty, invalid and gg", () => {
    expect(parseFixedClub(undefined)).toBeNull();
    expect(parseFixedClub("")).toBeNull();
    expect(parseFixedClub("a")).toBeNull();
    expect(parseFixedClub("bad/slug")).toBeNull();
    expect(parseFixedClub("gg")).toBeNull();
  });
});

describe("decideBootClub", () => {
  const base = "/gg-tennis/";

  it("fixed club: always that club, never touches the last-club record", () => {
    const s = memStore({ [LAST_CLUB_KEY]: "gg" });
    const d = decideBootClub({ isLocal: false, fixed: "ravens", slug: "ravens", search: "?pwa=1", base: "/ravens/", storage: s });
    expect(d).toEqual({ kind: "club", slug: "ravens" });
    expect(s.map.get(LAST_CLUB_KEY)).toBe("gg");
    rememberLastClub(s, "ravens", "ravens");
    expect(s.map.get(LAST_CLUB_KEY)).toBe("gg");
  });

  it("normal: home-screen launch goes to the last non-GG club", () => {
    const s = memStore({ [LAST_CLUB_KEY]: "ravens" });
    expect(decideBootClub({ isLocal: false, fixed: null, slug: null, search: "?pwa=1", base, storage: s }))
      .toEqual({ kind: "redirect", to: "/gg-tennis/c/ravens/" });
  });

  it("normal: opening GG records gg; opening a club records it after load", () => {
    const s = memStore();
    expect(decideBootClub({ isLocal: false, fixed: null, slug: null, search: "", base, storage: s }))
      .toEqual({ kind: "club", slug: null });
    expect(s.map.get(LAST_CLUB_KEY)).toBe("gg");
    expect(decideBootClub({ isLocal: false, fixed: null, slug: "ravens", search: "", base, storage: s }))
      .toEqual({ kind: "club", slug: "ravens" });
    rememberLastClub(s, "ravens", null);
    expect(s.map.get(LAST_CLUB_KEY)).toBe("ravens");
  });

  it("local flavour: no club, storage untouched", () => {
    const s = memStore();
    expect(decideBootClub({ isLocal: true, fixed: null, slug: null, search: "?pwa=1", base, storage: s }))
      .toEqual({ kind: "club", slug: null });
    expect(s.map.size).toBe(0);
  });

  it("storage that throws does not stop boot", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(decideBootClub({ isLocal: false, fixed: null, slug: null, search: "?pwa=1", base, storage: bad }))
      .toEqual({ kind: "club", slug: null });
  });
});

describe("router in a fixed-club build", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ignores /c/<slug> (cannot reach GG) and builds links without a club prefix", async () => {
    vi.stubEnv("VITE_FIXED_CLUB", "ravens");
    vi.resetModules();
    const r = await import("@/ui/router");
    expect(r.clubSlugFromPath("/")).toBe("ravens");
    expect(r.clubSlugFromPath("/c/gg/")).toBe("ravens");
    expect(r.clubSlugFromPath("/c/other/roster")).toBe("ravens");
    r.setClubPrefix("ravens");
    expect(r.linkTo("/roster")).toBe("/roster");
    expect(r.absoluteLinkTo("/rsvp/abc")).toBe(`${location.origin}/rsvp/abc`);
    expect(r.absoluteLinkTo("/", "gg")).toBe(`${location.origin}/`);
  });

  it("without the setting, /c/<slug> still selects the club", async () => {
    vi.resetModules();
    const r = await import("@/ui/router");
    expect(r.clubSlugFromPath("/c/ravens/roster")).toBe("ravens");
    expect(r.clubSlugFromPath("/")).toBeNull();
  });
});
