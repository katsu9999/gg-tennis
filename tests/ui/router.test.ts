import { describe, expect, it } from "vitest";
import { matchRoute, matchRouteFor } from "@/ui/router";

describe("matchRoute", () => {
  it.each<[string, ReturnType<typeof matchRoute>]>([
    ["/", { name: "home" }],
    ["", { name: "home" }],
    ["/roster", { name: "roster" }],
    ["/planned", { name: "planned-sessions" }],
    ["/session/new", { name: "new-session" }],
    ["/session/number-map", { name: "number-map" }],
    ["/session/round", { name: "round" }],
    ["/session/attendees", { name: "edit-attendees" }],
    ["/session/history", { name: "history" }],
    ["/sessions/past", { name: "past-sessions" }],
    ["/ranking", { name: "ranking" }],
    ["/settings", { name: "settings" }],
    ["/privacy", { name: "privacy" }],
    ["/rsvp/abc123", { name: "public-rsvp", params: { token: "abc123" } }],
    ["/rsvp/Z_99-x", { name: "public-rsvp", params: { token: "Z_99-x" } }],
  ])("matches %s", (path, expected) => {
    expect(matchRoute(path)).toEqual(expected);
  });

  it("falls back to home for unknown paths", () => {
    expect(matchRoute("/nope")).toEqual({ name: "home" });
    expect(matchRoute("/login")).toEqual({ name: "home" }); // v1.1: /login removed
    expect(matchRoute("/rsvp/")).toEqual({ name: "home" });
    expect(matchRoute("/rsvp/bad token")).toEqual({ name: "home" });
  });
});

describe("matchRouteFor (flavour gating)", () => {
  it("local flavour drops server-only pages to home", () => {
    expect(matchRouteFor("/planned", "local")).toEqual({ name: "home" });
    expect(matchRouteFor("/ranking", "local")).toEqual({ name: "home" });
    expect(matchRouteFor("/rsvp/abc123", "local")).toEqual({ name: "home" });
  });

  it("local flavour keeps the shuffle core pages", () => {
    expect(matchRouteFor("/", "local")).toEqual({ name: "home" });
    expect(matchRouteFor("/roster", "local")).toEqual({ name: "roster" });
    expect(matchRouteFor("/session/new", "local")).toEqual({ name: "new-session" });
    expect(matchRouteFor("/session/round", "local")).toEqual({ name: "round" });
    expect(matchRouteFor("/sessions/past", "local")).toEqual({ name: "past-sessions" });
    expect(matchRouteFor("/settings", "local")).toEqual({ name: "settings" });
    expect(matchRouteFor("/privacy", "local")).toEqual({ name: "privacy" });
  });

  it("gg flavour matches everything (matchRoute delegates with the build flavour)", () => {
    expect(matchRouteFor("/planned", "gg")).toEqual({ name: "planned-sessions" });
    expect(matchRouteFor("/ranking", "gg")).toEqual({ name: "ranking" });
    expect(matchRouteFor("/rsvp/abc123", "gg")).toEqual({
      name: "public-rsvp",
      params: { token: "abc123" },
    });
  });
});

describe("クラブ別 URL（/c/<slug>）", () => {
  it("パスからクラブを取り出し、ルーティングは接頭辞を外したパスで行う", async () => {
    const { clubSlugFromPath, stripBase, matchRouteFor } = await import("@/ui/router");
    expect(clubSlugFromPath("/c/hampstead/ranking")).toBe("hampstead");
    expect(clubSlugFromPath("/c/hampstead")).toBe("hampstead");
    expect(clubSlugFromPath("/ranking")).toBeNull();
    expect(clubSlugFromPath("/cx/hampstead")).toBeNull();
    expect(stripBase("/c/hampstead/ranking")).toBe("/ranking");
    expect(stripBase("/c/hampstead")).toBe("/");
    expect(matchRouteFor(stripBase("/c/hampstead/session/round"), "gg")).toEqual({ name: "round" });
    expect(matchRouteFor(stripBase("/c/hampstead/rsvp/abc_123"), "gg")).toEqual({ name: "public-rsvp", params: { token: "abc_123" } });
  });

  it("クラブを決めたら、画面遷移とリンクに接頭辞が付く（GG は付かない）", async () => {
    const { setClubPrefix, linkTo, navigate, currentPath, absoluteLinkTo } = await import("@/ui/router");
    setClubPrefix("hampstead");
    expect(linkTo("/ranking")).toBe("/c/hampstead/ranking");
    navigate("/roster");
    expect(location.pathname).toBe("/c/hampstead/roster");
    expect(currentPath.value).toBe("/roster");
    expect(absoluteLinkTo("/rsvp/t")).toBe(`${location.origin}/c/hampstead/rsvp/t`);
    expect(absoluteLinkTo("/", "gg")).toBe(`${location.origin}/`);
    setClubPrefix("gg");
    expect(linkTo("/ranking")).toBe("/ranking");
    setClubPrefix(null);
    expect(linkTo("/")).toBe("/");
  });

  it("クラブ管理ページは端末完結版では開けない", async () => {
    const { matchRouteFor } = await import("@/ui/router");
    expect(matchRouteFor("/clubs", "gg")).toEqual({ name: "clubs" });
    expect(matchRouteFor("/clubs", "local")).toEqual({ name: "home" });
  });
});
