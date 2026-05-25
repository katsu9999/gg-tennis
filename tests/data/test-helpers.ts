/**
 * Test helpers for the Supabase-backed repositories.
 *
 * Each repository chains Supabase query-builder methods (select/eq/insert/update/upsert/
 * delete/order/single/maybeSingle). The real client returns a self-referential builder
 * with terminal methods returning `{ data, error }`. This helper mints a Vitest mock with
 * the same shape so tests stay focused on the repository's mapping logic, not on the
 * client.
 */
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TableResponses<TRow = Record<string, unknown>> {
  /** Rows returned by `.order(...)` / final `.select(...)` */
  list?: TRow[];
  /** Row returned by `.insert(...).select().single()` or `.update(...).eq(...).select().single()` */
  single?: TRow | ((payload: Record<string, unknown>) => TRow);
  /** Row returned by `.select(...).eq(...).maybeSingle()` */
  maybeSingle?: TRow | null;
  /** Error to inject on every terminal call (overrides data). */
  error?: { message: string } | null;
}

/**
 * Build a fake `SupabaseClient` whose `.from(table)` returns a builder where every
 * chained call resolves to the responses configured via `responses[table]`.
 *
 * Usage:
 *   const c = fakeClient({
 *     members: { list: [{ id: 1, name: "A", status: "active", created_at: "..." }] },
 *     venues: { list: [{ name: "Golders" }] },
 *   });
 *   const repo = createMemberRepository(c);
 *   await repo.listAll();  // sees the configured list
 */
export function fakeClient(responses: Record<string, TableResponses>): SupabaseClient {
  const fromSpy = vi.fn((table: string) => makeTableBuilder(responses[table] ?? {}));
  return { from: fromSpy } as unknown as SupabaseClient;
}

function makeTableBuilder<TRow>(resp: TableResponses<TRow>) {
  const err = resp.error ?? null;
  const lastInsertPayload: { value: Record<string, unknown> } = { value: {} };

  // Terminal result for `.order(...)`: resolves to a list response.
  const listResult = { data: resp.list ?? [], error: err };
  // Terminal result for `.maybeSingle()`: resolves to a single row (or null).
  const maybeSingleResult = { data: resp.maybeSingle ?? null, error: err };

  const singleData = () =>
    typeof resp.single === "function"
      ? (resp.single as (p: Record<string, unknown>) => TRow)(lastInsertPayload.value)
      : (resp.single as TRow | undefined) ?? null;

  const singleResult = () => ({ data: singleData(), error: err });

  // Object with everything chainable; `mockReturnThis()`-style links keep `builder`
  // self-referential while terminal methods resolve a promise.
  const builder: Record<string, unknown> = {};

  Object.assign(builder, {
    select: vi.fn().mockReturnValue(builder),
    eq: vi.fn().mockReturnValue(builder),
    gte: vi.fn().mockReturnValue(builder),
    lt: vi.fn().mockReturnValue(builder),
    in: vi.fn().mockReturnValue(builder),
    insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
      lastInsertPayload.value = p;
      return builder;
    }),
    upsert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
      lastInsertPayload.value = p;
      return builder;
    }),
    update: vi.fn().mockImplementation((p: Record<string, unknown>) => {
      lastInsertPayload.value = p;
      return builder;
    }),
    delete: vi.fn().mockReturnValue(builder),
    order: vi.fn().mockResolvedValue(listResult),
    single: vi.fn().mockImplementation(async () => singleResult()),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
    // `await builder` (no terminal) — supports both:
    //   `.delete().eq(...)` (where data is irrelevant; just check error) and
    //   `.select("*")` without `.order()` (where data is the configured list).
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: resp.list ?? null, error: err }),
  });

  return builder;
}
