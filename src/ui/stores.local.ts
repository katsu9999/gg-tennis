/**
 * Composition root for the LOCAL flavour (device-only storage, no network).
 *
 * Vite resolves `@/ui/stores` to this file when VITE_FLAVOR=local (see
 * vite.config.ts), so pages keep a single import path and the Supabase
 * client never enters the bundle — enforced by
 * tests/data/local-flavor-guard.test.ts.
 *
 * Export set must mirror stores.ts exactly.
 */
import { createIdbKV } from "@/data/local/kv";
import { createLocalMemberRepository } from "@/data/local/member-repository";
import { createLocalVenueRepository } from "@/data/local/venue-repository";
import { createLocalHistoryRepository } from "@/data/local/history-repository";
import { createLocalMatchLogRepository } from "@/data/local/match-log-repository";
import { createLocalSessionRepository } from "@/data/local/session-repository";
import {
  createStubPlannedSessionRepository,
  createStubRsvpRepository,
} from "@/data/local/stub-repositories";

import { createHostStore } from "@/state/host-store";
import { createLocalPinStore } from "@/state/local/pin-store";
import { createLocalLiveSessionStore } from "@/state/local/live-session-store";
import { createRosterStore } from "@/state/roster-store";
import { createSessionStore } from "@/state/session-store";
import {
  createStubPlannedSessionStore,
  createStubRsvpStore,
  createStubRankingStore,
} from "@/state/local/stub-stores";

const kv = createIdbKV();

// Repositories
export const memberRepo = createLocalMemberRepository(kv);
export const venueRepo = createLocalVenueRepository(kv);
export const historyRepo = createLocalHistoryRepository(kv);
export const matchLogRepo = createLocalMatchLogRepository();
export const sessionRepo = createLocalSessionRepository(kv);
export const plannedSessionRepo = createStubPlannedSessionRepository();
export const rsvpRepo = createStubRsvpRepository();

// Stores
export const hostStore = createHostStore();
export const pinStore = createLocalPinStore();
export const liveSessionStore = createLocalLiveSessionStore(sessionRepo);
export const rosterStore = createRosterStore(memberRepo);
export const sessionStore = createSessionStore({ sessionRepo, historyRepo, matchLogRepo });
export const plannedSessionStore = createStubPlannedSessionStore();
export const rsvpStore = createStubRsvpStore();
export const rankingStore = createStubRankingStore();
