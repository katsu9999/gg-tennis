import { useEffect, useRef, useState } from "preact/hooks";
import { pinStore } from "@/ui/stores";

interface PinModalProps {
  open: boolean;
  title?: string;
  onCancel(): void;
  onUnlocked(): void;
}

/**
 * Asks for the shared club PIN, verifies it via the `verify_club_pin` RPC,
 * and on success caches it on `pinStore` for the page lifetime.
 *
 * Used by destructive operations: member edit/delete, venue add, planned
 * session create, settings change.
 */
export function PinModal({ open, title, onCancel, onUnlocked }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const verifying = pinStore.verifying.value;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setErr(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: Event) {
    e.preventDefault();
    setErr(null);
    const ok = await pinStore.verify(pin);
    if (ok) {
      onUnlocked();
    } else {
      setErr("PIN が違います");
      setPin("");
      inputRef.current?.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <form
        class="card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{ maxWidth: 360, width: "100%" }}
      >
        <h2 id="pin-modal-title" style={{ margin: "0 0 8px", fontSize: 18 }}>
          {title ?? "クラブ PIN を入力"}
        </h2>
        <p class="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          メンバー削除や設定変更などの操作には PIN が必要です。
        </p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onInput={(e) => setPin((e.target as HTMLInputElement).value)}
          placeholder="••••"
          aria-label="クラブ PIN"
          style={{
            width: "100%",
            fontSize: 18,
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            marginBottom: 8,
          }}
        />
        {err && (
          <p role="alert" style={{ color: "#b00020", fontSize: 13, margin: "4px 0 8px" }}>
            {err}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" class="btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
            キャンセル
          </button>
          <button
            type="submit"
            class="btn-primary"
            disabled={verifying || pin.length < 4}
            style={{ flex: 1 }}
          >
            {verifying ? "確認中…" : "解錠"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Convenience hook: ensure the PIN is unlocked before running `fn`. If the
 * PIN is already cached, runs immediately; otherwise opens the modal.
 *
 * Usage in a page:
 *   const { gate, modal } = useRequirePin();
 *   return <>{modal}<button onClick={() => gate(() => doDelete(id))}>Delete</button></>;
 */
export function useRequirePin() {
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  function gate(fn: () => void | Promise<void>) {
    if (pinStore.isUnlocked.value && pinStore.getPin()) {
      void fn();
      return;
    }
    pendingRef.current = fn;
    setOpen(true);
  }

  const modal = (
    <PinModal
      open={open}
      onCancel={() => {
        pendingRef.current = null;
        setOpen(false);
      }}
      onUnlocked={() => {
        setOpen(false);
        const fn = pendingRef.current;
        pendingRef.current = null;
        if (fn) void fn();
      }}
    />
  );

  return { gate, modal };
}
