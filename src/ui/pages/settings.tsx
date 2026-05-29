import { useState } from "preact/hooks";
import { hostStore, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { supabase } from "@/data/supabase-client";
import { linkTo } from "@/ui/router";

export function SettingsPage() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>設定</h2>

      <HostLabelCard />
      <PinCard />

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>屋外モード</h3>
        <p class="muted" style={{ fontSize: 14, margin: "8px 0" }}>
          画面の明るさを最大にしてください。<br />
          Web版はブラウザ制約で輝度を自動制御できません。<br />
          v1.5 のネイティブ App 版では自動 MAX 化される予定です。
        </p>
      </section>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>プライバシー</h3>
        <p style={{ margin: "8px 0" }}>
          <a href={linkTo("/privacy")}>プライバシーノーティス（日本語 / English）</a>
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

  function save() {
    hostStore.setLabel(label.trim());
  }

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
        <button type="button" class="btn-primary" data-testid="host-label-save" onClick={save}>
          保存
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
    const pin = pinStore.getPin();
    if (!pin) {
      setErr("PIN がロックされています");
      return;
    }
    const { error } = await supabase.rpc("set_club_pin", {
      p_pin: pin,
      p_new_pin: newPin,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    // The cached PIN is now stale; lock and re-cache the new one.
    pinStore.lock();
    await pinStore.verify(newPin);
    setNewPin("");
    setMsg("PIN を更新しました");
  }

  return (
    <section class="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>クラブ PIN</h3>
      <p class="muted" style={{ margin: "8px 0", fontSize: 13 }}>
        メンバー削除や予定セッション作成など、破壊操作の保護に使います。
        定期的にローテーションしてください。
      </p>
      <p style={{ margin: "8px 0", fontSize: 14 }}>
        状態:{" "}
        {pinStore.isUnlocked.value ? (
          <span style={{ color: "green", fontWeight: 700 }}>解錠中</span>
        ) : (
          <span style={{ color: "var(--muted)" }}>ロック中</span>
        )}
        {pinStore.isUnlocked.value && (
          <button
            type="button"
            class="btn-secondary"
            onClick={() => pinStore.lock()}
            data-testid="pin-lock"
            style={{ marginLeft: 12 }}
          >
            ロック
          </button>
        )}
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          type="password"
          inputMode="numeric"
          value={newPin}
          onInput={(e) => setNewPin((e.target as HTMLInputElement).value)}
          placeholder="新しい PIN (4 文字以上)"
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
          PIN 更新
        </button>
      </div>
      {msg && <p style={{ color: "green", fontSize: 13 }}>{msg}</p>}
      {err && <p style={{ color: "crimson", fontSize: 13 }}>{err}</p>}
      {modal}
    </section>
  );
}
