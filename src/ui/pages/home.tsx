import { useEffect } from "preact/hooks";
import { navigate, linkTo } from "@/ui/router";
import {
  plannedSessionStore,
  rsvpStore,
  rosterStore,
  liveSessionStore,
  sessionStore,
} from "@/ui/stores";
import { RsvpSummary } from "@/ui/components/rsvp-summary";

/** A session that's still "ongoing" more than this many hours after creation is
 *  almost certainly an abandoned PWA tab. Surface it so it can be wrapped up
 *  and counted into ranking instead of bleeding match_log into the next night.
 *  6h covers a long lunch/break but doesn't trip on a real 2-3h session. */
const STALE_SESSION_HOURS = 6;

interface NavButtonProps {
  label: string;
  to: string;
  disabled?: boolean;
}

function NavButton({ label, to, disabled }: NavButtonProps) {
  return (
    <button
      type="button"
      class="btn-primary"
      disabled={disabled}
      onClick={() => { if (!disabled) navigate(to); }}
      style={{
        width: "100%",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      title={disabled ? "準備中" : undefined}
    >
      {label}
    </button>
  );
}

export function HomePage() {
  useEffect(() => {
    void (async () => {
      await Promise.all([
        plannedSessionStore.loadNext(),
        liveSessionStore.refresh(),
        liveSessionStore.subscribe(),
      ]);
      const next = plannedSessionStore.next.value;
      if (next) {
        await Promise.all([
          rsvpStore.loadForSession(next.id),
          rosterStore.load(),
        ]);
      }
    })();
    return () => liveSessionStore.unsubscribe();
  }, []);

  const next = plannedSessionStore.next.value;
  const live = liveSessionStore.current.value;

  const nextSessionCard = next ? (() => {
    const rsvps = rsvpStore.bySession.value.get(next.id) ?? [];
    const activeMembers = rosterStore.active.value;

    return (
      <>
        <p style={{ margin: "8px 0 4px", fontWeight: 700 }}>
          <strong>{next.date}</strong> @ {next.location}
        </p>
        <RsvpSummary rsvps={rsvps} activeMembers={activeMembers} layout="chips" />
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {next.public_rsvp_token && (
            <button
              type="button"
              class="btn-primary"
              onClick={() => {
                const base = `${window.location.origin}/rsvp/${next.public_rsvp_token}`;
                void navigator.clipboard.writeText(base).catch(() => undefined);
              }}
              style={{ flex: 1 }}
            >
              公開リンクをコピー
            </button>
          )}
          <button
            type="button"
            class="btn-primary"
            onClick={() => navigate(`/session/new?from=${next.id}`)}
            style={{ flex: 1 }}
          >
            セッション開始 →
          </button>
        </div>
      </>
    );
  })() : (
    <>
      <p class="muted" style={{ margin: "8px 0 0" }}>
        まだ将来セッションがありません。
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13 }}>
        <a href={linkTo("/planned")}>→ 予定セッションを作成する</a>
      </p>
    </>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
        <strong style={{ fontSize: 32, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          GG
        </strong>
        <span class="muted">Tennis Court Shuffle</span>
      </header>

      {live && (() => {
        const ageMs = Date.now() - new Date(live.created_at).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        const isStale = ageHours >= STALE_SESSION_HOURS;
        return (
          <section
            class="card"
            data-testid="live-session-card"
            style={{
              marginBottom: 16,
              borderColor: isStale ? "#b00020" : "var(--lime)",
              borderWidth: 2,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: isStale ? "#b00020" : "#22c55e",
                  marginRight: 8,
                  verticalAlign: "middle",
                }}
              />
              {isStale ? "⚠️ 未終了" : "ライブ中"} — {live.location}
            </h2>
            {live.host_label && (
              <p class="muted" style={{ margin: "4px 0 4px", fontSize: 13 }}>
                {live.host_label} さんが開始
              </p>
            )}
            {isStale && (
              <p style={{ margin: "4px 0 8px", fontSize: 13, color: "#b00020" }}>
                開始から {Math.floor(ageHours)} 時間。終了し忘れていませんか？
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                class="btn-primary"
                onClick={() => navigate("/session/round")}
                style={{ flex: isStale ? 1 : 1 }}
                data-testid="live-resume-btn"
              >
                {isStale ? "確認する" : "観戦・運営する →"}
              </button>
              {isStale && (
                <button
                  type="button"
                  data-testid="live-end-now-btn"
                  onClick={async () => {
                    if (!confirm("このセッションを終了してランキングに反映します。よろしいですか？")) return;
                    try {
                      // resume() should have already hydrated sessionStore, but
                      // call it again defensively in case the page was opened
                      // before main.tsx's startup resume landed.
                      await sessionStore.resume();
                      await sessionStore.endSession();
                      await liveSessionStore.refresh();
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
                      alert(`終了に失敗しました:\n${msg}`);
                    }
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1.5px solid #b00020",
                    color: "#b00020",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  今すぐ終了
                </button>
              )}
            </div>
          </section>
        );
      })()}

      <section class="card" style={{ marginBottom: 16 }} data-testid="next-session-card">
        <h2 style={{ margin: 0, fontSize: 18 }}>📅 次回セッション</h2>
        {nextSessionCard}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <NavButton label="セッション開始 →" to="/session/new" />
        <NavButton label="将来セッション (準備中)" to="/planned" disabled />
        <NavButton label="名簿" to="/roster" />
        <NavButton label="ランキング" to="/ranking" />
        <NavButton label="過去セッション" to="/sessions/past" />
        <NavButton label="設定" to="/settings" />
      </div>
    </main>
  );
}
