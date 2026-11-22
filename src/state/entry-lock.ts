import { signal } from "@preact/signals";

/**
 * 入室 PIN（2026-11-22）。GG の画面は URL を知っていれば誰でも開けて、閲覧と
 * 試合の進行（開始・勝敗・終了）は PIN なしでできた。別クラブ（Ravens）の幹事が
 * GG を開けないように、GG を開くときに端末ごとに1回だけ GG の PIN を聞く。
 *
 * - 入れた PIN はその端末の localStorage に覚え、次からは聞かない。
 * - 起動のたびに裏で覚えた PIN を照合し、PIN が変わっていたら（照合が false）
 *   その端末は締め出す。通信できない・ロック中（null）は今のまま通す（オフライン起動）。
 * - 画面の上だけの関所。アプリの接続キーで DB を直接読むことまでは防げない。
 */

const keyOf = (clubId: number) => `gg.entryPin.${clubId}`;

export const entryUnlocked = signal(true);

function read(clubId: number): string | null {
  try {
    return localStorage.getItem(keyOf(clubId));
  } catch {
    return null;
  }
}

/** 起動時に1回。required=false（GG 以外・端末完結版）なら常に通す。 */
export function initEntryLock(clubId: number, required: boolean): void {
  entryUnlocked.value = !required || !!read(clubId);
}

/** 正しい PIN を入れた／PIN を変えた端末で、新しい PIN を覚える。 */
export function rememberEntry(clubId: number, pin: string): void {
  try {
    localStorage.setItem(keyOf(clubId), pin);
  } catch {
    /* 覚えられなくても今回は通す（次回また聞く） */
  }
  entryUnlocked.value = true;
}

/** この端末を締め出す（共用端末で使い終わったとき）。 */
export function forgetEntry(clubId: number): void {
  try {
    localStorage.removeItem(keyOf(clubId));
  } catch {
    /* noop */
  }
  entryUnlocked.value = false;
}

/** 覚えた PIN がまだ正しいか裏で確かめる。check は true/false、分からなければ null。 */
export async function recheckEntry(
  clubId: number,
  check: (pin: string) => Promise<boolean | null>,
): Promise<void> {
  const pin = read(clubId);
  if (!pin) return;
  const ok = await check(pin).catch(() => null);
  if (ok === false) forgetEntry(clubId);
}
