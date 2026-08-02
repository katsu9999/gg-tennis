import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef } from "@/engine/models";
import { CourtView } from "@/ui/components/court-view";
import { sessionStore, rosterStore } from "@/ui/stores";
import { sessionHasResults } from "@/state/session-store";
import { offerLineNotify } from "@/ui/line-notify";
import { navigate, linkTo } from "@/ui/router";
import { appDialog } from "@/ui/components/app-dialog";
import { t } from "@/ui/i18n";
import { BRAND, IS_LOCAL } from "@/flavor";

const showNames = signal(false);

function generateNextRound(): void {
  // Only offer the LINE push when a NEW round was generated — stepping
  // forward through rounds already announced (after 前) re-runs nextRound
  // without adding one, and re-asking would be noise.
  const roundsBefore = sessionStore.session.value?.rounds.length ?? 0;
  sessionStore
    .nextRound()
    .then(() => {
      const s = sessionStore.session.value;
      if (s && s.rounds.length > roundsBefore) void offerLineNotify();
    })
    .catch((e) => {
      console.error("nextRound failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      void appDialog.alert(t.round.saveFailed(msg));
    });
}

/** Test helper — resets module-scoped UI state. */
export function resetRoundState(): void {
  showNames.value = false;
}

/** Test helper — set showNames programmatically. */
export function setRoundShowNames(value: boolean): void {
  showNames.value = value;
}

export function RoundPage() {
  useEffect(() => {
    if (rosterStore.all.value.length === 0) void rosterStore.load();
    // Belt-and-braces: if main.tsx's startup resume hasn't landed yet (or
    // was reset by hot reload), try again here. No-op if already loaded.
    if (!sessionStore.session.value) void sessionStore.resume();
  }, []);

  const s = sessionStore.session.value;

  if (!s) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>{t.common.noSessionTitle}</h2>
        <p><a href={linkTo("/session/new")}>{t.common.createNewSession}</a></p>
      </main>
    );
  }

  const round = s.rounds[s.currentRoundIndex];

  if (!round) {
    // Defensive: shouldn't happen if the user came from number-map.
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>{t.round.preparing(s.currentRoundIndex + 1)}</h2>
        <button
          class="btn-primary"
          disabled={sessionStore.generating.value}
          onClick={() => { generateNextRound(); }}
        >
          {t.round.generate}
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
          {BRAND} <span style={{ color: "var(--muted)", fontSize: 14 }}>· R{s.currentRoundIndex + 1} / {s.rounds.length}</span>
        </strong>
        <label style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            data-testid="round-name-toggle"
            checked={showNames.value}
            onInput={(e) => { showNames.value = (e.currentTarget as HTMLInputElement).checked; }}
          />
          {t.common.namesToggle}
        </label>
      </header>

      {round.courts.map((c) => (
        <CourtView
          key={c.number}
          court={c}
          todayNumbers={todayNumbers}
          nameFor={nameFor}
          showNames={showNames.value}
          winnerTapEnabled={!IS_LOCAL}
          onSetWinner={(w) => {
            sessionStore.recordWinner(c.number, w).catch((e) => {
              console.error("recordWinner failed", e);
              const msg = e instanceof Error
                ? e.message
                : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
              void appDialog.alert(t.round.recordWinnerFailed(msg));
            });
          }}
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
          <strong style={{ fontSize: 13 }}>{t.common.rest}</strong>
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
          <span class="a">←</span> {t.round.prev}
        </button>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 1 }}
          data-testid="next-round-btn"
          disabled={sessionStore.generating.value}
          onClick={() => { generateNextRound(); }}
        >
          {t.round.next} <span class="a">→</span>
        </button>
      </div>

      <button
        type="button"
        data-testid="end-session-btn"
        onClick={async () => {
          // A session with zero recorded winners is almost always a false
          // start (lineup redo, testing). Offer to discard it so it doesn't
          // pile up as a junk 'past' row and skew pair-history fairness —
          // 2026-07-18 left three such rows next to the one real session.
          const s = sessionStore.session.value;
          if (s && !sessionHasResults(s)) {
            if (await appDialog.confirm(t.round.discardConfirm)) {
              try {
                await sessionStore.discardSession();
                navigate("/");
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                void appDialog.alert(t.round.discardFailed(msg));
                console.error("discardSession failed", e);
              }
              return;
            }
            if (!(await appDialog.confirm(t.round.discardKeepConfirm))) return;
          } else if (!(await appDialog.confirm(t.round.endConfirm))) {
            return;
          }
          try {
            await sessionStore.endSession();
            navigate("/");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            void appDialog.alert(t.round.endFailed(msg));
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
        {t.round.endSession}
      </button>
    </main>
  );
}
