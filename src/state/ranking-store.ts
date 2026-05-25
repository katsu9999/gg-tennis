import { signal, type Signal } from "@preact/signals";
import { computeRankings, type RankingStats, type SessionAttendance } from "@/engine/ranking";
import type { MatchLogRepository } from "@/data/match-log-repository";
import type { SessionRepository, SessionRow } from "@/data/session-repository";

export interface RankingStore {
  ranking: Signal<RankingStats | null>;
  year: Signal<number>;
  loading: Signal<boolean>;
  load(): Promise<void>;
  setYear(year: number): Promise<void>;
}

function seasonWindow(year: number, seasonStartMonth = 1): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, seasonStartMonth - 1, 1));
  const to = new Date(Date.UTC(year + 1, seasonStartMonth - 1, 1));
  return { from, to };
}

function sessionRowToAttendance(row: SessionRow): SessionAttendance {
  // attendees are stored as JSONB; each entry has shape:
  //   { ref: AttendeeRef; todayNumber: number; isGuest: boolean; guestName?: string }
  // AttendeeRef: { kind: "member"; memberId: number } | { kind: "guest"; ... }
  const memberIds: number[] = [];
  for (const a of row.attendees) {
    const obj = a as { ref?: { kind?: string; memberId?: number } };
    if (obj.ref?.kind === "member" && typeof obj.ref.memberId === "number") {
      memberIds.push(obj.ref.memberId);
    }
  }
  return {
    sessionId: row.id,
    date: new Date(row.date),
    attendeeMemberIds: memberIds,
  };
}

export function createRankingStore(deps: {
  matchLogRepo: MatchLogRepository;
  sessionRepo: SessionRepository;
  seasonStartMonth?: number;
}): RankingStore {
  const { matchLogRepo, sessionRepo, seasonStartMonth = 1 } = deps;
  const ranking = signal<RankingStats | null>(null);
  const year = signal(new Date().getUTCFullYear());
  const loading = signal(false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const window = seasonWindow(year.value, seasonStartMonth);
      const [matches, pastSessions] = await Promise.all([
        matchLogRepo.list(),
        sessionRepo.loadPast(),
      ]);
      const attendance = pastSessions.map(sessionRowToAttendance);
      ranking.value = computeRankings(matches, attendance, window);
    } finally {
      loading.value = false;
    }
  }

  async function setYear(y: number): Promise<void> {
    year.value = y;
    await load();
  }

  return { ranking, year, loading, load, setYear };
}
