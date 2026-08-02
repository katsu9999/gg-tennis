import type { VenueRepository } from "@/data/venue-repository";
import { createCollection, type KV } from "@/data/local/kv";

/** Device-local VenueRepository. `pin` is accepted and ignored. */
export function createLocalVenueRepository(kv: KV): VenueRepository {
  const venues = createCollection<string>(kv, "cs_venues");
  return {
    async list() {
      return (await venues.readRows()).slice().sort((a, b) => a.localeCompare(b));
    },
    async add(name) {
      // Duplicate adds are no-ops, matching how the GG repo swallows the
      // unique-constraint violation.
      await venues.mutateRows((rows) => (rows.includes(name) ? rows : [...rows, name]));
    },
  };
}
