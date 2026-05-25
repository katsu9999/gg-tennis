import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { plannedSessionRepo, rsvpRepo, memberRepo } from "@/ui/stores";
import type { PlannedSessionRow } from "@/data/planned-session-repository";
import type { RsvpRow, RsvpStatus } from "@/data/rsvp-repository";
import type { Member } from "@/engine/models";

const loading = signal(true);
const notFound = signal(false);
const session = signal<PlannedSessionRow | null>(null);
const activeMembers = signal<Member[]>([]);
const rsvps = signal<RsvpRow[]>([]);
const selectedMemberId = signal<number | "">("");
const note = signal("");
const submitting = signal(false);
const error = signal<string | null>(null);
const justSubmitted = signal<RsvpStatus | null>(null);

export function resetPublicRsvpState(): void {
  loading.value = true;
  notFound.value = false;
  session.value = null;
  activeMembers.value = [];
  rsvps.value = [];
  selectedMemberId.value = "";
  note.value = "";
  submitting.value = false;
  error.value = null;
  justSubmitted.value = null;
}

function localTokenKey(plannedSessionId: string): string {
  return `gg:rsvp-self-token:${plannedSessionId}`;
}

function getOrCreateSelfToken(plannedSessionId: string): string {
  const key = localTokenKey(plannedSessionId);
  if (typeof localStorage === "undefined") {
    // SSR / test env without localStorage: synthesize but don't persist.
    return crypto.randomUUID();
  }
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const minted = crypto.randomUUID();
  localStorage.setItem(key, minted);
  return minted;
}

function applyNoIndexMeta(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex,nofollow";
  document.head.appendChild(meta);
  return () => {
    if (meta.parentNode) meta.parentNode.removeChild(meta);
  };
}

async function loadAll(token: string): Promise<void> {
  loading.value = true;
  notFound.value = false;
  try {
    const ps = await plannedSessionRepo.loadByToken(token);
    if (!ps) {
      notFound.value = true;
      return;
    }
    session.value = ps;
    const [members, sessionRsvps] = await Promise.all([
      memberRepo.listActive(),
      rsvpRepo.listForSession(ps.id),
    ]);
    activeMembers.value = members;
    rsvps.value = sessionRsvps;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function submit(status: RsvpStatus): Promise<void> {
  const ps = session.value;
  const memberId = selectedMemberId.value;
  if (!ps || typeof memberId !== "number") return;
  submitting.value = true;
  error.value = null;
  try {
    const selfToken = getOrCreateSelfToken(ps.id);
    await rsvpRepo.publicUpsertWithToken({
      planned_session_id: ps.id,
      member_id: memberId,
      status,
      note: note.value.trim() || null,
      self_token: selfToken,
    });
    justSubmitted.value = status;
    // Refresh visible list
    rsvps.value = await rsvpRepo.listForSession(ps.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}

interface Props {
  token: string;
}

export function PublicRsvpPage({ token }: Props) {
  useEffect(() => {
    const cleanupMeta = applyNoIndexMeta();
    void loadAll(token);
    return () => { cleanupMeta(); };
  }, [token]);

  if (loading.value) {
    return (
      <main style={{ maxWidth: 600, margin: "60px auto", padding: 20 }}>
        <p class="muted">読み込み中…</p>
      </main>
    );
  }

  if (notFound.value || !session.value) {
    return (
      <main style={{ maxWidth: 600, margin: "60px auto", padding: 20 }}>
        <h2>このリンクは無効です</h2>
        <p class="muted">主催者にお問い合わせください。</p>
      </main>
    );
  }

  const s = session.value;
  const goingRsvps = rsvps.value.filter((r) => r.status === "going");
  const maybeCount = rsvps.value.filter((r) => r.status === "maybe").length;
  const notGoingCount = rsvps.value.filter((r) => r.status === "not_going").length;
  const memberById = new Map(activeMembers.value.map((m) => [m.id, m] as const));
  const goingNames = goingRsvps
    .map((r) => memberById.get(r.member_id)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <strong style={{ fontSize: 28 }}>GG</strong>
        <span class="muted">出欠回答</span>
      </header>

      <section class="card" style={{ marginBottom: 16 }}>
        <h2 data-testid="rsvp-title" style={{ margin: 0, fontSize: 18 }}>
          {s.date} @ {s.location}
        </h2>
        <p class="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
          コート {s.court_count} 面 · {s.allow_singles ? "シングルス許可" : "ダブルスのみ"}
        </p>
      </section>

      <section class="card" style={{ marginBottom: 16 }}>
        {s.show_going_list_on_public ? (
          <p style={{ margin: 0 }} data-testid="going-list">
            ✅ <strong>行く ({goingNames.length})</strong>:{" "}
            {goingNames.length === 0 ? <span class="muted">まだいません</span> : goingNames.join(", ")}
          </p>
        ) : (
          <p style={{ margin: 0 }} data-testid="going-count">
            ✅ 行く: {goingRsvps.length}人
          </p>
        )}
        <p class="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
          ❓ 未定 {maybeCount}人 · ❌ 行かない {notGoingCount}人
        </p>
      </section>

      <section class="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>あなたの回答</h3>
        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>名簿から選ぶ</div>
          <select
            data-testid="rsvp-member-select"
            value={selectedMemberId.value === "" ? "" : String(selectedMemberId.value)}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              selectedMemberId.value = v === "" ? "" : parseInt(v, 10);
            }}
            style={{ width: "100%", padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)" }}
          >
            <option value="">— 選択してください —</option>
            {activeMembers.value.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>メモ（任意）</div>
          <textarea
            data-testid="rsvp-note"
            value={note.value}
            placeholder="30分遅れる など"
            onInput={(e) => { note.value = (e.currentTarget as HTMLTextAreaElement).value; }}
            rows={2}
            style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 8, border: "2px solid var(--line)", resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          {(["going", "maybe", "not_going"] as const).map((s) => (
            <button
              key={s}
              type="button"
              class="btn-primary"
              data-testid={`rsvp-submit-${s}`}
              disabled={submitting.value || typeof selectedMemberId.value !== "number"}
              onClick={() => { void submit(s); }}
              style={{ flex: 1 }}
            >
              {s === "going" ? "行く" : s === "maybe" ? "未定" : "行かない"}
            </button>
          ))}
        </div>

        {justSubmitted.value && (
          <p data-testid="rsvp-confirmation" style={{ marginTop: 12, color: "var(--green)" }}>
            送信しました — このブラウザから回答を変更できます。
          </p>
        )}
        {error.value && (
          <p data-testid="rsvp-error" style={{ color: "crimson", marginTop: 12 }}>
            {error.value}
          </p>
        )}
      </section>

      <footer style={{ marginTop: 24 }} class="muted">
        <small><a href="/privacy">プライバシー</a> · クラブ内輪共有のみ。SNSへの転載はご遠慮ください。</small>
      </footer>
    </main>
  );
}
