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
