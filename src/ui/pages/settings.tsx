import { useState } from "preact/hooks";
import { appDialog } from "@/ui/components/app-dialog";
import { forgetEntry, rememberEntry } from "@/state/entry-lock";
import { clubId, isGgClub } from "@/data/club";
import { hostStore, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { linkTo } from "@/ui/router";
import { t } from "@/ui/i18n";

export function SettingsPage() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t.settings.title}</h2>

      <HostLabelCard />
      <PinCard />

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settings.outdoorTitle}</h3>
        <p class="muted" style={{ fontSize: 14, margin: "8px 0" }}>
          {t.settings.outdoorHint1}<br />
          {t.settings.outdoorHint2}<br />
          {t.settings.outdoorHint3}
        </p>
      </section>

      {isGgClub() && (
        <section class="card" style={{ marginBottom: 16 }} data-testid="entry-forget-card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.entry.forgetTitle}</h3>
          <p class="muted" style={{ fontSize: 14, margin: "8px 0" }}>{t.entry.forgetHint}</p>
          <button
            type="button"
            data-testid="entry-forget"
            onClick={async () => {
              if (!(await appDialog.confirm(t.entry.forgetConfirm))) return;
              pinStore.lock();
              forgetEntry(clubId());
            }}
            style={{ background: "transparent", border: "1.5px solid var(--line)", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}
          >
            {t.entry.forget}
          </button>
        </section>
      )}

      {isGgClub() && (
        <section class="card" style={{ marginBottom: 16 }}>
          <a href={linkTo("/clubs")} data-testid="clubs-link" style={{ fontWeight: 700 }}>{t.clubs.settingsLink}</a>
        </section>
      )}

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settings.privacyTitle}</h3>
        <p style={{ margin: "8px 0" }}>
          <a href={linkTo("/privacy")}>{t.settings.privacyLink}</a>
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

  function save() {
    hostStore.setLabel(label.trim());
  }

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settings.displayName}</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        {t.settings.displayNameHint}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={label}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          placeholder={t.settings.displayNamePlaceholder}
          data-testid="host-label-input"
          style={{
            flex: 1,
            padding: 10,
            fontSize: 15,
            borderRadius: 8,
            border: "2px solid var(--line)",
          }}
        />
        <button type="button" class="btn-primary" data-testid="host-label-save" onClick={save}>
          {t.settings.save}
        </button>
      </div>
    </section>
  );
}

function PinCard() {
  const { gate, modal } = useRequirePin();
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function rotate() {
    setMsg(null);
    setErr(null);
    try {
      await pinStore.setClubPin(newPin);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    // この端末の入室 PIN も新しい PIN に。古いままだと次の起動で締め出される。
    // 他の端末は次の起動時に照合が外れて PIN を聞かれる（変えた PIN を知る人だけ入れる）。
    if (isGgClub()) rememberEntry(clubId(), newPin);
    setNewPin("");
    setMsg(t.settings.pinUpdated);
  }

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.settings.pinTitle}</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        {t.settings.pinHint}
      </p>
      <p style={{ margin: "8px 0", fontSize: 14 }}>
        {t.settings.pinStatus}{" "}
        {pinStore.isUnlocked.value ? (
          <span style={{ color: "green", fontWeight: 700 }}>{t.settings.pinUnlocked}</span>
        ) : (
          <span style={{ color: "var(--muted)" }}>{t.settings.pinLocked}</span>
        )}
        {pinStore.isUnlocked.value && (
          <button
            type="button"
            class="btn-secondary"
            onClick={() => pinStore.lock()}
            data-testid="pin-lock"
            style={{ marginLeft: 12 }}
          >
            {t.settings.lock}
          </button>
        )}
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          type="password"
          inputMode="numeric"
          value={newPin}
          onInput={(e) => setNewPin((e.target as HTMLInputElement).value)}
          placeholder={t.settings.newPinPlaceholder}
          data-testid="new-pin-input"
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
          data-testid="rotate-pin"
          disabled={newPin.length < 4}
          onClick={() => gate(rotate)}
        >
          {t.settings.rotatePin}
        </button>
      </div>
      {msg && <p style={{ color: "green", fontSize: 13 }}>{msg}</p>}
      {err && <p style={{ color: "crimson", fontSize: 13 }}>{err}</p>}
      {modal}
    </section>
  );
}
