import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { navigate } from "@/ui/router";
import {
  rosterStore,
  sessionStore,
  venueRepo,
  hostStore,
  pinStore,
  plannedSessionRepo,
  plannedSessionStore,
  rsvpStore,
} from "@/ui/stores";
import { getFromParam } from "@/ui/location";

// Form state — scoped per page navigation. signals are module-scoped here for
// simplicity; if the user navigates away and back, the previous form contents
// remain. Reset is explicit (via the back button or successful submission).
const today = () => new Date().toISOString().slice(0, 10);

const date = signal(today());
const location = signal("");
const courtCount = signal(3);
const allowSingles = signal(true);
const selected = signal<Set<number>>(new Set());
const venues = signal<string[]>([]);
const submitting = signal(false);
const error = signal<string | null>(null);
/** Tracks the ?from=<plannedSessionId> query param. Set when preloading from a planned session. */
const plannedSessionId = signal<string | null>(null);

/** Reset all form state to defaults. Called by tests in beforeEach. */
export function resetFormState(): void {
  date.value = today();
  location.value = "";
  courtCount.value = 3;
  allowSingles.value = true;
  selected.value = new Set();
  venues.value = [];
  submitting.value = false;
  error.value = null;
  plannedSessionId.value = null;
}

function toggle(id: number): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

async function loadAux(): Promise<void> {
  await rosterStore.load();
  venues.value = await venueRepo.list();

  // If ?from=<id> is in the URL, preload form from the planned session.
  const fromId = getFromParam();
  if (fromId) {
    plannedSessionId.value = fromId;
    const [planned, rsvps] = await Promise.all([
      plannedSessionRepo.loadById(fromId),
      rsvpStore.loadForSession(fromId),
    ]);
    if (planned) {
      date.value = planned.date;
      location.value = planned.location;
      courtCount.value = planned.court_count;
      allowSingles.value = planned.allow_singles;
    }
    // Pre-select going members
    const goingIds = rsvps
      .filter((r) => r.status === "going")
      .map((r) => r.member_id);
    if (goingIds.length > 0) {
      selected.value = new Set(goingIds);
    }
  }
}

async function submit(): Promise<void> {
  if (selected.value.size < 2 || !location.value) return;
  submitting.value = true;
  error.value = null;
  try {
    await sessionStore.startNewSession({
      date: new Date(date.value),
      location: location.value,
      courtCount: courtCount.value,
      allowSingles: allowSingles.value,
      memberIds: [...selected.value],
      hostToken: hostStore.token.value,
      hostLabel: hostStore.label.value || null,
      ...(plannedSessionId.value ? { plannedSessionId: plannedSessionId.value } : {}),
    });
    // Best-effort: delete the planned session it was derived from (PIN-gated;
    // skipped silently if PIN isn't unlocked — the planned session row will
    // just be left behind for the operator to clean up later).
    const pin = pinStore.getPin();
    if (plannedSessionId.value && pin) {
      plannedSessionStore.delete(plannedSessionId.value, pin).catch(() => undefined);
    }
    // Best-effort: capture the venue for next time (PIN-gated; same behavior).
    if (pin) {
      await venueRepo.add(location.value, pin).catch(() => undefined);
    }
    // Reset selection so a re-entry starts clean
    selected.value = new Set();
    navigate("/session/number-map");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

export function NewSessionPage() {
  useEffect(() => {
    void loadAux();
  }, []);

  const canSubmit = selected.value.size >= 2 && location.value.trim().length > 0 && !submitting.value;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>新規セッション</h2>

      {plannedSessionId.value && (
        <div
          data-testid="planned-banner"
          style={{
            background: "var(--bg)",
            border: "2px solid var(--line)",
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          📅 予定から読み込みました。内容を確認して開始してください。
        </div>
      )}

      <section class="card" style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>日付</div>
          <input
            type="date"
            value={date.value}
            onInput={(e) => { date.value = (e.currentTarget as HTMLInputElement).value; }}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)", width: "100%" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>会場</div>
          <input
            type="text"
            list="venues-list"
            value={location.value}
            placeholder="例: Golders Hill"
            onInput={(e) => { location.value = (e.currentTarget as HTMLInputElement).value; }}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)", width: "100%" }}
          />
          <datalist id="venues-list">
            {venues.value.map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>コート数 (1-6)</div>
          <input
            type="number"
            min={1}
            max={6}
            value={courtCount.value}
            onInput={(e) => {
              const n = parseInt((e.currentTarget as HTMLInputElement).value, 10);
              if (!Number.isNaN(n) && n >= 1 && n <= 6) courtCount.value = n;
            }}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)", width: 80 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={allowSingles.value}
            onInput={(e) => { allowSingles.value = (e.currentTarget as HTMLInputElement).checked; }}
          />
          {" "}シングルス許可
        </label>
      </section>

      <section class="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>出席を選ぶ</h3>
        {rosterStore.active.value.length === 0 ? (
          <p class="muted">名簿にアクティブ会員がいません。<a href="/roster">名簿を追加</a></p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {rosterStore.active.value.map((m) => {
              const isSelected = selected.value.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  data-testid={`member-${m.id}`}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? "var(--ink)" : "var(--line)"}`,
                    background: isSelected ? "var(--ink)" : "var(--card)",
                    color: isSelected ? "#fff" : "var(--ink)",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
        <p class="muted" style={{ margin: "12px 0 0" }}>選択: {selected.value.size} 人</p>
      </section>

      {error.value && <p style={{ color: "crimson" }}>{error.value}</p>}

      <button
        type="button"
        class="btn-primary"
        style={{ width: "100%" }}
        disabled={!canSubmit}
        onClick={() => { void submit(); }}
      >
        次へ：番号を抽選 <span class="a">→</span>
      </button>
    </main>
  );
}
