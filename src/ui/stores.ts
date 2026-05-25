/**
 * Wires the singleton Supabase client to every repository and every store.
 * Pages import the named exports from this module.
 *
 * In tests, mock this whole module via `vi.mock("@/ui/stores", ...)` to provide
 * fakes. That sidesteps the `import.meta.env` requirement of supabase-client.
 */
import { supabase } from "@/data/supabase-client";
import { createMemberRepository } from "@/data/member-repository";
import { createVenueRepository } from "@/data/venue-repository";
import { createHistoryRepository } from "@/data/history-repository";
import { createMatchLogRepository } from "@/data/match-log-repository";
import { createSessionRepository } from "@/data/session-repository";
import { createPlannedSessionRepository } from "@/data/planned-session-repository";
import { createRsvpRepository } from "@/data/rsvp-repository";

import { createAuthStore } from "@/state/auth-store";
import { createRosterStore } from "@/state/roster-store";
import { createSessionStore } from "@/state/session-store";
import { createPlannedSessionStore } from "@/state/planned-session-store";
import { createRsvpStore } from "@/state/rsvp-store";
import { createRankingStore } from "@/state/ranking-store";

// Repositories
export const memberRepo = createMemberRepository(supabase);
export const venueRepo = createVenueRepository(supabase);
export const historyRepo = createHistoryRepository(supabase);
export const matchLogRepo = createMatchLogRepository(supabase);
export const sessionRepo = createSessionRepository(supabase);
export const plannedSessionRepo = createPlannedSessionRepository(supabase);
export const rsvpRepo = createRsvpRepository(supabase);

// Stores
export const authStore = createAuthStore(supabase);
export const rosterStore = createRosterStore(memberRepo);
export const sessionStore = createSessionStore({ sessionRepo, historyRepo, matchLogRepo });
export const plannedSessionStore = createPlannedSessionStore(plannedSessionRepo);
export const rsvpStore = createRsvpStore(rsvpRepo);
export const rankingStore = createRankingStore({ matchLogRepo, sessionRepo });
