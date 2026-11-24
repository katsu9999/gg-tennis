// 起動時に「どのクラブとして開くか」を決める（main.tsx から切り出し、テスト可能に）。

export const LAST_CLUB_KEY = "gg.lastClubSlug";

type Store = Pick<Storage, "getItem" | "setItem">;

export type BootDecision =
  | { kind: "redirect"; to: string }
  | { kind: "club"; slug: string | null };

function safeGet(storage: Store | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(storage: Store | null, key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* プライベートモード等でも起動は続ける */ }
}

/**
 * - 端末内版: クラブなし。
 * - クラブ専用の公開（fixed）: そのクラブ。最後に開いたクラブの記録は読みも書きもしない
 *   （同じ github.io 上の GG アプリのホーム画面アイコンが別クラブへ飛ばないように）。
 * - 通常: URL の /c/<slug>。ホーム画面から（?pwa=1）接頭辞なしで開いたら、最後に
 *   開いたクラブへ移る。
 */
export function decideBootClub(opts: {
  isLocal: boolean;
  fixed: string | null;
  slug: string | null;
  search: string;
  base: string;
  storage: Store | null;
}): BootDecision {
  if (opts.isLocal) return { kind: "club", slug: null };
  if (opts.fixed) return { kind: "club", slug: opts.fixed };
  const { slug, storage } = opts;
  const last = safeGet(storage, LAST_CLUB_KEY);
  if (!slug && new URLSearchParams(opts.search).has("pwa") && last && last !== "gg") {
    return { kind: "redirect", to: `${opts.base.replace(/\/$/, "")}/c/${last}/` };
  }
  if (!slug || slug === "gg") safeSet(storage, LAST_CLUB_KEY, "gg");
  return { kind: "club", slug };
}

/** クラブを読めたあとに呼ぶ。クラブ専用の公開では記録しない。 */
export function rememberLastClub(storage: Store | null, slug: string, fixed: string | null): void {
  if (fixed) return;
  safeSet(storage, LAST_CLUB_KEY, slug);
}
