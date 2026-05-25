import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { rosterStore, sessionRepo } from "@/ui/stores";
import type { SessionRow } from "@/data/session-repository";
import { CourtView } from "@/ui/components/court-view";

const list = signal<SessionRow[]>([]);
const loading = signal(true);
const selected = signal<SessionRow | null>(null);
const showNames = signal(true);

export function resetPastSessionsState(): void {
  list.value = [];
  loading.value = true;
  selected.value = null;
  showNames.value = true;
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

function roundsOf(s: SessionRow): { index: number; courts: { number: number; type: "doubles" | "singles"; teamA: AttendeeRef[]; teamB: AttendeeRef[]; winner: "A" | "B" | "none" }[]; resters: AttendeeRef[] }[] {
  return (s.rounds as { index: number; courts: { number: number; type: "doubles" | "singles"; teamA: AttendeeRef[]; teamB: AttendeeRef[]; winner: "A" | "B" | "none" }[]; resters: AttendeeRef[] }[]) ?? [];
}

function SessionDetail({ session }: { session: SessionRow }) {
  const attendees = attendeesOf(session);
  const rounds = roundsOf(session);

  const todayNumbers: Record<number, number> = {};
  for (const a of attendees) {
    if (a.ref.kind === "member") todayNumbers[a.ref.memberId] = a.todayNumber;
  }
  const byMemberId = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));
  const nameFor = (ref: AttendeeRef): string | null => {
    if (ref.kind === "member") return byMemberId.get(ref.memberId) ?? null;
    return null;
  };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
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

      <h2 style={{ marginTop: 16 }}>
        {session.date} @ {session.location}
      </h2>
      <p class="muted" style={{ fontSize: 14 }}>
        {attendees.length}人 · {session.court_count}コート · {rounds.length}ラウンド
      </p>

      <label style={{ display: "block", margin: "12px 0", fontWeight: 700, fontSize: 14 }}>
        <input
          type="checkbox"
          data-testid="past-name-toggle"
          checked={showNames.value}
          onInput={(e) => { showNames.value = (e.currentTarget as HTMLInputElement).checked; }}
        />
        {" "}名前で表示
      </label>

      {rounds.map((round) => (
        <section key={round.index} data-testid={`past-round-${round.index}`} style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "8px 0", fontSize: 16 }}>R{round.index + 1}</h3>
          {round.courts.map((c) => (
            <CourtView
              key={c.number}
              court={c}
              todayNumbers={todayNumbers}
              nameFor={nameFor}
              showNames={showNames.value}
              onSetWinner={() => undefined}
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
        <a href="/">← ホーム</a>
      </p>
    </main>
  );
}
