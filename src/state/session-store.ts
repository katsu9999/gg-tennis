import { signal, type Signal } from "@preact/signals";
import type { AttendeeRef, Gender, PairHistory, Round, SameSessionStats } from "@/engine/models";
import { memberIdsFrom, pairKey } from "@/engine/models";
import {
  DEFAULT_SHUFFLE_CONFIG,
  normalizeShuffleConfig,
  type ShuffleConfig,
} from "@/engine/shuffle-config";
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
  /** `left: true` は途中で帰った人。番号・実施済みラウンドの記録はそのまま残し、
   *  以降のラウンド生成からだけ外す（成績サマリーには載る）。 */
  attendees: { ref: AttendeeRef; todayNumber: number; isGuest: boolean; guestName?: string; gender?: Gender; left?: boolean }[];
  rounds: Round[];
  currentRoundIndex: number;
  /** Per-attendee play/rest/singles counts keyed by JSON.stringify(ref). */
  todayStats: Map<string, { play: number; rest: number; singles: number }>;
  prevResters: AttendeeRef[];
  /** Attendees who played singles in the current round — feeds singles-fairness. */
  prevSingles: AttendeeRef[];
  rngSeed: number;
  /** v1.6: shuffle rules snapshot chosen on the new-session screen. */
  shuffleConfig: ShuffleConfig;
  /** v1.1 Model A: LocalStorage token of whoever started the session. */
  hostToken: string | null;
  /** v1.1 Model A: display label for the host. */
  hostLabel: string | null;
  /** ISO timestamp of when the session was started. Set once at
   *  startNewSession and preserved across saves/resume — every save used to
   *  stamp created_at with "now", which destroyed the session timeline
   *  (2026-07-18: four same-day rows, none with a truthful start time). */
  createdAt: string;
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
  /** v1.6: shuffle rules chosen on the new-session screen. */
  shuffleConfig?: ShuffleConfig;
  /** v1.6: memberId → gender, snapshotted into attendees at start. */
  memberGenders?: ReadonlyMap<number, Gender>;
}

export interface ChangeAttendeesInput {
  /** 変更後の参加メンバー全員（今いる人 ＋ 途中から来た人。帰った人は含めない）。 */
  memberIds: number[];
  /** memberId → gender。追加メンバーの性別スナップショット用。 */
  memberGenders?: ReadonlyMap<number, Gender>;
}

export interface ChangeAttendeesResult {
  added: number;
  left: number;
  /** 組み直した未実施ラウンドの先頭 index。組み直しが無ければ null。 */
  regeneratedFrom: number | null;
  totalRounds: number;
}

export interface SessionStore {
  session: Signal<InMemorySession | null>;
  /** True while nextRound() is in flight — used to disable buttons so a
   *  double-tap can't generate two rounds back-to-back. */
  generating: Signal<boolean>;
  startNewSession(input: StartNewSessionInput): Promise<void>;
  nextRound(): Promise<void>;
  /** 夜のぶんをまとめて組む（LINEに1通で流すため）。既に組んである分は数に含む。 */
  generateRounds(count: number): Promise<void>;
  /** 途中参加・途中離脱。今表示中のラウンドまではそのまま残し、先に組んだだけの
   *  未実施ラウンドを新しいメンバー構成で組み直す。 */
  changeAttendees(input: ChangeAttendeesInput): Promise<ChangeAttendeesResult>;
  goToPreviousRound(): void;
  recordWinner(courtNumber: number, winner: "A" | "B" | null): Promise<void>;
  endSession(): Promise<void>;
  /** 今いるラウンドで締める。先に組んだだけでやらなかったラウンドは捨て、
   *  出場・休み回数とペア履歴を残ったラウンドから組み直す。 */
  endSessionAtCurrentRound(): Promise<void>;
  /** Delete the ongoing session without keeping it in history and without
   *  flushing pair-history weights. For sessions that were started but never
   *  actually played (no winner recorded) — keeping those as 'past' rows
   *  pollutes the session list and skews fairness weights with pairings that
   *  never happened on court. */
  discardSession(): Promise<void>;
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
    created_at: s.createdAt,
    host_token: s.hostToken,
    host_label: s.hostLabel,
    shuffle_config: s.shuffleConfig,
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
  const generating = signal(false);

  // Closure-scoped engine state — not serialised to DB (except history on endSession)
  let history: PairHistory = { partnerW: new Map(), opponentW: new Map() };
  let sameSession: SameSessionStats = { partner: new Map(), opp: new Map() };

  // ------------------------------------------------------------------
  // startNewSession
  // ------------------------------------------------------------------
  async function startNewSession(input: StartNewSessionInput): Promise<void> {
    // 0. Refuse to create a second ongoing row — a stale un-ended session
    // would make loadOngoing/home ambiguous and can shadow today's data.
    const existing = await sessionRepo.loadOngoing();
    if (existing) {
      throw new Error(
        "前回のセッションが未終了です。ホーム画面の「今すぐ終了」で終了してから開始してください。",
      );
    }

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
      gender: input.memberGenders?.get(id) ?? "unknown",
    }));

    // 3. Initialise todayStats
    const todayStats = new Map<string, { play: number; rest: number; singles: number }>();
    for (const a of attendees) {
      todayStats.set(refKey(a.ref), { play: 0, rest: 0, singles: 0 });
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
      prevSingles: [],
      rngSeed: deriveRngSeed(input.date),
      shuffleConfig: input.shuffleConfig ? { ...input.shuffleConfig } : { ...DEFAULT_SHUFFLE_CONFIG },
      hostToken: input.hostToken ?? null,
      hostLabel: input.hostLabel ?? null,
      createdAt: new Date().toISOString(),
    };

    session.value = s;

    // 5. Persist
    await sessionRepo.upsert(toSessionRow(s));
  }

  // ------------------------------------------------------------------
  // nextRound
  // ------------------------------------------------------------------
  async function nextRound(): Promise<void> {
    // Re-entrancy guard: a double-tap on 次/ラウンド開始 must not generate two
    // rounds (the second would skip on screen and corrupt rest rotation).
    if (generating.value) return;
    generating.value = true;
    try {
      await nextRoundInner();
    } finally {
      generating.value = false;
    }
  }

  async function nextRoundInner(): Promise<void> {
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

    generateOneRound(s);
    session.value = { ...s };
    await sessionRepo.upsert(toSessionRow(session.value));
  }

  /** 1ラウンド組んで s に積む（永続化はしない）。
   *
   *  夜のぶんをまとめて先に組めるよう、生成だけを切り出してある。
   *  ここで play/rest/singles とペア履歴も進むので、**組んだラウンドは
   *  やった扱いになる**。実際にやらなかったぶんは
   *  endSessionAtCurrentRound で捨てて統計を組み直す。 */
  function generateOneRound(s: InMemorySession): void {
    // 途中で帰った人（left）はコートにも休憩にも入れない。番号と実施済みの
    // 記録は attendees に残したまま、これ以降の組み合わせからだけ外す。
    const refs = s.attendees.filter(a => !a.left).map(a => a.ref);
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

    // 4. Build courts. Feed per-player singles counts + who played singles last
    // round so the builder rotates singles fairly (nobody gets it twice before
    // everyone's had a turn, and no back-to-back singles).
    const singlesCount = new Map<string, number>();
    for (const [key, stats] of s.todayStats) {
      singlesCount.set(key, stats.singles);
    }
    const prevSinglesSet = new Set(s.prevSingles.map(refKey));
    const genderOf = new Map<string, Gender>();
    for (const a of s.attendees) genderOf.set(refKey(a.ref), a.gender ?? "unknown");
    const { courts } = buildRound(
      seated,
      plan.doublesCourts,
      plan.singlesCourts,
      history,
      sameSession,
      rng,
      singlesCount,
      prevSinglesSet,
      { genderOf, config: s.shuffleConfig },
    );

    // 5. Assemble Round
    const roundIndex = s.rounds.length;
    const round: Round = { index: roundIndex, courts, resters };

    // 6. Update todayStats (play/singles per court, rest for benched players).
    const singlesPlayers: AttendeeRef[] = [];
    for (const c of courts) {
      for (const r of [...c.teamA, ...c.teamB]) {
        const key = refKey(r);
        const stats = s.todayStats.get(key) ?? { play: 0, rest: 0, singles: 0 };
        const bumpSingles = c.type === "singles" ? 1 : 0;
        if (bumpSingles) singlesPlayers.push(r);
        s.todayStats.set(key, { ...stats, play: stats.play + 1, singles: stats.singles + bumpSingles });
      }
    }
    for (const r of resters) {
      const key = refKey(r);
      const stats = s.todayStats.get(key) ?? { play: 0, rest: 0, singles: 0 };
      s.todayStats.set(key, { ...stats, rest: stats.rest + 1 });
    }

    // 7. Update engine state
    applyRoundToHistory(history, courts);
    applyRoundToSameSession(sameSession, courts);

    // 8. Update session
    s.rounds.push(round);
    s.currentRoundIndex = roundIndex;
    s.prevResters = resters;
    s.prevSingles = singlesPlayers;

    // Trigger signal reactivity by reassigning. Note: this is a shallow spread —
    // `rounds`/`todayStats` are the same references as before the mutations above.
    // Adequate for v1 (Preact subscribers re-read on render). Time-travel / undo
    // would need a deep clone here.
  }

  // ------------------------------------------------------------------
  // generateRounds — 夜のぶんをまとめて組む（LINEに1通で流すため）
  // ------------------------------------------------------------------
  async function generateRounds(count: number): Promise<void> {
    if (generating.value) return;
    generating.value = true;
    try {
      const s = session.value;
      if (!s) throw new Error("No active session. Call startNewSession first.");
      while (s.rounds.length < count) generateOneRound(s);
      // 表示は1ラウンド目に戻す。先に全部組んでも進行は1本ずつ。
      s.currentRoundIndex = 0;
      session.value = { ...s };
      await sessionRepo.upsert(toSessionRow(session.value));
    } finally {
      generating.value = false;
    }
  }

  // ------------------------------------------------------------------
  // changeAttendees — 途中参加・途中離脱
  // ------------------------------------------------------------------
  //
  // 夜のぶんを先に6本組む運用なので、遅れて来た人・先に帰る人が出ると
  // 「もう組んであるラウンド」が実態とズレる。今表示中のラウンドまでは
  // 手をつけず、その先の未実施ラウンドだけを新しい構成で組み直す。
  //
  // 途中から来た人の play/rest は 0 から始まる（Katsu 決定 2026-09-05）。
  // rester-selector はプレー数が多い順に休ませるので、来たばかりの人が
  // 数ラウンド続けて出て、待っていた人が休みに入る。
  async function changeAttendees(input: ChangeAttendeesInput): Promise<ChangeAttendeesResult> {
    if (generating.value) throw new Error("ラウンドを生成中です。少し待ってからやり直してください。");
    const s = session.value;
    if (!s) throw new Error("No active session.");

    // 先に検証してから壊す。ゲストは名簿に載らないので常に在席扱い。
    const wanted = new Set(input.memberIds);
    const guestCount = s.attendees.filter(a => a.ref.kind !== "member").length;
    if (wanted.size + guestCount < 2) {
      throw new Error("参加者が2人未満になります。1人以上残してください。");
    }

    generating.value = true;
    try {
      // 通信は先に済ませる。ここから下は同期で、途中で失敗しない。
      const total = s.rounds.length;
      const keep = Math.max(s.currentRoundIndex + 1, 0);
      const needsRebuild = total > keep;
      let freshHistory: PairHistory | null = null;
      if (needsRebuild) {
        freshHistory = await historyRepo.loadPairHistory();
        decayHistory(freshHistory);
      }

      let added = 0;
      let left = 0;

      const known = new Set<number>();
      for (const a of s.attendees) {
        if (a.ref.kind !== "member") continue;
        known.add(a.ref.memberId);
        const stays = wanted.has(a.ref.memberId);
        if (stays && a.left) a.left = false;          // 帰ったつもりが戻ってきた
        else if (!stays && !a.left) { a.left = true; left += 1; }
      }

      for (const id of input.memberIds) {
        if (known.has(id)) continue;
        known.add(id);                                 // 同じ id が2回来ても増やさない
        const ref: AttendeeRef = { kind: "member", memberId: id };
        s.attendees.push({
          ref,
          todayNumber: s.attendees.length + 1,
          isGuest: false,
          gender: input.memberGenders?.get(id) ?? "unknown",
        });
        s.todayStats.set(refKey(ref), { play: 0, rest: 0, singles: 0 });
        added += 1;
      }

      let regeneratedFrom: number | null = null;
      if (needsRebuild && freshHistory) {
        s.rounds = s.rounds.slice(0, keep);
        rebuildFromRoundsWith(s, freshHistory);
        while (s.rounds.length < total) generateOneRound(s);
        s.currentRoundIndex = keep - 1;
        regeneratedFrom = keep;
      }

      session.value = { ...s };
      await sessionRepo.upsert(toSessionRow(session.value));
      return { added, left, regeneratedFrom, totalRounds: s.rounds.length };
    } finally {
      generating.value = false;
    }
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
  // endSessionAtCurrentRound — 今いるラウンドで夜を締める
  // ------------------------------------------------------------------
  //
  // 全ラウンドを先に組む運用（LINE 1通化）だと、6本組んで5本で終わる夜が出る。
  // ラウンドは**組んだ時点で** play/rest/singles とペア履歴に載るので、
  // そのまま終了すると「やっていない6本目」が休み回数・成績・
  // 次回以降のペア重みに混ざる。捨ててから組み直す。
  async function endSessionAtCurrentRound(): Promise<void> {
    const s = session.value;
    if (!s) return; // silent no-op, mirroring endSession

    const keep = s.currentRoundIndex + 1;
    if (keep > 0 && keep < s.rounds.length) {
      s.rounds = s.rounds.slice(0, keep);
      await rebuildFromRounds(s);
      s.currentRoundIndex = s.rounds.length - 1;
      session.value = { ...s };
    }
    await endSession();
  }

  /** 残っているラウンドだけから todayStats・sameSession・ペア履歴を組み直す。
   *
   *  履歴はセッション中ずっと closure に積まれるだけで巻き戻せないので、
   *  リポジトリから読み直して残ったラウンドを再生する（resume と同じ手）。 */
  async function rebuildFromRounds(s: InMemorySession): Promise<void> {
    const fresh = await historyRepo.loadPairHistory();
    decayHistory(fresh);
    rebuildFromRoundsWith(s, fresh);
  }

  /** rebuildFromRounds の同期版。読み直し済みのペア履歴を渡す。
   *
   *  ネットワーク待ちを外に出すためだけの分割。セッションを書き換えている
   *  途中で await すると、通信が落ちたときに「ラウンドは削ったが保存も
   *  やり直しもできない」中途半端な状態が残る（resume() は session が
   *  非 null だと DB を読み直さないので、その状態が固定される）。 */
  function rebuildFromRoundsWith(s: InMemorySession, freshHistory: PairHistory): void {
    for (const a of s.attendees) {
      s.todayStats.set(refKey(a.ref), { play: 0, rest: 0, singles: 0 });
    }
    sameSession = { partner: new Map(), opp: new Map() };
    history = freshHistory;

    for (const r of s.rounds) {
      for (const c of r.courts) {
        for (const ref of [...c.teamA, ...c.teamB]) {
          const key = refKey(ref);
          const st = s.todayStats.get(key) ?? { play: 0, rest: 0, singles: 0 };
          s.todayStats.set(key, {
            ...st,
            play: st.play + 1,
            singles: st.singles + (c.type === "singles" ? 1 : 0),
          });
        }
      }
      for (const ref of r.resters) {
        const key = refKey(ref);
        const st = s.todayStats.get(key) ?? { play: 0, rest: 0, singles: 0 };
        s.todayStats.set(key, { ...st, rest: st.rest + 1 });
      }
      applyRoundToHistory(history, r.courts);
      applyRoundToSameSession(sameSession, r.courts);
    }

    const last = s.rounds.at(-1);
    s.prevResters = last ? last.resters : [];
    s.prevSingles = last
      ? last.courts.filter((c) => c.type === "singles").flatMap((c) => [...c.teamA, ...c.teamB])
      : [];
  }

  // ------------------------------------------------------------------
  // discardSession
  // ------------------------------------------------------------------
  async function discardSession(): Promise<void> {
    const s = session.value;
    if (!s) return; // silent no-op, mirroring endSession

    // Delete first: if the DB rejects (RLS, already ended elsewhere), keep
    // the in-memory session so the operator can still end it normally.
    await sessionRepo.deleteOngoing(s.id);

    // In-memory pair-history mutations from the discarded rounds die with the
    // closure: startNewSession/resume both reload history from the repo.
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

    // Reconstruct rounds + sameSession from the persisted JSONB, and replay
    // them into pair history too — history only reaches the DB at endSession,
    // so rounds played before the reload exist nowhere else. Skipping this
    // silently drops them from cross-session fairness weights.
    const rounds = (row.rounds ?? []) as Round[];
    sameSession = { partner: new Map(), opp: new Map() };
    for (const r of rounds) {
      applyRoundToSameSession(sameSession, r.courts);
      applyRoundToHistory(history, r.courts);
    }

    // today_stats was serialised as a plain Record; rebuild the Map. Rows
    // persisted before singles-fairness lack `singles` — default it to 0.
    const todayStats = new Map<string, { play: number; rest: number; singles: number }>();
    for (const [key, val] of Object.entries(row.today_stats ?? {})) {
      const v = val as { play: number; rest: number; singles?: number };
      todayStats.set(key, { play: v.play, rest: v.rest, singles: v.singles ?? 0 });
    }

    // prevResters comes from whatever round is current — used by the
    // rester-selector so the same people don't sit out twice in a row.
    // prevSingles likewise feeds the singles-fairness rotation.
    const currentIdx = row.current_round_index;
    const lastRound = currentIdx >= 0 ? rounds[currentIdx] : undefined;
    const prevResters = lastRound?.resters ?? [];
    const prevSingles = (lastRound?.courts ?? [])
      .filter(c => c.type === "singles")
      .flatMap(c => [...c.teamA, ...c.teamB]);

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
      prevSingles,
      rngSeed: deriveRngSeed(date),
      shuffleConfig: normalizeShuffleConfig(row.shuffle_config),
      hostToken: row.host_token ?? null,
      hostLabel: row.host_label ?? null,
      createdAt: row.created_at,
    };

    session.value = s;
  }

  return { session, generating, startNewSession, nextRound, generateRounds, changeAttendees, goToPreviousRound, recordWinner, endSession, endSessionAtCurrentRound, discardSession, resume };
}

/** True when at least one court in any round has a recorded winner. Used by
 *  the end-session UIs to offer discarding never-played sessions instead of
 *  keeping them as junk 'past' rows. */
export function sessionHasResults(s: InMemorySession): boolean {
  return s.rounds.some(r => r.courts.some(c => c.winner === "A" || c.winner === "B"));
}
