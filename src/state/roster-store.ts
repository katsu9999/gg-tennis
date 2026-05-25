import { computed, signal, type Signal, type ReadonlySignal } from "@preact/signals";
import type { Member } from "@/engine/models";
import type { MemberRepository } from "@/data/member-repository";

export interface RosterStore {
  all: Signal<Member[]>;
  active: ReadonlySignal<Member[]>;
  archived: ReadonlySignal<Member[]>;
  load(): Promise<void>;
  add(name: string): Promise<void>;
  rename(id: number, name: string): Promise<void>;
  archive(id: number): Promise<void>;
  unarchive(id: number): Promise<void>;
  hardDelete(id: number): Promise<void>;
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
    async add(name) {
      const m = await repo.add({ name });
      all.value = [...all.value, m];
    },
    async rename(id, name) {
      const m = await repo.rename(id, name);
      replace(id, m);
    },
    async archive(id) {
      const m = await repo.archive(id);
      replace(id, m);
    },
    async unarchive(id) {
      const m = await repo.unarchive(id);
      replace(id, m);
    },
    async hardDelete(id) {
      await repo.hardDelete(id);
      all.value = all.value.filter(x => x.id !== id);
    },
  };
}
