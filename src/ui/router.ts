import { signal } from "@preact/signals";
import { FLAVOR, type Flavor } from "@/flavor";

// Strip the Vite base path so route matching always works against bare paths
// regardless of whether the app is hosted at "/" or at "/gg-tennis-shuffle/".
// When BASE_URL is "/" (default), stripBase is a no-op.
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); // e.g. "/gg-tennis-shuffle" or ""

/** Base だけを外す（クラブの接頭辞は残る）。 */
function stripBaseOnly(path: string): string {
  if (BASE && path.startsWith(BASE)) return path.slice(BASE.length) || "/";
  return path;
}

// 複数クラブ（2026-11-22）: GG 以外のクラブは /c/<slug>/... で開く。GG は今までどおり
// 接頭辞なし（/c/gg/... も GG として受ける）。画面のルーティングは接頭辞を外した
// パスで行い、navigate / linkTo は今のクラブの接頭辞を付け直す。
const CLUB_PREFIX = /^\/c\/([a-z0-9][a-z0-9-]{1,29})(?=\/|$)/;

/** パス（Base 抜き）からクラブの slug を取り出す。無ければ null。 */
export function clubSlugFromPath(path: string): string | null {
  const m = CLUB_PREFIX.exec(stripBaseOnly(path));
  return m ? m[1]! : null;
}

let clubPrefix = "";

/** 起動時に1回だけ呼ぶ。GG（または null）なら接頭辞なし。 */
export function setClubPrefix(slug: string | null): void {
  clubPrefix = slug && slug !== "gg" ? `/c/${slug}` : "";
}

export function stripBase(path: string): string {
  const p = stripBaseOnly(path);
  const m = CLUB_PREFIX.exec(p);
  if (m) return p.slice(m[0].length) || "/";
  return p;
}

export type Route =
  | { name: "home" }
  | { name: "roster" }
  | { name: "planned-sessions" }
  | { name: "new-session" }
  | { name: "number-map" }
  | { name: "round" }
  | { name: "edit-attendees" }
  | { name: "history" }
  | { name: "past-sessions" }
  | { name: "ranking" }
  | { name: "settings" }
  | { name: "privacy" }
  | { name: "clubs" }
  | { name: "public-rsvp"; params: { token: string } };

const PUBLIC_RSVP_PATTERN = /^\/rsvp\/([A-Za-z0-9_-]+)$/;

// Server-only pages: planned sessions / public RSVP need a shared DB, the
// ranking page needs the match log — all absent in the device-local flavour.
const LOCAL_EXCLUDED: ReadonlySet<Route["name"]> = new Set([
  "clubs",
  "planned-sessions",
  "public-rsvp",
  "ranking",
]);

/** Flavour-explicit variant, exported for tests. App code uses matchRoute. */
export function matchRouteFor(path: string, flavor: Flavor): Route {
  const route = matchAnyFlavor(path);
  if (flavor === "local" && LOCAL_EXCLUDED.has(route.name)) return { name: "home" };
  return route;
}

export function matchRoute(path: string): Route {
  return matchRouteFor(path, FLAVOR);
}

function matchAnyFlavor(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/roster") return { name: "roster" };
  if (path === "/planned") return { name: "planned-sessions" };
  if (path === "/session/new") return { name: "new-session" };
  if (path === "/session/number-map") return { name: "number-map" };
  if (path === "/session/round") return { name: "round" };
  if (path === "/session/attendees") return { name: "edit-attendees" };
  if (path === "/session/history") return { name: "history" };
  if (path === "/sessions/past") return { name: "past-sessions" };
  if (path === "/ranking") return { name: "ranking" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/privacy") return { name: "privacy" };
  if (path === "/clubs") return { name: "clubs" };
  const m = PUBLIC_RSVP_PATTERN.exec(path);
  if (m) return { name: "public-rsvp", params: { token: m[1]! } };
  return { name: "home" };
}

export const currentPath = signal(
  typeof location !== "undefined" ? stripBase(location.pathname) : "/",
);

export function navigate(to: string): void {
  const full = BASE + clubPrefix + (to.startsWith("/") ? to : "/" + to);
  if (typeof history !== "undefined") {
    history.pushState(null, "", full);
  }
  currentPath.value = to; // store the canonical (base-stripped) path
}

/** Build a base-aware href for `<a>` tags. Without this, `<a href="/">` jumps
 *  out of the app on GitHub Pages (where BASE = "/gg-tennis"). */
export function linkTo(to: string): string {
  return BASE + clubPrefix + (to.startsWith("/") ? to : "/" + to);
}

/** 共有用の絶対 URL（公開 RSVP リンク・クラブのリンク）。 */
export function absoluteLinkTo(to: string, slug?: string): string {
  const prefix = slug === undefined ? clubPrefix : slug === "gg" ? "" : `/c/${slug}`;
  const origin = typeof location !== "undefined" ? location.origin : "";
  return origin + BASE + prefix + (to.startsWith("/") ? to : "/" + to);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    currentPath.value = stripBase(location.pathname);
  });
}
