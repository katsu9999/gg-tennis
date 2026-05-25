import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { enqueue, flushOutbox, peekOutbox, clearOutbox } from "@/data/outbox";

describe("outbox", () => {
  beforeEach(async () => {
    await clearOutbox();
  });

  it("enqueues operations in order", async () => {
    await enqueue({ table: "members", op: "insert", payload: { name: "A" } });
    await enqueue({ table: "members", op: "insert", payload: { name: "B" } });
    const items = await peekOutbox();
    expect(items.map((i) => i.payload.name)).toEqual(["A", "B"]);
  });

  it("flushOutbox processes items idempotently", async () => {
    await enqueue({ table: "members", op: "insert", payload: { name: "A" } });
    const sent: unknown[] = [];
    const result = await flushOutbox(async (op) => {
      sent.push(op);
      /* success */
    });
    expect(result.processed).toBe(1);
    expect(await peekOutbox()).toHaveLength(0);
  });

  it("leaves item in queue on failure", async () => {
    await enqueue({ table: "members", op: "insert", payload: { name: "A" } });
    const result = await flushOutbox(async () => {
      throw new Error("offline");
    });
    expect(result.processed).toBe(0);
    expect(await peekOutbox()).toHaveLength(1);
  });
});
