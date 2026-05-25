import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { authStore } from "@/ui/stores";
import { navigate } from "@/ui/router";

const emailInput = signal("");
const sent = signal(false);
const error = signal<string | null>(null);
const submitting = signal(false);

/** Test helper — resets module-scoped UI state. */
export function resetLoginState(): void {
  emailInput.value = "";
  sent.value = false;
  error.value = null;
  submitting.value = false;
}

async function submit(): Promise<void> {
  const value = emailInput.value.trim();
  if (!value) {
    error.value = "メールアドレスを入力してください。";
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    await authStore.signInWithMagicLink(value);
    sent.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

export function LoginPage() {
  // Initialise auth listener on mount (idempotent if already done)
  useEffect(() => {
    void authStore.init();
  }, []);

  // If already an admin, send them home
  useEffect(() => {
    if (authStore.isAdmin.value) navigate("/");
  });

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <strong style={{ fontSize: 28 }}>GG</strong>
        <span class="muted">幹事ログイン</span>
      </header>

      {sent.value ? (
        <section class="card" data-testid="login-sent">
          <h3 style={{ marginTop: 0 }}>📧 マジックリンクを送信しました</h3>
          <p>受信箱を確認し、メールのリンクをタップしてください。</p>
          <p class="muted" style={{ fontSize: 13 }}>
            数分経っても届かない場合は、スパムフォルダを確認するか、別のメールアドレスで再試行してください。
          </p>
          <button
            type="button"
            class="btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => { sent.value = false; emailInput.value = ""; }}
          >
            別のメールアドレスで再送
          </button>
        </section>
      ) : (
        <section class="card">
          <p style={{ marginTop: 0 }}>登録済みのメールアドレスを入力してください。マジックリンクをお送りします。</p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            data-testid="login-email"
            placeholder="admin@example.com"
            value={emailInput.value}
            onInput={(e) => { emailInput.value = (e.currentTarget as HTMLInputElement).value; }}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              borderRadius: 12,
              border: "2px solid var(--line)",
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            class="btn-primary"
            style={{ width: "100%" }}
            disabled={submitting.value || emailInput.value.trim().length === 0}
            data-testid="login-submit"
            onClick={() => { void submit(); }}
          >
            {submitting.value ? "送信中…" : "マジックリンクを送信"}
          </button>
          {error.value && (
            <p data-testid="login-error" style={{ color: "crimson", marginTop: 12 }}>
              {error.value}
            </p>
          )}
        </section>
      )}

      <p class="muted" style={{ marginTop: 24, fontSize: 13, textAlign: "center" }}>
        メンバーはログイン不要 — このURLを開くだけで履歴・ランキングを閲覧できます。
        {" "}<a href="/privacy">プライバシー</a>
      </p>
    </main>
  );
}
