import { signal } from "@preact/signals";
import type { PlannedSessionStore } from "@/state/planned-session-store";
import type { RsvpStore } from "@/state/rsvp-store";
import type { RankingStore } from "@/state/ranking-store";
import type { PlannedSessionRow } from "@/data/planned-session-repository";
import type { RsvpPublicRow } from "@/data/rsvp-repository";
import type { RankingStats } from "@/engine/ranking";

/**
 * No-op stores for server-only features excluded from the local flavour
 * (planned sessions / RSVP / ranking).
 *
 * Their pages are dropped from the local router, but shared pages still call
 * read methods unconditionally on mount (home.tsx: loadNext + loadForSession;
 * past-sessions.tsx: rankingStore.load) — wiring `undefined` would crash on
 * startup. Reads resolve empty; writes reject loudly so an accidental code
 * path fails visibly instead of silently dropping data.
 */

function notAvailable(method: string): Error {
  return new Error(`${method} is not available in the local flavour`);
}

export function createStubPlannedSessionStore(): PlannedSessionStore {
  return {
    list: signal<PlannedSessionRow[]>([]),
    next: signal<PlannedSessionRow | null>(null),
    loading: signal(false),
    async load() {},
    async loadNext() {},
    async create(): Promise<PlannedSessionRow> {
      throw notAvailable("plannedSessionStore.create");
    },
    async rotateToken(): Promise<string> {
      throw notAvailable("plannedSessionStore.rotateToken");
    },
    async delete(): Promise<void> {
      throw notAvailable("plannedSessionStore.delete");
    },
  };
}

export function createStubRsvpStore(): RsvpStore {
  return {
    bySession: signal(new Map<string, RsvpPublicRow[]>()),
    async loadForSession() {
      return [];
    },
    async adminUpsert(): Promise<void> {
      throw notAvailable("rsvpStore.adminUpsert");
    },
    async publicUpsertWithToken(): Promise<void> {
      throw notAvailable("rsvpStore.publicUpsertWithToken");
    },
    countsFor() {
      return { going: 0, not_going: 0, maybe: 0 };
    },
    goingMemberIds() {
      return [];
    },
  };
}

export function createStubRankingStore(): RankingStore {
  return {
    ranking: signal<RankingStats | null>(null),
    year: signal(new Date().getFullYear()),
    loading: signal(false),
    async load() {},
    async setYear() {},
  };
}
