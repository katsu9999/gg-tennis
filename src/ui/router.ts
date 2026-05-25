import { signal } from "@preact/signals";

// Strip the Vite base path so route matching always works against bare paths
// regardless of whether the app is hosted at "/" or at "/gg-tennis-shuffle/".
// When BASE_URL is "/" (default), stripBase is a no-op.
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); // e.g. "/gg-tennis-shuffle" or ""

export function stripBase(path: string): string {
  if (BASE && path.startsWith(BASE)) return path.slice(BASE.length) || "/";
  return path;
}

export type Route =
  | { name: "home" }
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
  typeof location !== "undefined" ? stripBase(location.pathname) : "/",
);

export function navigate(to: string): void {
  const full = BASE + (to.startsWith("/") ? to : "/" + to);
  if (typeof history !== "undefined") {
    history.pushState(null, "", full);
  }
  currentPath.value = to; // store the canonical (base-stripped) path
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    currentPath.value = stripBase(location.pathname);
  });
}
