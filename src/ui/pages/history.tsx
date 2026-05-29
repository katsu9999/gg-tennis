import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { CourtView } from "@/ui/components/court-view";
import { sessionStore, rosterStore } from "@/ui/stores";
import { navigate, linkTo } from "@/ui/router";

// Module-scoped UI state. Survives navigation within the session; reset
// inside `useEffect` based on session/round counts.
const cursor = signal(0);
const showNames = signal(false);

/** Test helper — resets module-scoped UI state. */
export function resetHistoryState(): void {
  cursor.value = 0;
  showNames.value = false;
}

export function HistoryPage() {
  useEffect(() => {
    if (rosterStore.all.value.length === 0) void rosterStore.load();
  }, []);

  const s = sessionStore.session.value;

  if (!s) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>セッションが開始されていません</h2>
        <p><a href={linkTo("/")}>ホームへ</a></p>
      </main>
    );
  }

  if (s.rounds.length === 0) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>履歴なし</h2>
        <p>まだラウンドが生成されていません。</p>
        <p><a href={linkTo("/session/round")}>ラウンド画面へ</a></p>
      </main>
    );
  }

  // Clamp cursor whenever rounds shrink (defensive)
  if (cursor.value > s.rounds.length - 1) cursor.value = s.rounds.length - 1;
  if (cursor.value < 0) cursor.value = 0;

  const round = s.rounds[cursor.value]!;

  const todayNumbers: Record<number, number> = {};
  for (const a of s.attendees) {
    if (a.ref.kind === "member") todayNumbers[a.ref.memberId] = a.todayNumber;
  }

  const byMemberId = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));
  const nameFor = (ref: AttendeeRef): string | null => {
    if (ref.kind === "member") return byMemberId.get(ref.memberId) ?? null;
    return null;
  };

  const resterLabels = round.resters.map((r) => {
    if (r.kind === "member") {
      if (showNames.value) return byMemberId.get(r.memberId) ?? `#${r.memberId}`;
      return String(todayNumbers[r.memberId] ?? "?");
    }
    return "G";
  });

  const atFirst = cursor.value === 0;
  const atLast = cursor.value === s.rounds.length - 1;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          data-testid="prev-round"
          onClick={() => { cursor.value = Math.max(0, cursor.value - 1); }}
          disabled={atFirst}
          style={{
            background: "transparent",
            border: "2px solid var(--ink)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 18,
            fontWeight: 900,
            opacity: atFirst ? 0.4 : 1,
          }}
        >
          ←
        </button>
        <strong style={{ fontSize: 20 }}>
          R{cursor.value + 1} <span class="muted" style={{ fontSize: 14 }}>/ {s.rounds.length}</span>
        </strong>
        <button
          type="button"
          data-testid="next-round"
          onClick={() => { cursor.value = Math.min(s.rounds.length - 1, cursor.value + 1); }}
          disabled={atLast}
          style={{
            background: "transparent",
            border: "2px solid var(--ink)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 18,
            fontWeight: 900,
            opacity: atLast ? 0.4 : 1,
          }}
        >
          →
        </button>
      </header>

      <label style={{ display: "block", margin: "0 0 12px", fontWeight: 700 }}>
        <input
          type="checkbox"
          data-testid="name-toggle"
          checked={showNames.value}
          onInput={(e) => { showNames.value = (e.currentTarget as HTMLInputElement).checked; }}
        />
        {" "}名前で表示
      </label>

      {round.courts.map((c) => (
        <CourtView
          key={c.number}
          court={c}
          todayNumbers={todayNumbers}
          nameFor={nameFor}
          showNames={showNames.value}
          onSetWinner={(w) => {
            sessionStore.recordWinner(c.number, w).catch((e) => {
              console.error("recordWinner failed", e);
              const msg = e instanceof Error
                ? e.message
                : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
              alert(`勝敗の保存に失敗しました:\n${msg}`);
            });
          }}
        />
      ))}

      {resterLabels.length > 0 && (
        <div
          class="card"
          data-testid="history-rester-bar"
          style={{
            background: "var(--rest-bg)",
            color: "var(--rest-fg)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            marginBottom: 16,
          }}
        >
          <strong>休憩</strong>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontWeight: 900 }}>
            {resterLabels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        class="btn-primary"
        style={{ width: "100%" }}
        onClick={() => navigate("/session/round")}
      >
        現在のラウンドへ →
      </button>
    </main>
  );
}
