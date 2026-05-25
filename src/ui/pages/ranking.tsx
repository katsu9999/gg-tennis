import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { rankingStore, rosterStore } from "@/ui/stores";

type Tab = "elo" | "pair" | "attendance";

const tab = signal<Tab>("elo");

export function resetRankingState(): void {
  tab.value = "elo";
}

const tabStyle = (active: boolean) => ({
  background: active ? "var(--ink)" : "transparent",
  color: active ? "#fff" : "var(--ink)",
  border: `2px solid var(--ink)`,
  borderRadius: 12,
  padding: "8px 16px",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer" as const,
});

const yearBtnStyle = (disabled?: boolean) => ({
  background: "transparent",
  border: "1.5px solid var(--line)",
  borderRadius: 8,
  padding: "4px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: disabled ? ("not-allowed" as const) : ("pointer" as const),
  opacity: disabled ? 0.4 : 1,
});

export function RankingPage() {
  useEffect(() => {
    void rosterStore.load();
    void rankingStore.load();
  }, []);

  const r = rankingStore.ranking.value;
  const year = rankingStore.year.value;
  const thisYear = new Date().getUTCFullYear();
  const byMemberId = new Map(rosterStore.all.value.map((m) => [m.id, m.name] as const));

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>ランキング</h2>

      <section style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          data-testid="year-prev"
          onClick={() => { void rankingStore.setYear(year - 1); }}
          style={yearBtnStyle(false)}
        >
          ← {year - 1}
        </button>
        <strong style={{ fontSize: 18 }} data-testid="year-display">{year} シーズン</strong>
        <button
          type="button"
          data-testid="year-next"
          disabled={year >= thisYear}
          onClick={() => { if (year < thisYear) void rankingStore.setYear(year + 1); }}
          style={yearBtnStyle(year >= thisYear)}
        >
          {year + 1} →
        </button>
      </section>

      <section style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["elo", "pair", "attendance"] as const).map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`tab-${t}`}
            onClick={() => { tab.value = t; }}
            style={tabStyle(tab.value === t)}
          >
            {t === "elo" ? "個人 (Elo)" : t === "pair" ? "ペア" : "参加"}
          </button>
        ))}
      </section>

      {rankingStore.loading.value && (
        <p class="muted" data-testid="ranking-loading">読み込み中…</p>
      )}

      {!rankingStore.loading.value && !r && (
        <p class="muted">データがありません。</p>
      )}

      {r && tab.value === "elo" && (
        <ol class="card" data-testid="ranking-elo">
          {[...r.elo.entries()].sort((a, b) => b[1] - a[1]).map(([id, score], i) => {
            const rec = r.record.get(id) ?? { win: 0, loss: 0 };
            return (
              <li key={id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < r.elo.size - 1 ? "1px solid var(--line)" : "none" }}>
                <span><strong>{i + 1}.</strong> {byMemberId.get(id) ?? `#${id}`}</span>
                <span>
                  <strong>{Math.round(score)}</strong>
                  <span class="muted" style={{ marginLeft: 8, fontSize: 13 }}>({rec.win}–{rec.loss})</span>
                </span>
              </li>
            );
          })}
          {r.elo.size === 0 && <li class="muted">まだ試合データがありません。</li>}
        </ol>
      )}

      {r && tab.value === "pair" && (
        <ol class="card" data-testid="ranking-pair">
          {[...r.pair.entries()]
            .sort((a, b) => {
              const aRate = a[1].win / (a[1].win + a[1].loss);
              const bRate = b[1].win / (b[1].win + b[1].loss);
              return bRate - aRate;
            })
            .map(([key, p], i, arr) => {
              const [aIdStr, bIdStr] = key.split(":");
              const aId = parseInt(aIdStr!, 10);
              const bId = parseInt(bIdStr!, 10);
              const rate = Math.round((100 * p.win) / (p.win + p.loss));
              return (
                <li key={key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span><strong>{i + 1}.</strong> {byMemberId.get(aId) ?? `#${aId}`} ＆ {byMemberId.get(bId) ?? `#${bId}`}</span>
                  <span>
                    <strong>{rate}%</strong>
                    <span class="muted" style={{ marginLeft: 8, fontSize: 13 }}>({p.win}–{p.loss})</span>
                  </span>
                </li>
              );
            })}
          {r.pair.size === 0 && <li class="muted">最低3試合のペアがまだいません。</li>}
        </ol>
      )}

      {r && tab.value === "attendance" && (
        <ol class="card" data-testid="ranking-attendance">
          {[...r.attendance.entries()].sort((a, b) => b[1] - a[1]).map(([id, n], i, arr) => (
            <li key={id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span><strong>{i + 1}.</strong> {byMemberId.get(id) ?? `#${id}`}</span>
              <strong>{n}回</strong>
            </li>
          ))}
          {r.attendance.size === 0 && <li class="muted">過去のセッションがありません。</li>}
        </ol>
      )}

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href="/">← ホーム</a>
      </p>
    </main>
  );
}
