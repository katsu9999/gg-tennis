import { signal, type Signal } from "@preact/signals";
import type { PlannedSessionRepository, PlannedSessionRow } from "@/data/planned-session-repository";

/**
 * v1.1 Model A: write methods accept a `pin` argument; UI pulls it from
 * `pinStore.getPin()` after the user has unlocked.
 */
export interface PlannedSessionStore {
  list: Signal<PlannedSessionRow[]>;
  next: Signal<PlannedSessionRow | null>;
  loading: Signal<boolean>;
  load(): Promise<void>;
  loadNext(): Promise<void>;
  create(input: Omit<PlannedSessionRow, "id" | "created_at">, pin: string): Promise<PlannedSessionRow>;
  rotateToken(id: string, pin: string): Promise<string>;
  delete(id: string, pin: string): Promise<void>;
}

export function createPlannedSessionStore(repo: PlannedSessionRepository): PlannedSessionStore {
  const list = signal<PlannedSessionRow[]>([]);
  const next = signal<PlannedSessionRow | null>(null);
  const loading = signal(false);

  return {
    list,
    next,
    loading,
    async load() {
      loading.value = true;
      try {
        list.value = await repo.list();
      } finally {
        loading.value = false;
      }
    },
    async loadNext() {
      next.value = await repo.loadNext();
    },
    async create(input, pin) {
      const created = await repo.create(input, pin);
      list.value = [...list.value, created];
      return created;
    },
    async rotateToken(id, pin) {
      const token = await repo.rotateToken(id, pin);
      list.value = list.value.map(r =>
        r.id === id ? { ...r, public_rsvp_token: token } : r,
      );
      if (next.value?.id === id) next.value = { ...next.value, public_rsvp_token: token };
      return token;
    },
    async delete(id, pin) {
      await repo.delete(id, pin);
      list.value = list.value.filter(r => r.id !== id);
      if (next.value?.id === id) next.value = null;
    },
  };
}
