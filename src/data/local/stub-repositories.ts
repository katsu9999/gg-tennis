import type { PlannedSessionRepository } from "@/data/planned-session-repository";
import type { RsvpRepository } from "@/data/rsvp-repository";

/**
 * Stub repositories for server-only features (planned sessions / RSVP).
 *
 * Their pages are excluded from the local router, but the composition root
 * must still export repos with the shared shapes because included pages
 * import them (new-session.tsx calls plannedSessionRepo.loadById only when
 * arriving from an RSVP link, which cannot happen locally). Reads resolve
 * empty; writes reject loudly.
 */

function notAvailable(method: string): Error {
  return new Error(`${method} is not available in the local flavour`);
}

export function createStubPlannedSessionRepository(): PlannedSessionRepository {
  return {
    async list() {
      return [];
    },
    async loadById() {
      return null;
    },
    async loadByToken() {
      return null;
    },
    async loadNext() {
      return null;
    },
    async create() {
      throw notAvailable("plannedSessionRepo.create");
    },
    async rotateToken() {
      throw notAvailable("plannedSessionRepo.rotateToken");
    },
    async delete() {
      throw notAvailable("plannedSessionRepo.delete");
    },
  };
}

export function createStubRsvpRepository(): RsvpRepository {
  return {
    async listForSession() {
      return [];
    },
    async adminUpsert() {
      throw notAvailable("rsvpRepo.adminUpsert");
    },
    async publicUpsertWithToken() {
      throw notAvailable("rsvpRepo.publicUpsertWithToken");
    },
  };
}
