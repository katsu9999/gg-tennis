import { describe, expect, it } from "vitest";
import { matchRoute } from "@/ui/router";

describe("matchRoute", () => {
  it.each<[string, ReturnType<typeof matchRoute>]>([
    ["/", { name: "home" }],
    ["", { name: "home" }],
    ["/login", { name: "login" }],
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
    expect(matchRoute("/rsvp/")).toEqual({ name: "home" });
    expect(matchRoute("/rsvp/bad token")).toEqual({ name: "home" });
  });
});
