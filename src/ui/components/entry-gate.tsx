import { useEffect, useRef, useState } from "preact/hooks";
import { pinStore } from "@/ui/stores";
import { rememberEntry } from "@/state/entry-lock";
import { clubId } from "@/data/club";
import { linkTo } from "@/ui/router";
import { BRAND } from "@/flavor";
import { t } from "@/ui/i18n";

/** GG を開いたとき、この端末がまだ GG の PIN を入れていなければ出す画面。 */
export function EntryGate() {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const verifying = pinStore.verifying.value;

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  async function submit(e: Event) {
    e.preventDefault();
    setErr(null);
    const ok = await pinStore.verify(pin);
    if (ok) {
      rememberEntry(clubId(), pin);
    } else {
      setErr(pinStore.lastError.value ?? t.pin.wrongPin);
      setPin("");
      inputRef.current?.focus();
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "48px 20px" }} data-testid="entry-gate">
      <strong style={{ fontSize: 32, color: "var(--ink)" }}>{BRAND}</strong>
      <h2 style={{ margin: "12px 0 4px", fontSize: 18 }}>{t.entry.title}</h2>
      <p class="muted" style={{ marginTop: 0, fontSize: 14 }}>{t.entry.hint}</p>
      <form onSubmit={(e) => { void submit(e); }} class="card">
        <label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
          {t.pin.inputLabel}
          <input
            ref={inputRef}
            data-testid="entry-pin"
            type="password"
            inputMode="text"
            autoComplete="current-password"
            value={pin}
            onInput={(e) => { setPin((e.currentTarget as HTMLInputElement).value); }}
            style={{ display: "block", width: "100%", marginTop: 6, padding: 10, fontSize: 18, boxSizing: "border-box" }}
          />
        </label>
        {err && <p data-testid="entry-error" style={{ color: "crimson", margin: "8px 0 0" }}>{err}</p>}
        <button
          type="submit"
          class="btn-primary"
          data-testid="entry-submit"
          disabled={!pin || verifying}
          style={{ width: "100%", marginTop: 12 }}
        >
          {verifying ? t.pin.verifying : t.entry.enter}
        </button>
      </form>
      <p class="muted" style={{ marginTop: 16, fontSize: 12 }}>
        {t.entry.remember} · <a href={linkTo("/privacy")}>{t.settings.privacyLink}</a>
      </p>
    </main>
  );
}
