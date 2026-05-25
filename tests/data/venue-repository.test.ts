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

  it("add calls upsert_venue RPC with PIN and venue name", async () => {
    const c = fakeClient({ venues: {} }, { upsert_venue: { data: 1 } });
    const repo = createVenueRepository(c);
    await repo.add("West Ham Park", "test-pin");
    expect(c.rpc).toHaveBeenCalledWith("upsert_venue", {
      p_pin: "test-pin",
      p_id: null,
      p_name: "West Ham Park",
    });
  });

  it("add swallows unique-violation errors", async () => {
    const c = fakeClient(
      { venues: {} },
      { upsert_venue: { error: { message: "duplicate key value" } } },
    );
    const repo = createVenueRepository(c);
    await expect(repo.add("Duplicate", "test-pin")).resolves.toBeUndefined();
  });

  it("add throws on non-unique errors", async () => {
    const c = fakeClient(
      { venues: {} },
      { upsert_venue: { error: { message: "invalid_pin" } } },
    );
    const repo = createVenueRepository(c);
    await expect(repo.add("Whatever", "wrong-pin")).rejects.toMatchObject({ message: "invalid_pin" });
  });
});
