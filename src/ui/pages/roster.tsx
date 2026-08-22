import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { Gender } from "@/engine/models";
import { rosterStore, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { exportMemberData } from "@/data/gdpr-export";
import { linkTo } from "@/ui/router";
import { t } from "@/ui/i18n";
import { IS_LOCAL } from "@/flavor";

// Module-scoped UI state
const newName = signal("");
const renaming = signal<{ id: number; value: string } | null>(null);
const confirmingDelete = signal<{ id: number; name: string } | null>(null);
const error = signal<string | null>(null);
const busy = signal(false);

/** Test helper — resets module-scoped UI state. */
export function resetRosterState(): void {
  newName.value = "";
  renaming.value = null;
  confirmingDelete.value = null;
  error.value = null;
  busy.value = false;
}

function requirePin(): string {
  const pin = pinStore.getPin();
  if (!pin) throw new Error(t.roster.pinLocked);
  return pin;
}

async function add(): Promise<void> {
  const v = newName.value.trim();
  if (!v) return;
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.add(v, requirePin());
    newName.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function submitRename(): Promise<void> {
  const r = renaming.value;
  if (!r) return;
  const v = r.value.trim();
  if (!v) return;
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.rename(r.id, v, requirePin());
    renaming.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function doArchive(id: number): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.archive(id, requirePin());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function doUnarchive(id: number): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.unarchive(id, requirePin());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function doHardDelete(): Promise<void> {
  const c = confirmingDelete.value;
  if (!c) return;
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.hardDelete(c.id, requirePin());
    confirmingDelete.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function doSetGender(id: number, gender: Gender): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await rosterStore.setGender(id, gender, requirePin());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function doExport(id: number): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await exportMemberData(id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

const ghostButtonStyle = {
  background: "transparent",
  border: "1.5px solid var(--line)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer" as const,
};

function MemberRow({
  id,
  name,
  gender,
  isArchived,
  gate,
}: {
  id: number;
  name: string;
  gender: Gender;
  isArchived: boolean;
  gate(fn: () => void | Promise<void>): void;
}) {
  const isRenaming = renaming.value?.id === id;
  return (
    <div
      class="card"
      data-testid={`row-${id}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 8,
        opacity: isArchived ? 0.75 : 1,
      }}
    >
      {isRenaming ? (
        <input
          type="text"
          data-testid={`rename-input-${id}`}
          value={renaming.value!.value}
          onInput={(e) => {
            renaming.value = { id, value: (e.currentTarget as HTMLInputElement).value };
          }}
          style={{
            flex: 1,
            padding: 8,
            fontSize: 16,
            borderRadius: 8,
            border: "2px solid var(--ink)",
          }}
        />
      ) : (
        <span style={{ fontWeight: 700, color: isArchived ? "var(--muted)" : "var(--ink)" }}>
          {name}
        </span>
      )}
      <span style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
        {!isRenaming && (
          <select
            data-testid={`gender-${id}`}
            value={gender}
            aria-label={t.roster.gender}
            disabled={busy.value}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value as Gender;
              gate(() => doSetGender(id, v));
            }}
            style={{ padding: "6px 4px", fontSize: 13, borderRadius: 8, border: "1.5px solid var(--line)", flexShrink: 0 }}
          >
            <option value="unknown">{t.roster.genderNone}</option>
            <option value="male">{t.roster.genderMale}</option>
            <option value="female">{t.roster.genderFemale}</option>
          </select>
        )}
        {isRenaming ? (
          <>
            <button
              type="button"
              data-testid={`rename-save-${id}`}
              onClick={() => gate(submitRename)}
              disabled={busy.value}
              style={ghostButtonStyle}
            >
              {t.roster.save}
            </button>
            <button
              type="button"
              onClick={() => { renaming.value = null; }}
              style={ghostButtonStyle}
            >
              {t.roster.cancelRename}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={`rename-${id}`}
              onClick={() => { renaming.value = { id, value: name }; }}
              style={ghostButtonStyle}
            >
              {t.roster.rename}
            </button>
            {isArchived ? (
              <button
                type="button"
                data-testid={`unarchive-${id}`}
                onClick={() => gate(() => doUnarchive(id))}
                disabled={busy.value}
                style={ghostButtonStyle}
              >
                {t.roster.restore}
              </button>
            ) : (
              <button
                type="button"
                data-testid={`archive-${id}`}
                onClick={() => gate(() => doArchive(id))}
                disabled={busy.value}
                style={ghostButtonStyle}
              >
                {t.roster.archive}
              </button>
            )}
            {!IS_LOCAL && (
              <button
                type="button"
                data-testid={`export-${id}`}
                onClick={() => { void doExport(id); }}
                disabled={busy.value}
                style={ghostButtonStyle}
                title={t.roster.exportTooltip}
              >
                {t.roster.export}
              </button>
            )}
            <button
              type="button"
              data-testid={`delete-${id}`}
              onClick={() => { confirmingDelete.value = { id, name }; }}
              disabled={busy.value}
              style={{ ...ghostButtonStyle, color: "crimson", borderColor: "crimson" }}
            >
              {t.roster.delete}
            </button>
          </>
        )}
      </span>
    </div>
  );
}

export function RosterPage() {
  useEffect(() => {
    void rosterStore.load();
  }, []);

  const { gate, modal } = useRequirePin();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t.roster.title}</h2>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.roster.addTitle}</h3>
        {!IS_LOCAL && (
          <p class="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
            {t.roster.pinHint}
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            data-testid="new-member-input"
            placeholder={t.roster.namePlaceholder}
            value={newName.value}
            onInput={(e) => { newName.value = (e.currentTarget as HTMLInputElement).value; }}
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
            data-testid="new-member-add"
            disabled={busy.value || newName.value.trim().length === 0}
            onClick={() => gate(add)}
          >
            {t.roster.add}
          </button>
        </div>
      </section>

      {error.value && (
        <p data-testid="roster-error" style={{ color: "crimson" }}>
          {error.value}
        </p>
      )}

      <h3 style={{ fontSize: 15 }}>
        {t.roster.activeHeading} <span class="muted">({rosterStore.active.value.length})</span>
      </h3>
      {rosterStore.active.value.length === 0 ? (
        <p class="muted">{t.roster.noActive}</p>
      ) : (
        rosterStore.active.value.map((m) => (
          <MemberRow key={m.id} id={m.id} name={m.name} gender={m.gender} isArchived={false} gate={gate} />
        ))
      )}

      <h3 style={{ fontSize: 15, marginTop: 24 }}>
        {t.roster.archivedHeading} <span class="muted">({rosterStore.archived.value.length})</span>
      </h3>
      {rosterStore.archived.value.length === 0 ? (
        <p class="muted">{t.roster.noArchived}</p>
      ) : (
        rosterStore.archived.value.map((m) => (
          <MemberRow key={m.id} id={m.id} name={m.name} gender={m.gender} isArchived={true} gate={gate} />
        ))
      )}

      {confirmingDelete.value && (
        <div
          data-testid="delete-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 10,
          }}
        >
          <div class="card" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>{t.roster.deleteConfirmTitle}</h3>
            <p>
              <strong>{confirmingDelete.value.name}</strong>{t.roster.deleteConfirmData}
              <b style={{ color: "crimson" }}>{t.roster.deleteAll}</b>{t.roster.deleteConfirmSuffix}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { confirmingDelete.value = null; }}
                disabled={busy.value}
                style={{ ...ghostButtonStyle, flex: 1 }}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                class="btn-primary"
                data-testid="delete-confirm"
                disabled={busy.value}
                onClick={() => gate(doHardDelete)}
                style={{ flex: 1, background: "crimson", color: "white" }}
              >
                {t.roster.deleteAction}
              </button>
            </div>
          </div>
        </div>
      )}

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>{t.common.backHome}</a>
      </p>

      {modal}
    </main>
  );
}
