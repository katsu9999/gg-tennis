import type { MatchLogRepository } from "@/data/match-log-repository";

/**
 * No-op MatchLogRepository for the local flavour.
 *
 * Winner recording is cut from local v1 (P5 scope decision): its only
 * remaining consumer after cutting the ranking page was past-session winner
 * display. session-store still calls add/deleteByRoundCourt through the
 * shared interface, so this stub keeps it working without persisting
 * anything. Returns with local standings in v1.x if demanded.
 */
export function createLocalMatchLogRepository(): MatchLogRepository {
  return {
    async list() {
      return [];
    },
    async add(m) {
      return { ...m, at: m.at ?? new Date() };
    },
    async deleteBySession() {},
    async deleteByRoundCourt() {},
    async editPastCourtWinner() {},
  };
}
