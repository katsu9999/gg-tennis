import { cacheGet, cacheSet } from "./local-cache";

export interface OutboxOp {
  id: string;
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  payload: Record<string, unknown>;
  at: number;
}

type Pending = Omit<OutboxOp, "id" | "at">;

const KEY = "outbox:v1";

async function load(): Promise<OutboxOp[]> {
  return (await cacheGet<OutboxOp[]>(KEY)) ?? [];
}

async function save(items: OutboxOp[]): Promise<void> {
  await cacheSet(KEY, items);
}

export async function enqueue(op: Pending): Promise<OutboxOp> {
  const items = await load();
  const next: OutboxOp = { ...op, id: crypto.randomUUID(), at: Date.now() };
  items.push(next);
  await save(items);
  return next;
}

export async function peekOutbox(): Promise<OutboxOp[]> {
  return load();
}

export async function clearOutbox(): Promise<void> {
  await save([]);
}

/**
 * Replay queued operations in insertion order. Stops at the first failure to
 * preserve ordering — the rest stay queued for the next flush. Returns counts.
 */
export async function flushOutbox(
  send: (op: OutboxOp) => Promise<void>,
): Promise<{ processed: number; remaining: number }> {
  const items = await load();
  let processed = 0;
  let failedAt = items.length;
  for (let i = 0; i < items.length; i++) {
    try {
      await send(items[i]!);
      processed++;
    } catch {
      failedAt = i;
      break;
    }
  }
  const remaining = items.slice(failedAt);
  await save(remaining);
  return { processed, remaining: remaining.length };
}
