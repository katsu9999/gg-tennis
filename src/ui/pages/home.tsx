import { useEffect } from "preact/hooks";
import { navigate, linkTo } from "@/ui/router";
import {
  plannedSessionStore,
  rsvpStore,
  rosterStore,
  liveSessionStore,
} from "@/ui/stores";
import { RsvpSummary } from "@/ui/components/rsvp-summary";

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

      {live && (
        <section
          class="card"
          data-testid="live-session-card"
          style={{
            marginBottom: 16,
            borderColor: "var(--lime)",
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
                background: "#22c55e",
                marginRight: 8,
                verticalAlign: "middle",
              }}
            />
            ライブ中 — {live.location}
          </h2>
          {live.host_label && (
            <p class="muted" style={{ margin: "4px 0 8px", fontSize: 13 }}>
              {live.host_label} さんが開始
            </p>
          )}
          <button
            type="button"
            class="btn-primary"
            onClick={() => navigate("/session/round")}
            style={{ width: "100%" }}
          >
            観戦・運営する →
          </button>
        </section>
      )}

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
