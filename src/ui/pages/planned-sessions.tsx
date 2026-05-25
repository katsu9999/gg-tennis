import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { plannedSessionStore, rsvpStore, rosterStore, pinStore } from "@/ui/stores";
import { useRequirePin } from "@/ui/components/pin-modal";
import { RsvpSummary } from "@/ui/components/rsvp-summary";
import type { RsvpStatus } from "@/data/rsvp-repository";
import { navigate } from "@/ui/router";

function requirePin(): string {
  const pin = pinStore.getPin();
  if (!pin) throw new Error("PIN がロックされています");
  return pin;
}

interface FormState {
  date: string;
  location: string;
  courtCount: number;
  allowSingles: boolean;
  showGoingListOnPublic: boolean;
}

const initialForm = (): FormState => ({
  date: new Date().toISOString().slice(0, 10),
  location: "",
  courtCount: 3,
  allowSingles: true,
  showGoingListOnPublic: true,
});

const form = signal<FormState>(initialForm());
const error = signal<string | null>(null);
const busy = signal(false);
const linkCopied = signal<string | null>(null); // sessionId whose link was just copied

export function resetPlannedSessionsState(): void {
  form.value = initialForm();
  error.value = null;
  busy.value = false;
  linkCopied.value = null;
}

async function refreshAll(): Promise<void> {
  await Promise.all([
    rosterStore.load(),
    plannedSessionStore.load(),
  ]);
  // Load RSVPs per planned session
  await Promise.all(
    plannedSessionStore.list.value.map((ps) => rsvpStore.loadForSession(ps.id)),
  );
}

async function submitCreate(): Promise<void> {
  if (!form.value.date || !form.value.location.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await plannedSessionStore.create({
      date: form.value.date,
      location: form.value.location.trim(),
      court_count: form.value.courtCount,
      allow_singles: form.value.allowSingles,
      public_rsvp_token: null,
      show_going_list_on_public: form.value.showGoingListOnPublic,
      created_by: null,
    }, requirePin());
    await rsvpStore.loadForSession(created.id);
    form.value = initialForm();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function setRsvp(plannedSessionId: string, memberId: number, status: RsvpStatus): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await rsvpStore.adminUpsert({
      planned_session_id: plannedSessionId,
      member_id: memberId,
      status,
      note: null,
      self_token: null,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function copyPublicLink(sessionId: string, existingToken: string | null): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const token = existingToken ?? (await plannedSessionStore.rotateToken(sessionId, requirePin()));
    const url = `${window.location.origin}/rsvp/${token}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
    linkCopied.value = sessionId;
    setTimeout(() => {
      if (linkCopied.value === sessionId) linkCopied.value = null;
    }, 3000);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function rotateLink(sessionId: string): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await plannedSessionStore.rotateToken(sessionId, requirePin());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function deletePlanned(id: string): Promise<void> {
  if (!confirm("この将来セッションを削除しますか？")) return;
  busy.value = true;
  error.value = null;
  try {
    await plannedSessionStore.delete(id, requirePin());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

const ghostButton = {
  background: "transparent",
  border: "1.5px solid var(--line)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer" as const,
};

export function PlannedSessionsPage() {
  useEffect(() => {
    void refreshAll();
  }, []);

  const { gate, modal } = useRequirePin();

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>将来セッション</h2>

      <section class="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>新規作成</h3>
        <p class="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
          作成・編集・削除にはクラブ PIN が必要です。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <label>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>日付</div>
            <input
              type="date"
              data-testid="planned-date"
              value={form.value.date}
              onInput={(e) => {
                form.value = { ...form.value, date: (e.currentTarget as HTMLInputElement).value };
              }}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "2px solid var(--line)" }}
            />
          </label>
          <label>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>会場</div>
            <input
              type="text"
              data-testid="planned-location"
              value={form.value.location}
              placeholder="Golders Hill"
              onInput={(e) => {
                form.value = { ...form.value, location: (e.currentTarget as HTMLInputElement).value };
              }}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "2px solid var(--line)" }}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto auto auto 1fr", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <label>
            <span style={{ fontWeight: 700, fontSize: 13 }}>コート </span>
            <input
              type="number"
              min={1}
              max={6}
              data-testid="planned-court-count"
              value={form.value.courtCount}
              onInput={(e) => {
                const n = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                if (!Number.isNaN(n) && n >= 1 && n <= 6) form.value = { ...form.value, courtCount: n };
              }}
              style={{ width: 70, padding: 6, borderRadius: 8, border: "2px solid var(--line)" }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.value.allowSingles}
              onInput={(e) => {
                form.value = { ...form.value, allowSingles: (e.currentTarget as HTMLInputElement).checked };
              }}
            />{" "}シングルス許可
          </label>
          <label style={{ fontSize: 13 }} title="公開リンクで「行く人」リストを公開するか">
            <input
              type="checkbox"
              data-testid="planned-show-going"
              checked={form.value.showGoingListOnPublic}
              onInput={(e) => {
                form.value = { ...form.value, showGoingListOnPublic: (e.currentTarget as HTMLInputElement).checked };
              }}
            />{" "}行く人リストを公開
          </label>
        </div>
        <button
          type="button"
          class="btn-primary"
          data-testid="planned-create"
          disabled={busy.value || !form.value.location.trim() || !form.value.date}
          onClick={() => gate(submitCreate)}
        >
          作成
        </button>
      </section>

      {error.value && (
        <p data-testid="planned-error" style={{ color: "crimson" }}>{error.value}</p>
      )}

      {plannedSessionStore.list.value.length === 0 ? (
        <p class="muted">まだ将来セッションがありません。</p>
      ) : (
        plannedSessionStore.list.value.map((ps) => {
          const sessionRsvps = rsvpStore.bySession.value.get(ps.id) ?? [];
          return (
            <div key={ps.id} class="card" data-testid={`planned-${ps.id}`} style={{ marginBottom: 12 }}>
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 16 }}>
                  {ps.date} @ {ps.location}{" "}
                  <span class="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                    ({ps.court_count}コート)
                  </span>
                </strong>
                <button
                  type="button"
                  data-testid={`planned-delete-${ps.id}`}
                  onClick={() => gate(() => deletePlanned(ps.id))}
                  disabled={busy.value}
                  style={{ ...ghostButton, color: "crimson", borderColor: "crimson" }}
                >
                  削除
                </button>
              </header>

              <RsvpSummary rsvps={sessionRsvps} activeMembers={rosterStore.active.value} />

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>RSVP を編集</summary>
                <div style={{ marginTop: 8 }}>
                  {rosterStore.active.value.map((m) => {
                    const current = sessionRsvps.find((r) => r.member_id === m.id);
                    return (
                      <div
                        key={m.id}
                        data-testid={`rsvp-row-${ps.id}-${m.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
                      >
                        <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                        <span class="muted" style={{ width: 60, fontSize: 12, textAlign: "right" }}>
                          {current?.status === "going" ? "行く" : current?.status === "maybe" ? "未定" : current?.status === "not_going" ? "行かない" : "—"}
                        </span>
                        {(["going", "maybe", "not_going"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            data-testid={`rsvp-set-${ps.id}-${m.id}-${s}`}
                            onClick={() => { void setRsvp(ps.id, m.id, s); }}
                            disabled={busy.value}
                            style={{
                              ...ghostButton,
                              background: current?.status === s ? "var(--ink)" : "transparent",
                              color: current?.status === s ? "#fff" : "var(--ink)",
                              borderColor: current?.status === s ? "var(--ink)" : "var(--line)",
                            }}
                          >
                            {s === "going" ? "行く" : s === "maybe" ? "未定" : "行かない"}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </details>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  data-testid={`planned-copy-link-${ps.id}`}
                  onClick={() => {
                    if (ps.public_rsvp_token) {
                      void copyPublicLink(ps.id, ps.public_rsvp_token);
                    } else {
                      gate(() => copyPublicLink(ps.id, null));
                    }
                  }}
                  disabled={busy.value}
                  style={ghostButton}
                >
                  {linkCopied.value === ps.id ? "コピー済み ✓" : ps.public_rsvp_token ? "公開リンクをコピー" : "公開リンクを発行"}
                </button>
                {ps.public_rsvp_token && (
                  <button
                    type="button"
                    data-testid={`planned-rotate-${ps.id}`}
                    onClick={() => gate(() => rotateLink(ps.id))}
                    disabled={busy.value}
                    style={ghostButton}
                  >
                    リンクを再発行
                  </button>
                )}
                <button
                  type="button"
                  class="btn-primary"
                  data-testid={`planned-start-${ps.id}`}
                  onClick={() => navigate(`/session/new?from=${ps.id}`)}
                  style={{ marginLeft: "auto" }}
                >
                  セッション開始 →
                </button>
              </div>
            </div>
          );
        })
      )}

      <p class="muted" style={{ marginTop: 24, fontSize: 13 }}>
        <a href="/">← ホーム</a>
      </p>

      {modal}
    </main>
  );
}
