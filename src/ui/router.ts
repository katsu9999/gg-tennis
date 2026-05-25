import { signal } from "@preact/signals";

export type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "roster" }
  | { name: "planned-sessions" }
  | { name: "new-session" }
  | { name: "number-map" }
  | { name: "round" }
  | { name: "history" }
  | { name: "past-sessions" }
  | { name: "ranking" }
  | { name: "settings" }
  | { name: "privacy" }
  | { name: "public-rsvp"; params: { token: string } };

const PUBLIC_RSVP_PATTERN = /^\/rsvp\/([A-Za-z0-9_-]+)$/;

export function matchRoute(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/login") return { name: "login" };
  if (path === "/roster") return { name: "roster" };
  if (path === "/planned") return { name: "planned-sessions" };
  if (path === "/session/new") return { name: "new-session" };
  if (path === "/session/number-map") return { name: "number-map" };
  if (path === "/session/round") return { name: "round" };
  if (path === "/session/history") return { name: "history" };
  if (path === "/sessions/past") return { name: "past-sessions" };
  if (path === "/ranking") return { name: "ranking" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/privacy") return { name: "privacy" };
  const m = PUBLIC_RSVP_PATTERN.exec(path);
  if (m) return { name: "public-rsvp", params: { token: m[1]! } };
  return { name: "home" };
}

export const currentPath = signal(
  typeof location !== "undefined" ? location.pathname : "/",
);

export function navigate(to: string): void {
  if (typeof history !== "undefined") {
    history.pushState(null, "", to);
  }
  currentPath.value = to;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    currentPath.value = location.pathname;
  });
}
