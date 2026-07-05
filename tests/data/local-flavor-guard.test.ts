import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Static import-graph guard for the local (device-only) flavour.
 *
 * The local build must not bundle the Supabase client: walk every runtime
 * import reachable from the local composition root and fail if the graph
 * touches supabase-client.ts or a runtime (non-type) import of
 * @supabase/supabase-js. Type-only imports are erased by the compiler and
 * are fine.
 */

const SRC = path.resolve(__dirname, "../../src");
const ROOT = path.join(SRC, "ui/stores.local.ts");

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package specifier — handled separately
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        /* directory or unreadable — try next */
      }
    }
  }
  return null;
}

/** Runtime import/export-from statements (type-only ones are erased). */
function runtimeImports(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(re)) {
    const clause = m[2]!.trim();
    if (clause.startsWith("type ") || clause.startsWith("type{") || clause.startsWith("type {")) continue;
    specs.push(m[3]!);
  }
  // Side-effect imports: import "..."
  for (const m of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    specs.push(m[1]!);
  }
  return specs;
}

describe("local flavour import graph", () => {
  it("never reaches supabase-client.ts or a runtime @supabase import", () => {
    expect(existsSync(ROOT)).toBe(true);

    const visited = new Set<string>();
    const offenders: string[] = [];
    const queue = [ROOT];

    while (queue.length > 0) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      for (const spec of runtimeImports(source)) {
        if (spec.startsWith("@supabase/")) {
          offenders.push(`${path.relative(SRC, file)} → runtime import of ${spec}`);
          continue;
        }
        const resolved = resolveSpecifier(spec, file);
        if (!resolved) continue; // bare package (preact, idb-keyval, …)
        if (resolved.endsWith(`supabase-client.ts`)) {
          offenders.push(`${path.relative(SRC, file)} → ${spec}`);
          continue;
        }
        if (/\.(ts|tsx)$/.test(resolved)) queue.push(resolved);
      }
    }

    expect(offenders).toEqual([]);
    // Sanity: the walk actually traversed the graph, not just the root.
    expect(visited.size).toBeGreaterThan(5);
  });
});
