import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { CourtView } from "@/ui/components/court-view";
import { sessionStore, rosterStore } from "@/ui/stores";
import { navigate } from "@/ui/router";

export function RoundPage() {
  useEffect(() => {
    if (rosterStore.all.value.length === 0) void rosterStore.load();
  }, []);

  const s = sessionStore.session.value;

  if (!s) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>セッションが開始されていません</h2>
        <p><a href="/session/new">新規セッションを作成</a></p>
      </main>
    );
  }

  const round = s.rounds[s.currentRoundIndex];

  if (!round) {
    // Defensive: shouldn't happen if the user came from number-map.
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>R{s.currentRoundIndex + 1} を準備中…</h2>
        <button class="btn-primary" onClick={() => { void sessionStore.nextRound(); }}>
          生成する
        </button>
      </main>
    );
  }

  // memberId → todayNumber lookup
  const todayNumbers: Record<number, number> = {};
  for (const a of s.attendees) {
    if (a.ref.kind === "member") todayNumbers[a.ref.memberId] = a.todayNumber;
  }

  // memberId → name lookup
  const byMemberId = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));
  const nameFor = (ref: AttendeeRef): string | null => {
    if (ref.kind === "member") return byMemberId.get(ref.memberId) ?? null;
    return null;
  };

  const resterNumbers = round.resters
    .map((r) => (r.kind === "member" ? todayNumbers[r.memberId] : null))
    .filter((n): n is number => typeof n === "number");

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
        <strong style={{ fontSize: 22 }}>
          GG <span style={{ color: "var(--muted)", fontSize: 18 }}>· R{s.currentRoundIndex + 1}</span>
        </strong>
        <span class="muted">{s.attendees.length}人 · {s.courtCount}コート</span>
      </header>

      {round.courts.map((c) => (
        <CourtView
          key={c.number}
          court={c}
          todayNumbers={todayNumbers}
          nameFor={nameFor}
          onSetWinner={(w) => { void sessionStore.recordWinner(c.number, w); }}
        />
      ))}

      {resterNumbers.length > 0 && (
        <div
          class="card"
          data-testid="rester-bar"
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {resterNumbers.map((n) => (
              <span
                key={n}
                style={{
                  fontWeight: 900,
                  fontSize: 24,
                  fontVariantNumeric: "tabular-nums" as const,
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 1 }}
          onClick={() => navigate("/session/history")}
        >
          履歴
        </button>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 2 }}
          data-testid="next-round-btn"
          onClick={() => { void sessionStore.nextRound(); }}
        >
          次のラウンド <span class="a">→</span>
        </button>
      </div>

      <button
        type="button"
        data-testid="end-session-btn"
        onClick={async () => {
          if (!confirm("今日のセッションを終了します。ペア履歴が保存されます。よろしいですか？")) return;
          await sessionStore.endSession();
          navigate("/");
        }}
        style={{
          display: "block",
          width: "100%",
          marginTop: 16,
          padding: "10px 12px",
          background: "transparent",
          border: "1.5px solid var(--line)",
          borderRadius: 8,
          color: "var(--muted)",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        セッション終了
      </button>
    </main>
  );
}
