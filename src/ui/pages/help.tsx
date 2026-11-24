import { BRAND } from "@/flavor";
import { currentClub, isGgClub } from "@/data/club";
import { linkTo } from "@/ui/router";
import { t } from "@/ui/i18n";

// 使い方（2026-11-24）。リンクだけで開ける（GG の入室 PIN も要らない）ので、
// 幹事がメンバーにそのまま渡せる。文言は i18n の help（クラブの言語で表示）。
export function HelpPage() {
  const h = t.help;
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }} data-testid="help-page">
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <strong style={{ fontSize: 28 }}>{isGgClub() ? BRAND : currentClub.value.name}</strong>
        <span class="muted">{h.title}</span>
      </header>
      <p style={{ margin: "0 0 8px" }}>{h.intro}</p>
      <p class="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>{h.shareHint}</p>

      {isGgClub() && (
        <section class="card" style={{ marginBottom: 12 }} data-testid="help-gg-entry">
          <p style={{ margin: 0 }}>{h.ggEntry}</p>
        </section>
      )}

      {h.sections.map((s) => (
        <section key={s.title} class="card" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{s.title}</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {s.items.map((item) => (
              <li key={item} style={{ margin: "0 0 6px", lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      {/* LINE 通知はクラブ設定で有効なときだけ（GG のみ）。使い方は端末内版には出さない。 */}
      {currentClub.value.lineEnabled && (
        <section class="card" style={{ marginBottom: 12 }} data-testid="help-line">
          <p style={{ margin: 0 }}>{h.line}</p>
        </section>
      )}

      <p style={{ marginTop: 20 }}>
        <a href={linkTo("/")} class="btn-primary" style={{ display: "inline-block", textDecoration: "none", padding: "10px 16px" }}>
          {h.openApp}
        </a>
      </p>
    </main>
  );
}
