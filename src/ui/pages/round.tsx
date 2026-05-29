import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { CourtView } from "@/ui/components/court-view";
import { sessionStore, rosterStore } from "@/ui/stores";
import { navigate, linkTo } from "@/ui/router";

const showNames = signal(true);

/** Test helper — resets module-scoped UI state. */
export function resetRoundState(): void {
  showNames.value = true;
}

/** Test helper — set showNames programmatically. */
export function setRoundShowNames(value: boolean): void {
  showNames.value = value;
}

export function RoundPage() {
  useEffect(() => {
    if (rosterStore.all.value.length === 0) void rosterStore.load();
  }, []);

  const s = sessionStore.session.value;

  if (!s) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>セッションが開始されていません</h2>
        <p><a href={linkTo("/session/new")}>新規セッションを作成</a></p>
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

  const resterLabels = round.resters.map((r) => {
    if (r.kind === "member") {
      if (showNames.value) return byMemberId.get(r.memberId) ?? `#${r.memberId}`;
      const n = todayNumbers[r.memberId];
      return typeof n === "number" ? String(n) : "?";
    }
    return "G";
  });

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "8px 12px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 18 }}>
          GG <span style={{ color: "var(--muted)", fontSize: 14 }}>· R{s.currentRoundIndex + 1} / {s.rounds.length}</span>
        </strong>
        <label style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            data-testid="round-name-toggle"
            checked={showNames.value}
            onInput={(e) => { showNames.value = (e.currentTarget as HTMLInputElement).checked; }}
          />
          名前
        </label>
      </header>

      {round.courts.map((c) => (
        <CourtView
          key={c.number}
          court={c}
          todayNumbers={todayNumbers}
          nameFor={nameFor}
          showNames={showNames.value}
          onSetWinner={(w) => { void sessionStore.recordWinner(c.number, w); }}
        />
      ))}

      {resterLabels.length > 0 && (
        <div
          class="card"
          data-testid="rester-bar"
          style={{
            background: "var(--rest-bg)",
            color: "var(--rest-fg)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            marginBottom: 8,
          }}
        >
          <strong style={{ fontSize: 13 }}>休憩</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {resterLabels.map((label, i) => (
              <span
                key={i}
                style={{
                  fontWeight: 900,
                  fontSize: showNames.value ? 14 : 18,
                  fontVariantNumeric: "tabular-nums" as const,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 1 }}
          data-testid="prev-round-btn"
          disabled={s.currentRoundIndex === 0}
          onClick={() => sessionStore.goToPreviousRound()}
        >
          <span class="a">←</span> 前
        </button>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 1 }}
          data-testid="next-round-btn"
          onClick={() => { void sessionStore.nextRound(); }}
        >
          次 <span class="a">→</span>
        </button>
      </div>

      <button
        type="button"
        data-testid="end-session-btn"
        onClick={async () => {
          if (!confirm("セッションを終了してランキングに反映します。\n（間違えた場合は「過去のセッション」から削除できます）")) return;
          try {
            await sessionStore.endSession();
            navigate("/");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(`セッション終了に失敗しました:\n${msg}`);
            console.error("endSession failed", e);
          }
        }}
        style={{
          display: "block",
          width: "100%",
          marginTop: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "1.5px solid var(--line)",
          borderRadius: 8,
          color: "var(--muted)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        セッション終了
      </button>
    </main>
  );
}
