import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { memberIdsFrom } from "@/engine/models";
import { rosterStore, sessionRepo, matchLogRepo, pinStore } from "@/ui/stores";
import type { SessionRow } from "@/data/session-repository";
import { CourtView } from "@/ui/components/court-view";
import { linkTo } from "@/ui/router";
import { useRequirePin } from "@/ui/components/pin-modal";

const list = signal<SessionRow[]>([]);
const loading = signal(true);
const selected = signal<SessionRow | null>(null);
const showNames = signal(true);
const busy = signal(false);

export function resetPastSessionsState(): void {
  list.value = [];
  loading.value = true;
  selected.value = null;
  showNames.value = true;
  busy.value = false;
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
 */
async function updatePastCourtWinner(
  session: SessionRow,
  roundIndex: number,
  courtNumber: number,
  newWinner: "A" | "B" | null,
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

  if (newWinner === null) {
    court.winner = "none";
    if (bothSidesHaveMembers) {
      await matchLogRepo.deleteByRoundCourt(session.id, roundIndex, teamAIds);
    }
  } else {
    court.winner = newWinner;
    if (bothSidesHaveMembers) {
      await matchLogRepo.deleteByRoundCourt(session.id, roundIndex, teamAIds);
      await matchLogRepo.add({
        sessionId: session.id,
        roundIndex,
        courtType: court.type,
        teamA: teamAIds,
        teamB: teamBIds,
        winner: newWinner,
      });
    }
  }

  const updated: SessionRow = { ...session, rounds };
  await sessionRepo.update(updated);
  return updated;
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

  async function handleSetWinner(roundIndex: number, courtNumber: number, w: "A" | "B" | null) {
    try {
      const updated = await updatePastCourtWinner(session, roundIndex, courtNumber, w);
      selected.value = updated;
      list.value = list.value.map((s) => (s.id === updated.id ? updated : s));
    } catch (e) {
      console.error("update past winner failed", e);
      alert(`勝敗の更新に失敗しました:\n${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleDelete() {
    gate(async () => {
      const pin = pinStore.getPin();
      if (!pin) {
        alert("PIN が取得できませんでした");
        return;
      }
      busy.value = true;
      try {
        await sessionRepo.deleteById(session.id, pin);
        list.value = list.value.filter((s) => s.id !== session.id);
        selected.value = null;
      } catch (e) {
        console.error("delete session failed", e);
        alert(`セッション削除に失敗しました:\n${e instanceof Error ? e.message : String(e)}`);
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
          onClick={() => {
            if (!confirm("このセッションを削除します。\n試合結果もランキングから除かれます。\nよろしいですか？")) return;
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
