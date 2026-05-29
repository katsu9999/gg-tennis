import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { rosterStore, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { exportMemberData } from "@/data/gdpr-export";
import { linkTo } from "@/ui/router";

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
  if (!pin) throw new Error("PIN がロックされています");
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
  isArchived,
  gate,
}: {
  id: number;
  name: string;
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
      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {isRenaming ? (
          <>
            <button
              type="button"
              data-testid={`rename-save-${id}`}
              onClick={() => gate(submitRename)}
              disabled={busy.value}
              style={ghostButtonStyle}
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => { renaming.value = null; }}
              style={ghostButtonStyle}
            >
              取消
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
              改名
            </button>
            {isArchived ? (
              <button
                type="button"
                data-testid={`unarchive-${id}`}
                onClick={() => gate(() => doUnarchive(id))}
                disabled={busy.value}
                style={ghostButtonStyle}
              >
                復帰
              </button>
            ) : (
              <button
                type="button"
                data-testid={`archive-${id}`}
                onClick={() => gate(() => doArchive(id))}
                disabled={busy.value}
                style={ghostButtonStyle}
              >
                アーカイブ
              </button>
            )}
            <button
              type="button"
              data-testid={`export-${id}`}
              onClick={() => { void doExport(id); }}
              disabled={busy.value}
              style={ghostButtonStyle}
              title="このメンバーのデータを JSON でエクスポート (GDPR §17.4)"
            >
              エクスポート
            </button>
            <button
              type="button"
              data-testid={`delete-${id}`}
              onClick={() => { confirmingDelete.value = { id, name }; }}
              disabled={busy.value}
              style={{ ...ghostButtonStyle, color: "crimson", borderColor: "crimson" }}
            >
              削除
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
      <h2 style={{ marginTop: 0 }}>名簿</h2>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>新規会員を追加</h3>
        <p class="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
          追加・変更にはクラブ PIN が必要です。
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            data-testid="new-member-input"
            placeholder="名前"
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
            追加
          </button>
        </div>
      </section>

      {error.value && (
        <p data-testid="roster-error" style={{ color: "crimson" }}>
          {error.value}
        </p>
      )}

      <h3 style={{ fontSize: 15 }}>
        アクティブ <span class="muted">({rosterStore.active.value.length})</span>
      </h3>
      {rosterStore.active.value.length === 0 ? (
        <p class="muted">アクティブ会員はまだいません。</p>
      ) : (
        rosterStore.active.value.map((m) => (
          <MemberRow key={m.id} id={m.id} name={m.name} isArchived={false} gate={gate} />
        ))
      )}

      <h3 style={{ fontSize: 15, marginTop: 24 }}>
        アーカイブ <span class="muted">({rosterStore.archived.value.length})</span>
      </h3>
      {rosterStore.archived.value.length === 0 ? (
        <p class="muted">アーカイブされた会員はいません。</p>
      ) : (
        rosterStore.archived.value.map((m) => (
          <MemberRow key={m.id} id={m.id} name={m.name} isArchived={true} gate={gate} />
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
            <h3 style={{ marginTop: 0 }}>本当に削除しますか？</h3>
            <p>
              <strong>{confirmingDelete.value.name}</strong> のデータ（会員情報・試合履歴・ペア履歴・RSVP）が
              <b style={{ color: "crimson" }}>すべて削除</b>されます。元に戻せません（GDPR §17.4 削除権）。
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { confirmingDelete.value = null; }}
                disabled={busy.value}
                style={{ ...ghostButtonStyle, flex: 1 }}
              >
                キャンセル
              </button>
              <button
                type="button"
                class="btn-primary"
                data-testid="delete-confirm"
                disabled={busy.value}
                onClick={() => gate(doHardDelete)}
                style={{ flex: 1, background: "crimson", color: "white" }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href={linkTo("/")}>← ホーム</a>
      </p>

      {modal}
    </main>
  );
}
