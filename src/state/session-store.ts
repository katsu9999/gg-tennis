import { signal, type Signal } from "@preact/signals";
import type { AttendeeRef, PairHistory, Round, SameSessionStats } from "@/engine/models";
import { memberIdsFrom, pairKey } from "@/engine/models";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import {
  applyRoundToHistory,
  applyRoundToSameSession,
  decayHistory,
} from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import type { SessionRepository, SessionRow } from "@/data/session-repository";
import type { HistoryRepository } from "@/data/history-repository";
import type { MatchLogRepository } from "@/data/match-log-repository";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** In-memory shape of the current session — richer than SessionRow. */
export interface InMemorySession {
  id: string;
  status: "ongoing" | "past";
  plannedSessionId: string | null;
  date: Date;
  location: string;
  courtCount: number;
  allowSingles: boolean;
  attendees: { ref: AttendeeRef; todayNumber: number; isGuest: boolean; guestName?: string }[];
  rounds: Round[];
  currentRoundIndex: number;
  /** Per-attendee play/rest counts keyed by JSON.stringify(ref). */
  todayStats: Map<string, { play: number; rest: number }>;
  prevResters: AttendeeRef[];
  rngSeed: number;
  /** v1.1 Model A: LocalStorage token of whoever started the session. */
  hostToken: string | null;
  /** v1.1 Model A: display label for the host. */
  hostLabel: string | null;
}

export interface StartNewSessionInput {
  date: Date;
  location: string;
  courtCount: number;
  allowSingles: boolean;
  memberIds: number[];
  plannedSessionId?: string;
  /** v1.1 Model A: identifies the device that's starting (label-only). */
  hostToken?: string | null;
  hostLabel?: string | null;
}

export interface SessionStore {
  session: Signal<InMemorySession | null>;
  startNewSession(input: StartNewSessionInput): Promise<void>;
  nextRound(): Promise<void>;
  goToPreviousRound(): void;
  /** Delete the latest round if no winner has been recorded on it — for the
   *  "pressed 次 but we're not actually playing this round" case. Reverts
   *  play/rest counts and fairness weights; throws if a result exists or the
   *  cursor isn't on the latest round. */
  cancelCurrentRound(): Promise<void>;
  recordWinner(courtNumber: number, winner: "A" | "B" | null): Promise<void>;
  endSession(): Promise<void>;
  /** Re-hydrate the in-memory session from the DB row (PWA reload / phone lock).
   *  No-op if a session is already loaded. */
  resume(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function refKey(ref: AttendeeRef): string {
  return JSON.stringify(ref);
}

function toSessionRow(s: InMemorySession): SessionRow {
  // Convert todayStats Map to plain record
  const today_stats: Record<string, unknown> = {};
  for (const [key, val] of s.todayStats) {
    today_stats[key] = val;
  }

  return {
    id: s.id,
    status: s.status,
    planned_session_id: s.plannedSessionId,
    date: s.date.toISOString().split("T")[0]!, // YYYY-MM-DD
    location: s.location,
    court_count: s.courtCount,
    allow_singles: s.allowSingles,
    attendees: s.attendees as unknown[],
    rounds: s.rounds as unknown[],
    today_stats,
    next_today_number: s.attendees.length + 1,
    current_round_index: s.currentRoundIndex,
    created_at: new Date().toISOString(),
    host_token: s.hostToken,
    host_label: s.hostLabel,
  };
}

function generateSessionId(): string {
  // Produce a UUID-like id using crypto if available, else fall back to timestamp
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deriveRngSeed(date: Date): number {
  return date.getTime() % 2 ** 31;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSessionStore(deps: {
  sessionRepo: SessionRepository;
  historyRepo: HistoryRepository;
  matchLogRepo: MatchLogRepository;
}): SessionStore {
  const { sessionRepo, historyRepo, matchLogRepo } = deps;

  const session = signal<InMemorySession | null>(null);

  // Closure-scoped engine state — not serialised to DB (except history on endSession)
  let history: PairHistory = { partnerW: new Map(), opponentW: new Map() };
  let sameSession: SameSessionStats = { partner: new Map(), opp: new Map() };

  // ------------------------------------------------------------------
  // startNewSession
  // ------------------------------------------------------------------
  async function startNewSession(input: StartNewSessionInput): Promise<void> {
    // 1. Load and decay pair history
    const loaded = await historyRepo.loadPairHistory();
    history = loaded;
    decayHistory(history);

    // Reset same-session stats for the new session
    sameSession = { partner: new Map(), opp: new Map() };

    // 2. Build attendees with todayNumbers 1..N in memberIds order
    const attendees: InMemorySession["attendees"] = input.memberIds.map((id, i) => ({
      ref: { kind: "member" as const, memberId: id },
      todayNumber: i + 1,
      isGuest: false,
    }));

    // 3. Initialise todayStats
    const todayStats = new Map<string, { play: number; rest: number }>();
    for (const a of attendees) {
      todayStats.set(refKey(a.ref), { play: 0, rest: 0 });
    }

    // 4. Build in-memory session
    const s: InMemorySession = {
      id: generateSessionId(),
      status: "ongoing",
      plannedSessionId: input.plannedSessionId ?? null,
      date: input.date,
      location: input.location,
      courtCount: input.courtCount,
      allowSingles: input.allowSingles,
      attendees,
      rounds: [],
      currentRoundIndex: -1,
      todayStats,
      prevResters: [],
      rngSeed: deriveRngSeed(input.date),
      hostToken: input.hostToken ?? null,
      hostLabel: input.hostLabel ?? null,
    };

    session.value = s;

    // 5. Persist
    await sessionRepo.upsert(toSessionRow(s));
  }

  // ------------------------------------------------------------------
  // nextRound
  // ------------------------------------------------------------------
  async function nextRound(): Promise<void> {
    const s = session.value;
    if (!s) throw new Error("No active session. Call startNewSession first.");

    // If the user navigated back with goToPreviousRound, just step forward
    // through the already-generated rounds instead of producing a new one —
    // otherwise we'd skip rounds in the display and orphan stored ones.
    if (s.currentRoundIndex < s.rounds.length - 1) {
      s.currentRoundIndex += 1;
      session.value = { ...s };
      await sessionRepo.upsert(toSessionRow(session.value));
      return;
    }

    const refs = s.attendees.map(a => a.ref);
    const n = refs.length;

    // 1. Plan round
    const plan = planRound(n, s.courtCount, s.allowSingles);

    // 2. Build playCount map from todayStats
    const playMap = new Map<string, number>();
    for (const [key, stats] of s.todayStats) {
      playMap.set(key, stats.play);
    }

    // 3. Select resters
    const rng = mulberry32(s.rngSeed + s.rounds.length);
    const resters = selectResters(refs, plan.resters, playMap, s.prevResters, rng);
    const resterSet = new Set(resters.map(refKey));
    const seated = refs.filter(r => !resterSet.has(refKey(r)));

    // 4. Build courts
    const { courts } = buildRound(
      seated,
      plan.doublesCourts,
      plan.singlesCourts,
      history,
      sameSession,
      rng,
    );

    // 5. Assemble Round
    const roundIndex = s.rounds.length;
    const round: Round = { index: roundIndex, courts, resters };

    // 6. Update todayStats
    for (const c of courts) {
      for (const r of [...c.teamA, ...c.teamB]) {
        const key = refKey(r);
        const stats = s.todayStats.get(key) ?? { play: 0, rest: 0 };
        s.todayStats.set(key, { ...stats, play: stats.play + 1 });
      }
    }
    for (const r of resters) {
      const key = refKey(r);
      const stats = s.todayStats.get(key) ?? { play: 0, rest: 0 };
      s.todayStats.set(key, { ...stats, rest: stats.rest + 1 });
    }

    // 7. Update engine state
    applyRoundToHistory(history, courts);
    applyRoundToSameSession(sameSession, courts);

    // 8. Update session
    s.rounds.push(round);
    s.currentRoundIndex = roundIndex;
    s.prevResters = resters;

    // Trigger signal reactivity by reassigning. Note: this is a shallow spread —
    // `rounds`/`todayStats` are the same references as before the mutations above.
    // Adequate for v1 (Preact subscribers re-read on render). Time-travel / undo
    // would need a deep clone here.
    session.value = { ...s };

    // 9. Persist session
    await sessionRepo.upsert(toSessionRow(session.value));
  }

  // ------------------------------------------------------------------
  // goToPreviousRound — navigate back without discarding generated rounds.
  // ------------------------------------------------------------------
  function goToPreviousRound(): void {
    const s = session.value;
    if (!s) return;
    if (s.currentRoundIndex <= 0) return;
    s.currentRoundIndex -= 1;
    session.value = { ...s };
    // Fire-and-forget persist (cursor position only).
    void sessionRepo.upsert(toSessionRow(session.value));
  }

  // ------------------------------------------------------------------
  // cancelCurrentRound — inverse of nextRound for an unplayed round.
  //
  // Only the LATEST round can be cancelled (deleting a middle round would
  // break round indices and match_log roundIndex references), and only when
  // no court has a recorded winner (⇒ no match_log rows exist for it, since
  // recordWinner(null) also deletes its row). Because nextRound's RNG is
  // seeded with rngSeed + rounds.length and all inputs are reverted here,
  // pressing 次 again after a cancel regenerates the identical round —
  // cancelling is lossless.
  // ------------------------------------------------------------------
  async function cancelCurrentRound(): Promise<void> {
    const s = session.value;
    if (!s) throw new Error("No active session.");

    const lastIndex = s.rounds.length - 1;
    if (lastIndex < 0) return; // nothing to cancel
    if (s.currentRoundIndex !== lastIndex) {
      throw new Error("最新のラウンドのみ取り消せます。");
    }

    const round = s.rounds[lastIndex]!;
    const hasResult = round.courts.some(c => c.winner === "A" || c.winner === "B");
    if (hasResult) {
      throw new Error("勝敗が記録されたラウンドは取り消せません。");
    }

    // 1. Revert todayStats (inverse of nextRound step 6)
    for (const c of round.courts) {
      for (const r of [...c.teamA, ...c.teamB]) {
        const key = refKey(r);
        const stats = s.todayStats.get(key);
        if (stats) s.todayStats.set(key, { ...stats, play: Math.max(0, stats.play - 1) });
      }
    }
    for (const r of round.resters) {
      const key = refKey(r);
      const stats = s.todayStats.get(key);
      if (stats) s.todayStats.set(key, { ...stats, rest: Math.max(0, stats.rest - 1) });
    }

    // 2. Revert fairness weights (inverse of nextRound step 7)
    applyRoundToHistory(history, round.courts, -1);
    applyRoundToSameSession(sameSession, round.courts, -1);

    // 3. Drop the round and step the cursor back
    s.rounds.pop();
    s.currentRoundIndex = s.rounds.length - 1;
    s.prevResters = s.rounds[s.currentRoundIndex]?.resters ?? [];

    session.value = { ...s };

    // 4. Persist
    await sessionRepo.upsert(toSessionRow(session.value));
  }

  // ------------------------------------------------------------------
  // recordWinner
  // ------------------------------------------------------------------
  async function recordWinner(courtNumber: number, winner: "A" | "B" | null): Promise<void> {
    const s = session.value;
    if (!s) throw new Error("No active session.");

    const round = s.rounds[s.currentRoundIndex];
    if (!round) throw new Error(`No round at index ${s.currentRoundIndex}.`);

    const court = round.courts.find(c => c.number === courtNumber);
    if (!court) throw new Error(`Court ${courtNumber} not found in current round.`);

    const teamAIds = memberIdsFrom(court.teamA);
    const teamBIds = memberIdsFrom(court.teamB);
    const bothSidesHaveMembers = teamAIds.length > 0 && teamBIds.length > 0;

    // Mutate + publish the new winner BEFORE awaiting network work. Otherwise
    // a network failure (or a slow RPC) leaves the in-memory winner set but
    // the signal stale, so the green tick only appears on the next unrelated
    // re-render (e.g. toggling the 名前 checkbox).
    court.winner = winner === null ? "none" : winner;
    session.value = { ...s };

    if (bothSidesHaveMembers) {
      try {
        // Always clear any prior log row for this court first.
        await matchLogRepo.deleteByRoundCourt(s.id, s.currentRoundIndex, teamAIds);
        if (winner !== null) {
          await matchLogRepo.add({
            sessionId: s.id,
            roundIndex: s.currentRoundIndex,
            courtType: court.type,
            teamA: teamAIds,
            teamB: teamBIds,
            winner,
          });
        }
      } catch (e) {
        console.error("recordWinner: match_log sync failed", e);
        throw e;
      }
    }

    await sessionRepo.upsert(toSessionRow(session.value));
  }

  // ------------------------------------------------------------------
  // endSession
  // ------------------------------------------------------------------
  async function endSession(): Promise<void> {
    const s = session.value;
    if (!s) return; // silent no-op

    // Persist pair history accumulated during the session
    const updates: { a: number; b: number; partnerW: number; opponentW: number }[] = [];
    for (const [key, partnerW] of history.partnerW) {
      const [aStr, bStr] = key.split(":");
      const a = parseInt(aStr!, 10);
      const b = parseInt(bStr!, 10);
      const opponentW = history.opponentW.get(pairKey(a, b)) ?? 0;
      updates.push({ a, b, partnerW, opponentW });
    }
    // Also flush opponent-only pairs (pairs that appeared as opponents but never as partners)
    for (const [key, opponentW] of history.opponentW) {
      const [aStr, bStr] = key.split(":");
      const a = parseInt(aStr!, 10);
      const b = parseInt(bStr!, 10);
      // Skip if already included via partnerW iteration
      if (!history.partnerW.has(pairKey(a, b))) {
        updates.push({ a, b, partnerW: 0, opponentW });
      }
    }
    if (updates.length > 0) {
      await historyRepo.upsertPairWeights(updates);
    }

    // Mark session as past. Use UPDATE (not upsert) — upsert evaluates the
    // INSERT WITH CHECK clause, which the v1.1 RLS policy restricts to
    // status='ongoing'. UPDATE-only avoids that path entirely.
    s.status = "past";
    await sessionRepo.update(toSessionRow(s));

    // Clear signal
    session.value = null;
  }

  // ------------------------------------------------------------------
  // resume — re-hydrate from DB after a reload (browser tab lifecycle,
  // phone lock killing the PWA, etc). Without this, sessionStore.session
  // stays null after reload even though `sessions` has an ongoing row,
  // so /session/round shows "セッションが開始されていません" and the
  // operator has no path back to today's match short of starting fresh.
  // ------------------------------------------------------------------
  async function resume(): Promise<void> {
    if (session.value) return;
    const row = await sessionRepo.loadOngoing();
    if (!row) return;

    // Reload pair history (next-round balancer needs it).
    history = await historyRepo.loadPairHistory();
    decayHistory(history);

    // Reconstruct rounds + sameSession from the persisted JSONB.
    const rounds = (row.rounds ?? []) as Round[];
    sameSession = { partner: new Map(), opp: new Map() };
    for (const r of rounds) {
      applyRoundToSameSession(sameSession, r.courts);
    }

    // today_stats was serialised as a plain Record; rebuild the Map.
    const todayStats = new Map<string, { play: number; rest: number }>();
    for (const [key, val] of Object.entries(row.today_stats ?? {})) {
      todayStats.set(key, val as { play: number; rest: number });
    }

    // prevResters comes from whatever round is current — used by the
    // rester-selector so the same people don't sit out twice in a row.
    const currentIdx = row.current_round_index;
    const lastRound = currentIdx >= 0 ? rounds[currentIdx] : undefined;
    const prevResters = lastRound?.resters ?? [];

    const date = new Date(row.date);
    const s: InMemorySession = {
      id: row.id,
      status: row.status,
      plannedSessionId: row.planned_session_id,
      date,
      location: row.location,
      courtCount: row.court_count,
      allowSingles: row.allow_singles,
      attendees: row.attendees as InMemorySession["attendees"],
      rounds,
      currentRoundIndex: currentIdx,
      todayStats,
      prevResters,
      rngSeed: deriveRngSeed(date),
      hostToken: row.host_token ?? null,
      hostLabel: row.host_label ?? null,
    };

    session.value = s;
  }

  return { session, startNewSession, nextRound, goToPreviousRound, cancelCurrentRound, recordWinner, endSession, resume };
}
