import { signal } from "@preact/signals";

/**
 * In-app replacement for window.confirm / window.alert.
 *
 * iOS standalone PWAs (home-screen installs) can suppress the native
 * confirm/alert dialogs entirely — confirm() then returns false immediately,
 * which made buttons like セッション終了 appear dead on iPhone. This renders
 * the same UX as an in-app modal (same pattern as PinModal) so it works in
 * every display mode.
 *
 * Usage:
 *   if (!(await appDialog.confirm("終了しますか？"))) return;
 *   await appDialog.alert("保存に失敗しました");
 *
 * <AppDialogHost /> must be mounted once at the app root.
 */

export interface AppDialogState {
  kind: "alert" | "confirm";
  message: string;
  resolve: (value: boolean) => void;
}

const current = signal<AppDialogState | null>(null);

function open(kind: AppDialogState["kind"], message: string): Promise<boolean> {
  // If a dialog is somehow already open, resolve it as cancelled so the
  // previous caller never hangs on an orphaned promise.
  current.value?.resolve(false);
  return new Promise<boolean>((resolve) => {
    current.value = { kind, message, resolve };
  });
}

export const appDialog = {
  /** Signal holding the open dialog, or null. Exposed for the host and tests. */
  current,
  confirm(message: string): Promise<boolean> {
    return open("confirm", message);
  },
  async alert(message: string): Promise<void> {
    await open("alert", message);
  },
};

function close(result: boolean) {
  const d = current.value;
  current.value = null;
  d?.resolve(result);
}

export function AppDialogHost() {
  const d = current.value;
  if (!d) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16,
      }}
      onClick={() => { if (d.kind === "confirm") close(false); }}
    >
      <div
        class="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 360, width: "100%" }}
      >
        <p
          data-testid="app-dialog-message"
          style={{ margin: "0 0 12px", fontSize: 15, whiteSpace: "pre-wrap" }}
        >
          {d.message}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {d.kind === "confirm" && (
            <button
              type="button"
              class="btn-secondary"
              data-testid="app-dialog-cancel"
              style={{ flex: 1 }}
              onClick={() => close(false)}
            >
              キャンセル
            </button>
          )}
          <button
            type="button"
            class="btn-primary"
            data-testid="app-dialog-ok"
            style={{ flex: 1 }}
            onClick={() => close(true)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
