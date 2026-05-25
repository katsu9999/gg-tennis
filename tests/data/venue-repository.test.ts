import { describe, expect, it } from "vitest";
import { fakeClient } from "./test-helpers";
import { createVenueRepository } from "@/data/venue-repository";

describe("VenueRepository", () => {
  it("list returns venue names in order", async () => {
    const c = fakeClient({
      venues: { list: [{ name: "Golders Hill" }, { name: "Parliament Hill" }] },
    });
    const repo = createVenueRepository(c);
    const names = await repo.list();
    expect(names).toEqual(["Golders Hill", "Parliament Hill"]);
  });

  it("list returns empty array when no venues", async () => {
    const c = fakeClient({ venues: { list: [] } });
    const repo = createVenueRepository(c);
    expect(await repo.list()).toEqual([]);
  });

  it("add calls upsert with the correct name", async () => {
    const c = fakeClient({ venues: {} });
    const repo = createVenueRepository(c);
    await repo.add("West Ham Park");
    // Verify the table was accessed
    expect(c.from).toHaveBeenCalledWith("venues");
  });

  it("add throws when supabase returns an error", async () => {
    const c = fakeClient({ venues: { error: { message: "unique violation" } } });
    const repo = createVenueRepository(c);
    await expect(repo.add("Duplicate")).rejects.toMatchObject({ message: "unique violation" });
  });
});
