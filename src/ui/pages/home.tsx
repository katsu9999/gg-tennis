import { navigate } from "@/ui/router";

interface NavButtonProps {
  label: string;
  to: string;
}

function NavButton({ label, to }: NavButtonProps) {
  return (
    <button
      type="button"
      class="btn-primary"
      onClick={() => navigate(to)}
      style={{ width: "100%" }}
    >
      {label}
    </button>
  );
}

export function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
        <strong style={{ fontSize: 32, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          GG
        </strong>
        <span class="muted">Tennis Court Shuffle</span>
      </header>

      <section class="card" style={{ marginBottom: 16 }} data-testid="next-session-card">
        <h2 style={{ margin: 0, fontSize: 18 }}>📅 次回セッション</h2>
        <p class="muted" style={{ margin: "8px 0 0" }}>
          まだ将来セッションが登録されていません。
        </p>
        {/* Hooked up in Phase 6 when planned-session-store lands */}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <NavButton label="セッション開始 →" to="/session/new" />
        <NavButton label="将来セッション" to="/planned" />
        <NavButton label="名簿" to="/roster" />
        <NavButton label="ランキング" to="/ranking" />
        <NavButton label="過去セッション" to="/sessions/past" />
        <NavButton label="設定" to="/settings" />
      </div>
    </main>
  );
}
