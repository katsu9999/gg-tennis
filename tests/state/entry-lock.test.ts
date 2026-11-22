import { describe, expect, it, beforeEach } from "vitest";
import { entryUnlocked, forgetEntry, initEntryLock, recheckEntry, rememberEntry } from "@/state/entry-lock";

// 入室 PIN（GG だけ）。別クラブの幹事が GG の画面を開けないようにする。

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
});

describe("entry-lock", () => {
  it("GG で PIN を入れていない端末は締め出し、入れたら次からは通す", () => {
    initEntryLock(1, true);
    expect(entryUnlocked.value).toBe(false);
    rememberEntry(1, "secret-pin");
    expect(entryUnlocked.value).toBe(true);
    initEntryLock(1, true); // 次の起動
    expect(entryUnlocked.value).toBe(true);
  });

  it("入室 PIN が要らないクラブ（GG 以外）は常に通す", () => {
    initEntryLock(2, false);
    expect(entryUnlocked.value).toBe(true);
  });

  it("PIN が変わっていたら（照合が false）、覚えていた端末も締め出す", async () => {
    rememberEntry(1, "old-pin");
    await recheckEntry(1, async () => false);
    expect(entryUnlocked.value).toBe(false);
    initEntryLock(1, true);
    expect(entryUnlocked.value).toBe(false);
  });

  it("通信できない・ロック中（null や例外）は、今のまま通す（オフライン起動）", async () => {
    rememberEntry(1, "pin");
    await recheckEntry(1, async () => null);
    expect(entryUnlocked.value).toBe(true);
    await recheckEntry(1, async () => { throw new Error("offline"); });
    expect(entryUnlocked.value).toBe(true);
  });

  it("締め出すと次の起動でまた聞く", () => {
    rememberEntry(1, "pin");
    forgetEntry(1);
    initEntryLock(1, true);
    expect(entryUnlocked.value).toBe(false);
  });
});
