import { signal } from "@preact/signals";
import { PRIVACY_JA, PRIVACY_EN, PRIVACY_LOCAL_EN } from "@/ui/privacy-content";
import type { ComponentChildren } from "preact";
import { linkTo } from "@/ui/router";
import { BRAND, IS_LOCAL } from "@/flavor";

const lang = signal<"ja" | "en">("ja");

export function resetPrivacyState(): void {
  lang.value = "ja";
}

function renderMarkdown(text: string): ComponentChildren[] {
  const lines = text.split("\n");
  const nodes: ComponentChildren[] = [];
  let inList: string[] | null = null;

  const flushList = (key: string) => {
    if (inList) {
      nodes.push(
        <ul key={key} style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          {inList.map((item, i) => (
            // Static hard-coded content only — no user input — XSS risk is zero.
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>,
      );
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("# ")) {
      flushList(`fl-${i}`);
      nodes.push(<h1 key={i} style={{ fontSize: 24, marginTop: 0 }}>{l.slice(2)}</h1>);
    } else if (l.startsWith("## ")) {
      flushList(`fl-${i}`);
      nodes.push(<h2 key={i} style={{ fontSize: 18, marginTop: 20 }}>{l.slice(3)}</h2>);
    } else if (l.startsWith("- ")) {
      if (!inList) inList = [];
      // Inline bold: **x**
      const html = l.slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      inList.push(html);
    } else if (l.trim() === "") {
      flushList(`fl-${i}`);
    } else {
      flushList(`fl-${i}`);
      // Static hard-coded content only — no user input — XSS risk is zero.
      const html = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      nodes.push(<p key={i} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: "0 0 12px" }} />);
    }
  }
  flushList("fl-end");
  return nodes;
}

export function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <strong style={{ fontSize: 28 }}>{BRAND}</strong>
        <span class="muted">{IS_LOCAL ? "Privacy" : "プライバシー / Privacy"}</span>
      </header>

      {!IS_LOCAL && <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          data-testid="lang-ja"
          onClick={() => { lang.value = "ja"; }}
          disabled={lang.value === "ja"}
          style={{
            background: lang.value === "ja" ? "var(--ink)" : "transparent",
            color: lang.value === "ja" ? "#fff" : "var(--ink)",
            border: "2px solid var(--ink)",
            borderRadius: 12,
            padding: "6px 16px",
            fontWeight: 800,
            cursor: lang.value === "ja" ? "default" : "pointer",
          }}
        >
          日本語
        </button>
        <button
          type="button"
          data-testid="lang-en"
          onClick={() => { lang.value = "en"; }}
          disabled={lang.value === "en"}
          style={{
            background: lang.value === "en" ? "var(--ink)" : "transparent",
            color: lang.value === "en" ? "#fff" : "var(--ink)",
            border: "2px solid var(--ink)",
            borderRadius: 12,
            padding: "6px 16px",
            fontWeight: 800,
            cursor: lang.value === "en" ? "default" : "pointer",
          }}
        >
          English
        </button>
      </div>}

      <article class="card" data-testid="privacy-body">
        {renderMarkdown(IS_LOCAL ? PRIVACY_LOCAL_EN : lang.value === "ja" ? PRIVACY_JA : PRIVACY_EN)}
      </article>

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>← ホーム</a>
      </p>
    </main>
  );
}
