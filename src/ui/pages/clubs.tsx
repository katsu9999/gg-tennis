import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { Club } from "@/data/club";
import { isGgClub, isValidClubSlug } from "@/data/club";
import { createNewClub, listAllClubs, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { appDialog } from "@/ui/components/app-dialog";
import { absoluteLinkTo, linkTo } from "@/ui/router";
import { t } from "@/ui/i18n";

// クラブの追加（2026-11-22 複数クラブ）。GG の画面からだけ開け、GG の PIN が要る。
// 作ったクラブはデータが完全に別（名簿・ランキング・過去セッション・PIN）。
// 作った人は、表示されるリンクと新しいクラブの PIN を相手に渡す。

const clubs = signal<Club[]>([]);
const name = signal("");
const slug = signal("");
const slugTouched = signal(false);
const locale = signal<"ja" | "en">("en");
const newPin = signal("");
const newPin2 = signal("");
const busy = signal(false);
const created = signal<Club | null>(null);

export function resetClubsState(): void {
  clubs.value = [];
  name.value = "";
  slug.value = "";
  slugTouched.value = false;
  locale.value = "en";
  newPin.value = "";
  newPin2.value = "";
  busy.value = false;
  created.value = null;
}

/** クラブ名から URL 用の名前を作る（英数字とハイフンだけ）。 */
export function slugFromName(n: string): string {
  return n
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
  if (/slug_taken/.test(raw)) return t.clubs.errSlugTaken;
  if (/reserved_slug|invalid_slug/.test(raw)) return t.clubs.errSlugInvalid;
  if (/pin_too_short/.test(raw)) return t.clubs.errPinShort;
  if (/invalid_pin/.test(raw)) return t.clubs.errAdminPin;
  return raw;
}

async function reload(): Promise<void> {
  try {
    clubs.value = await listAllClubs();
  } catch (e) {
    console.error("listAllClubs failed", e);
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    void appDialog.alert(t.clubs.copied);
  } catch {
    void appDialog.alert(text);
  }
}

export function ClubsPage() {
  useEffect(() => { void reload(); }, []);
  const { gate, modal } = useRequirePin();

  if (!isGgClub()) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <p>{t.clubs.ggOnly}</p>
        <p><a href={linkTo("/")}>{t.common.backHome}</a></p>
      </main>
    );
  }

  const effectiveSlug = slugTouched.value ? slug.value : slugFromName(name.value);
  const pinOk = /^\S{6,}$/.test(newPin.value) && newPin.value === newPin2.value;
  const canSubmit = name.value.trim() !== "" && isValidClubSlug(effectiveSlug) && pinOk && !busy.value;

  function submit(): void {
    gate(async () => {
      const adminPin = pinStore.getPin();
      if (!adminPin) return;
      busy.value = true;
      try {
        await createNewClub({
          adminPin,
          slug: effectiveSlug,
          name: name.value.trim(),
          locale: locale.value,
          pin: newPin.value,
        });
        await reload();
        created.value = clubs.value.find((c) => c.slug === effectiveSlug) ?? {
          id: 0, slug: effectiveSlug, name: name.value.trim(), locale: locale.value, lineEnabled: false,
        };
        name.value = "";
        slug.value = "";
        slugTouched.value = false;
        newPin.value = "";
        newPin2.value = "";
      } catch (e) {
        console.error("create club failed", e);
        void appDialog.alert(t.clubs.createFailed(errorMessage(e)));
      } finally {
        busy.value = false;
      }
    });
  }

  const input = { display: "block", width: "100%", marginTop: 4, padding: 8, fontSize: 15, boxSizing: "border-box" as const };
  const label = { display: "block", marginTop: 10, fontSize: 13, fontWeight: 700 };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      {modal}
      <h2 style={{ marginTop: 0 }}>{t.clubs.title}</h2>
      <p class="muted" style={{ marginTop: 0 }}>{t.clubs.intro}</p>

      {created.value && (
        <section class="card" data-testid="club-created" style={{ marginBottom: 16, borderColor: "var(--ink)" }}>
          <strong>{t.clubs.createdTitle(created.value.name)}</strong>
          <p style={{ margin: "6px 0", wordBreak: "break-all" }}>{absoluteLinkTo("/", created.value.slug)}</p>
          <p class="muted" style={{ margin: "6px 0", fontSize: 13 }}>{t.clubs.createdHint}</p>
          <button type="button" class="btn-primary" onClick={() => { void copy(absoluteLinkTo("/", created.value!.slug)); }}>
            {t.clubs.copyLink}
          </button>
        </section>
      )}

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t.clubs.listTitle}</h3>
        {clubs.value.map((c) => (
          <div
            key={c.id}
            data-testid={`club-row-${c.slug}`}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)" }}
          >
            <span>
              <strong>{c.name}</strong>{" "}
              <span class="muted" style={{ fontSize: 12 }}>/{c.slug === "gg" ? "" : `c/${c.slug}`} · {c.locale === "en" ? "English" : "日本語"}</span>
            </span>
            <button
              type="button"
              onClick={() => { void copy(absoluteLinkTo("/", c.slug)); }}
              style={{ background: "transparent", border: "1.5px solid var(--line)", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {t.clubs.copyLink}
            </button>
          </div>
        ))}
      </section>

      <section class="card">
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t.clubs.addTitle}</h3>
        <label style={label}>
          {t.clubs.name}
          <input
            data-testid="club-name"
            value={name.value}
            placeholder="Hampstead Social Tennis"
            onInput={(e) => { name.value = (e.currentTarget as HTMLInputElement).value; }}
            style={input}
          />
        </label>
        <label style={label}>
          {t.clubs.slug}
          <input
            data-testid="club-slug"
            value={effectiveSlug}
            onInput={(e) => { slugTouched.value = true; slug.value = (e.currentTarget as HTMLInputElement).value.toLowerCase(); }}
            style={input}
          />
          <span class="muted" style={{ fontSize: 12, fontWeight: 400, wordBreak: "break-all" }}>
            {effectiveSlug && isValidClubSlug(effectiveSlug) ? absoluteLinkTo("/", effectiveSlug) : t.clubs.slugRule}
          </span>
        </label>
        <label style={label}>
          {t.clubs.language}
          <select
            data-testid="club-locale"
            value={locale.value}
            onChange={(e) => { locale.value = (e.currentTarget as HTMLSelectElement).value === "ja" ? "ja" : "en"; }}
            style={input}
          >
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label style={label}>
          {t.clubs.pin}
          <input
            data-testid="club-pin"
            type="password"
            autoComplete="new-password"
            value={newPin.value}
            onInput={(e) => { newPin.value = (e.currentTarget as HTMLInputElement).value; }}
            style={input}
          />
        </label>
        <label style={label}>
          {t.clubs.pinConfirm}
          <input
            data-testid="club-pin2"
            type="password"
            autoComplete="new-password"
            value={newPin2.value}
            onInput={(e) => { newPin2.value = (e.currentTarget as HTMLInputElement).value; }}
            style={input}
          />
        </label>
        <p class="muted" style={{ fontSize: 12 }}>{t.clubs.pinHint}</p>
        <button
          type="button"
          class="btn-primary"
          data-testid="club-create"
          style={{ width: "100%" }}
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy.value ? t.clubs.creating : t.clubs.create}
        </button>
      </section>

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/settings")}>{t.clubs.backToSettings}</a>
      </p>
    </main>
  );
}
