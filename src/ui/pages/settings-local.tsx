import { useState } from "preact/hooks";
import { hostStore } from "@/ui/stores";
import { linkTo } from "@/ui/router";
import { appDialog } from "@/ui/components/app-dialog";
import { t } from "@/ui/i18n";
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
      <h2 style={{ marginTop: 0 }}>{t.settingsLocal.title}</h2>

      <HostLabelCard />
      <DataCard />

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settingsLocal.privacyTitle}</h3>
        <p style={{ margin: "8px 0" }}>
          <a href={linkTo("/privacy")}>{t.settingsLocal.privacyLink}</a>
        </p>
      </section>

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>{t.common.backHome}</a>
      </p>
    </main>
  );
}

function HostLabelCard() {
  const [label, setLabel] = useState(hostStore.label.value);

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settingsLocal.displayName}</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        {t.settingsLocal.displayNameHint}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={label}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          placeholder={t.settingsLocal.displayNamePlaceholder}
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
          {t.settingsLocal.save}
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
      const json = JSON.stringify(backup, null, 2);
      const fileName = `court-shuffle-backup-${backup.exportedAt.slice(0, 10)}.json`;
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        // Android WebView silently discards blob-URL downloads (verified on
        // device 2026-07-06: "Backup saved" showed, no file landed anywhere).
        // Write to app cache and hand off via the native share sheet instead.
        const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const written = await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        try {
          await Share.share({ title: fileName, url: written.uri });
        } catch (shareErr) {
          // User dismissed the share sheet — not an error, but no backup
          // was delivered either, so show nothing.
          const m = shareErr instanceof Error ? shareErr.message : String(shareErr);
          if (/cancel/i.test(m)) return;
          throw shareErr;
        }
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      setMsg(t.settingsLocal.exportDone);
    } catch (e) {
      void appDialog.alert(t.settingsLocal.exportFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function wipeAll() {
    if (!(await appDialog.confirm(t.settingsLocal.wipeConfirm1))) return;
    if (!(await appDialog.confirm(t.settingsLocal.wipeConfirm2))) return;
    setBusy(true);
    setMsg(null);
    try {
      await wipeAllData(createIdbKV());
      setMsg(t.settingsLocal.wipeDone);
    } catch (e) {
      void appDialog.alert(t.settingsLocal.wipeFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settingsLocal.dataTitle}</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        {t.settingsLocal.dataHint}
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
          {t.settingsLocal.exportBtn}
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
          {t.settingsLocal.wipeBtn}
        </button>
      </div>
      {msg && <p data-testid="data-msg" style={{ margin: "8px 0 0", fontSize: 13, color: "green" }}>{msg}</p>}
    </section>
  );
}
