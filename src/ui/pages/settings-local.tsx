import { useState } from "preact/hooks";
import { hostStore } from "@/ui/stores";
import { linkTo } from "@/ui/router";
import { appDialog } from "@/ui/components/app-dialog";
import { createIdbKV } from "@/data/local/kv";
import { buildBackup, wipeAllData } from "@/data/local/backup";

/**
 * Settings page for the LOCAL flavour.
 *
 * A separate component (not a reduced SettingsPage): the GG settings page
 * talks to Supabase for PIN rotation, which has no local counterpart. Local
 * concerns are: host display name, JSON backup (the only backup path for
 * device-only data), and wipe-all.
 */
export function SettingsLocalPage() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>設定</h2>

      <HostLabelCard />
      <DataCard />

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>プライバシー</h3>
        <p style={{ margin: "8px 0" }}>
          <a href={linkTo("/privacy")}>プライバシーノーティス</a>
        </p>
      </section>

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>← ホーム</a>
      </p>
    </main>
  );
}

function HostLabelCard() {
  const [label, setLabel] = useState(hostStore.label.value);

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>あなたの表示名</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        セッション開始時に「○○ さんが運営中」と表示されます。任意。
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={label}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          placeholder="例: Katsu"
          data-testid="host-label-input"
          style={{
            flex: 1,
            padding: 10,
            fontSize: 15,
            borderRadius: 8,
            border: "2px solid var(--line)",
          }}
        />
        <button
          type="button"
          class="btn-primary"
          data-testid="host-label-save"
          onClick={() => hostStore.setLabel(label.trim())}
        >
          保存
        </button>
      </div>
    </section>
  );
}

function DataCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportAll() {
    setBusy(true);
    setMsg(null);
    try {
      const backup = await buildBackup(createIdbKV());
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `court-shuffle-backup-${backup.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("バックアップを保存しました");
    } catch (e) {
      void appDialog.alert(`エクスポートに失敗しました:\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function wipeAll() {
    if (!(await appDialog.confirm("すべてのデータ（名簿・セッション・ペア履歴）を削除します。よろしいですか？"))) return;
    if (!(await appDialog.confirm("この操作は取り消せません。本当に削除しますか？"))) return;
    setBusy(true);
    setMsg(null);
    try {
      await wipeAllData(createIdbKV());
      setMsg("すべてのデータを削除しました");
    } catch (e) {
      void appDialog.alert(`削除に失敗しました:\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>データ</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        すべてのデータはこの端末の中だけに保存されます。
        バックアップは JSON エクスポートで行ってください。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          class="btn-primary"
          data-testid="export-all-btn"
          disabled={busy}
          onClick={() => { void exportAll(); }}
          style={{ flex: 1 }}
        >
          JSON エクスポート
        </button>
        <button
          type="button"
          data-testid="wipe-all-btn"
          disabled={busy}
          onClick={() => { void wipeAll(); }}
          style={{
            flex: 1,
            background: "transparent",
            border: "1.5px solid #b00020",
            color: "#b00020",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          全データ削除
        </button>
      </div>
      {msg && <p data-testid="data-msg" style={{ margin: "8px 0 0", fontSize: 13, color: "green" }}>{msg}</p>}
    </section>
  );
}
