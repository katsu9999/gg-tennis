import { computed, signal, type Signal, type ReadonlySignal } from "@preact/signals";
import type { Member } from "@/engine/models";
import type { MemberRepository } from "@/data/member-repository";

/**
 * v1.1 Model A: write methods accept a `pin` argument. Callers (UI pages)
 * fetch it from `pinStore.getPin()` after the user has unlocked.
 */
export interface RosterStore {
  all: Signal<Member[]>;
  active: ReadonlySignal<Member[]>;
  archived: ReadonlySignal<Member[]>;
  load(): Promise<void>;
  add(name: string, pin: string): Promise<void>;
  rename(id: number, name: string, pin: string): Promise<void>;
  archive(id: number, pin: string): Promise<void>;
  unarchive(id: number, pin: string): Promise<void>;
  hardDelete(id: number, pin: string): Promise<void>;
}

export function createRosterStore(repo: MemberRepository): RosterStore {
  const all = signal<Member[]>([]);
  const active = computed(() => all.value.filter(m => m.status === "active"));
  const archived = computed(() => all.value.filter(m => m.status === "archived"));

  function replace(id: number, m: Member) {
    all.value = all.value.map(x => (x.id === id ? m : x));
  }

  return {
    all,
    active,
    archived,
    async load() {
      all.value = await repo.listAll();
    },
    async add(name, pin) {
      const m = await repo.add({ name, pin });
      all.value = [...all.value, m];
    },
    async rename(id, name, pin) {
      const m = await repo.rename(id, name, pin);
      replace(id, m);
    },
    async archive(id, pin) {
      const m = await repo.archive(id, pin);
      replace(id, m);
    },
    async unarchive(id, pin) {
      const m = await repo.unarchive(id, pin);
      replace(id, m);
    },
    async hardDelete(id, pin) {
      await repo.hardDelete(id, pin);
      all.value = all.value.filter(x => x.id !== id);
    },
  };
}
