import { authStore } from "@/ui/stores";

export function SettingsPage() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>設定</h2>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>アカウント</h3>
        {authStore.email.value ? (
          <>
            <p style={{ margin: "8px 0" }} data-testid="auth-status">
              ログイン中: {authStore.email.value}
              {authStore.isAdmin.value && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "var(--lime)",
                    color: "var(--ink)",
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  幹事
                </span>
              )}
            </p>
            <button
              type="button"
              class="btn-primary"
              data-testid="sign-out"
              onClick={() => { void authStore.signOut(); }}
              style={{ marginTop: 8 }}
            >
              ログアウト
            </button>
          </>
        ) : (
          <p>
            未ログイン — <a href="/login">幹事ログイン</a>
          </p>
        )}
      </section>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>屋外モード</h3>
        <p class="muted" style={{ fontSize: 14, margin: "8px 0" }}>
          画面の明るさを最大にしてください。<br />
          Web版はブラウザ制約で輝度を自動制御できません。<br />
          v1.5 のネイティブ App 版では自動 MAX 化される予定です。
        </p>
      </section>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>プライバシー</h3>
        <p style={{ margin: "8px 0" }}>
          <a href="/privacy">プライバシーノーティス（日本語 / English）</a>
        </p>
      </section>

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href="/">← ホーム</a>
      </p>
    </main>
  );
}
