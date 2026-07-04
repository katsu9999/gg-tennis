import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { memberIdsFrom } from "@/engine/models";
import { rosterStore, sessionRepo, matchLogRepo, pinStore, rankingStore } from "@/ui/stores";
import type { SessionRow } from "@/data/session-repository";
import { CourtView } from "@/ui/components/court-view";
import { linkTo } from "@/ui/router";
import { useRequirePin } from "@/ui/components/pin-modal";
import { appDialog } from "@/ui/components/app-dialog";

const list = signal<SessionRow[]>([]);
const loading = signal(true);
const selected = signal<SessionRow | null>(null);
const showNames = signal(false);
const busy = signal(false);

export function resetPastSessionsState(): void {
  list.value = [];
  loading.value = true;
  selected.value = null;
  showNames.value = false;
  busy.value = false;
}

/** Supabase errors are plain `{ message, details, hint, code }` objects, not
 *  Error instances, so `String(err)` turns them into "[object Object]". This
 *  surfaces every useful field so the operator can see what actually broke. */
function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.details === "string") parts.push(`details: ${o.details}`);
    if (typeof o.hint === "string") parts.push(`hint: ${o.hint}`);
    if (typeof o.code === "string") parts.push(`code: ${o.code}`);
    if (parts.length) return parts.join("\n");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    list.value = await sessionRepo.loadPast();
  } finally {
    loading.value = false;
  }
}

function attendeesOf(s: SessionRow): { ref: AttendeeRef; todayNumber: number; isGuest: boolean; guestName?: string }[] {
  return (s.attendees as { ref: AttendeeRef; todayNumber: number; isGuest: boolean; guestName?: string }[]) ?? [];
}

interface PastCourt {
  number: number;
  type: "doubles" | "singles";
  teamA: AttendeeRef[];
  teamB: AttendeeRef[];
  winner: "A" | "B" | "none";
}
interface PastRound {
  index: number;
  courts: PastCourt[];
  resters: AttendeeRef[];
}

function roundsOf(s: SessionRow): PastRound[] {
  return (s.rounds as PastRound[]) ?? [];
}

/**
 * Update a court winner in a past session — mutates the JSONB rounds blob and
 * adjusts match_log so rankings stay consistent.
 *
 * Past sessions are frozen for direct anon writes (RLS, migration 0008), so
 * this goes through the PIN-gated edit_past_court_winner RPC, which replaces
 * the match_log row and stores the updated rounds JSONB atomically.
 */
async function updatePastCourtWinner(
  session: SessionRow,
  roundIndex: number,
  courtNumber: number,
  newWinner: "A" | "B" | null,
  pin: string,
): Promise<SessionRow> {
  const rounds = roundsOf(session).map((r) => ({
    ...r,
    courts: r.courts.map((c) => ({ ...c })),
  }));
  const round = rounds[roundIndex];
  if (!round) throw new Error(`round ${roundIndex} not found`);
  const court = round.courts.find((c) => c.number === courtNumber);
  if (!court) throw new Error(`court ${courtNumber} not in round ${roundIndex}`);

  const teamAIds = memberIdsFrom(court.teamA);
  const teamBIds = memberIdsFrom(court.teamB);
  const bothSidesHaveMembers = teamAIds.length > 0 && teamBIds.length > 0;

  court.winner = newWinner === null ? "none" : newWinner;

  await matchLogRepo.editPastCourtWinner({
    pin,
    sessionId: session.id,
    roundIndex,
    teamA: teamAIds,
    teamB: teamBIds,
    courtType: court.type,
    // Guest-only courts never had a match_log row — only update the JSONB.
    winner: bothSidesHaveMembers ? newWinner : null,
    rounds,
  });

  return { ...session, rounds };
}

function SessionDetail({ session }: { session: SessionRow }) {
  const attendees = attendeesOf(session);
  const rounds = roundsOf(session);
  const { gate, modal } = useRequirePin();

  const todayNumbers: Record<number, number> = {};
  for (const a of attendees) {
    if (a.ref.kind === "member") todayNumbers[a.ref.memberId] = a.todayNumber;
  }
  const byMemberId = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));
  const nameFor = (ref: AttendeeRef): string | null => {
    if (ref.kind === "member") return byMemberId.get(ref.memberId) ?? null;
    return null;
  };

  function handleSetWinner(roundIndex: number, courtNumber: number, w: "A" | "B" | null) {
    gate(async () => {
      const pin = pinStore.getPin();
      if (!pin) {
        void appDialog.alert("PIN が取得できませんでした");
        return;
      }
      try {
        const updated = await updatePastCourtWinner(session, roundIndex, courtNumber, w, pin);
        selected.value = updated;
        list.value = list.value.map((s) => (s.id === updated.id ? updated : s));
        // Refresh ranking so deleted/edited results are reflected immediately.
        void rankingStore.load();
      } catch (e) {
        console.error("update past winner failed", e);
        void appDialog.alert(`勝敗の更新に失敗しました:\n${formatError(e)}`);
      }
    });
  }

  function handleDelete() {
    gate(async () => {
      const pin = pinStore.getPin();
      if (!pin) {
        void appDialog.alert("PIN が取得できませんでした");
        return;
      }
      busy.value = true;
      try {
        await sessionRepo.deleteById(session.id, pin);
        list.value = list.value.filter((s) => s.id !== session.id);
        selected.value = null;
        // Refresh ranking — match_log cascades on session delete, so pair/elo
        // counts must drop. Without this, the page shows stale numbers until
        // the user manually navigates away and back.
        void rankingStore.load();
      } catch (e) {
        console.error("delete session failed", e);
        void appDialog.alert(`セッション削除に失敗しました:\n${formatError(e)}`);
      } finally {
        busy.value = false;
      }
    });
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      {modal}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          type="button"
          data-testid="past-back"
          onClick={() => { selected.value = null; }}
          style={{
            background: "transparent",
            border: "1.5px solid var(--line)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← 一覧へ
        </button>
        <button
          type="button"
          data-testid="past-delete"
          disabled={busy.value}
          onClick={async () => {
            if (!(await appDialog.confirm("このセッションを削除します。\n試合結果もランキングから除かれます。\nよろしいですか？"))) return;
            handleDelete();
          }}
          style={{
            background: "transparent",
            border: "1.5px solid #b00020",
            color: "#b00020",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: busy.value ? "not-allowed" : "pointer",
          }}
        >
          {busy.value ? "削除中…" : "🗑 削除"}
        </button>
      </div>

      <h2 style={{ marginTop: 12, fontSize: 18 }}>
        {session.date} @ {session.location}
      </h2>
      <p class="muted" style={{ fontSize: 13, margin: "4px 0" }}>
        {attendees.length}人 · {session.court_count}コート · {rounds.length}ラウンド
      </p>

      <label style={{ display: "block", margin: "8px 0", fontWeight: 700, fontSize: 13 }}>
        <input
          type="checkbox"
          data-testid="past-name-toggle"
          checked={showNames.value}
          onInput={(e) => { showNames.value = (e.currentTarget as HTMLInputElement).checked; }}
        />
        {" "}名前で表示
      </label>

      {rounds.map((round) => (
        <section key={round.index} data-testid={`past-round-${round.index}`} style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "6px 0", fontSize: 14 }}>R{round.index + 1}</h3>
          {round.courts.map((c) => (
            <CourtView
              key={c.number}
              court={c}
              todayNumbers={todayNumbers}
              nameFor={nameFor}
              showNames={showNames.value}
              onSetWinner={(w) => { void handleSetWinner(round.index, c.number, w); }}
            />
          ))}
        </section>
      ))}
    </main>
  );
}

export function PastSessionsPage() {
  useEffect(() => {
    void rosterStore.load();
    void loadList();
  }, []);

  if (selected.value) {
    return <SessionDetail session={selected.value} />;
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>過去セッション</h2>

      {loading.value && <p class="muted" data-testid="past-loading">読み込み中…</p>}

      {!loading.value && list.value.length === 0 && (
        <p class="muted">まだ過去セッションがありません。</p>
      )}

      {list.value.map((s) => (
        <div
          key={s.id}
          class="card"
          data-testid={`past-${s.id}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: 8,
          }}
          onClick={() => { selected.value = s; }}
        >
          <span>
            <strong>{s.date}</strong>{" "}
            <span class="muted">@ {s.location}</span>
          </span>
          <span class="muted" style={{ fontSize: 13 }}>
            {(s.attendees as unknown[]).length}人 · {(s.rounds as unknown[]).length}R
          </span>
        </div>
      ))}

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>← ホーム</a>
      </p>
    </main>
  );
}
