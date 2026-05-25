import { useEffect } from "preact/hooks";
import { navigate } from "@/ui/router";
import { sessionStore, rosterStore } from "@/ui/stores";
import type { InMemorySession } from "@/state/session-store";

export function NumberMapPage() {
  // Load roster so we can resolve memberId → name
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

  const nameById = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));

  function labelOf(a: InMemorySession["attendees"][number]): string {
    if (a.isGuest) return a.guestName ?? "Guest";
    if (a.ref.kind === "member") return nameById.get(a.ref.memberId) ?? `#${a.ref.memberId}`;
    return "?";
  }

  async function startFirstRound(): Promise<void> {
    await sessionStore.nextRound();
    navigate("/session/round");
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>名前 → 今日の番号</h2>
      <p class="muted">全員、自分の番号を確認してください。</p>

      <div class="card" data-testid="number-map-list">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {s.attendees.map((a) => (
              <tr key={a.todayNumber} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{
                  fontSize: 32,
                  fontWeight: 900,
                  padding: "10px 6px",
                  width: 64,
                  textAlign: "center" as const,
                  color: "var(--ink)",
                }}>
                  {a.todayNumber}
                </td>
                <td style={{ fontSize: 18, padding: "10px 6px" }}>
                  {labelOf(a)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          type="button"
          class="btn-primary"
          style={{ flex: 2 }}
          onClick={() => { void startFirstRound(); }}
        >
          ラウンド開始 <span class="a">→</span>
        </button>
      </div>
    </main>
  );
}
