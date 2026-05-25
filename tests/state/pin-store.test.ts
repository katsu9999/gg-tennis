import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPinStore } from "@/state/pin-store";

function makeClient(verifyResult: { data?: boolean; error?: { message: string } | null }): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(verifyResult),
  } as unknown as SupabaseClient;
}

describe("pin store", () => {
  it("starts locked, no cached PIN", () => {
    const store = createPinStore(makeClient({ data: true }));
    expect(store.isUnlocked.value).toBe(false);
    expect(store.getPin()).toBeNull();
  });

  it("verify(correct) unlocks and caches the PIN", async () => {
    const client = makeClient({ data: true });
    const store = createPinStore(client);
    const ok = await store.verify("1234");
    expect(ok).toBe(true);
    expect(store.isUnlocked.value).toBe(true);
    expect(store.getPin()).toBe("1234");
    expect(client.rpc).toHaveBeenCalledWith("verify_club_pin", { pin_input: "1234" });
  });

  it("verify(wrong) leaves store locked", async () => {
    const store = createPinStore(makeClient({ data: false }));
    const ok = await store.verify("wrong");
    expect(ok).toBe(false);
    expect(store.isUnlocked.value).toBe(false);
    expect(store.getPin()).toBeNull();
  });

  it("verify(empty) returns false without hitting RPC", async () => {
    const client = makeClient({ data: true });
    const store = createPinStore(client);
    const ok = await store.verify("");
    expect(ok).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("verify swallows RPC errors as false", async () => {
    const store = createPinStore(makeClient({ error: { message: "network down" } }));
    const ok = await store.verify("1234");
    expect(ok).toBe(false);
    expect(store.isUnlocked.value).toBe(false);
  });

  it("lock() clears cached PIN and re-locks", async () => {
    const store = createPinStore(makeClient({ data: true }));
    await store.verify("1234");
    store.lock();
    expect(store.isUnlocked.value).toBe(false);
    expect(store.getPin()).toBeNull();
  });

  it("verifying signal toggles around the RPC call", async () => {
    let resolveRpc: (v: unknown) => void = () => undefined;
    const rpcPromise = new Promise((res) => { resolveRpc = res; });
    const client = { rpc: vi.fn().mockReturnValue(rpcPromise) } as unknown as SupabaseClient;
    const store = createPinStore(client);
    const p = store.verify("1234");
    expect(store.verifying.value).toBe(true);
    resolveRpc({ data: true, error: null });
    await p;
    expect(store.verifying.value).toBe(false);
  });
});
