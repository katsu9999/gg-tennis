import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AttendeeRef, Gender, Member } from "@/engine/models";
import { findOnCourt } from "@/engine/substitute";
import { attendeeAnchorIndex } from "@/state/session-store";
import { navigate } from "@/ui/router";
import { t } from "@/ui/i18n";
import { appDialog } from "@/ui/components/app-dialog";
import { offerRemainingRoundsNotify } from "@/ui/line-notify";
import { rosterStore, sessionStore } from "@/ui/stores";

/** Members currently on court (not marked left). Module-scoped so the page can
 *  be re-entered without refetching; seeded from the session on mount. */
const selected = signal<Set<number>>(new Set());
const ready = signal(false);
const submitting = signal(false);
const error = signal<string | null>(null);
/** 今のラウンドの途中で帰る人 → 代わりに入る人（null = 代わりなし）。
 *  選んでいない人は既定値（勝敗未記録のコートなら一番手の候補）を使う。 */
const subChoice = signal<Map<number, number | null>>(new Map());

/** Test helper — resets module-scoped UI state. */
export function resetEditAttendeesState(): void {
  selected.value = new Set();
  ready.value = false;
  submitting.value = false;
  error.value = null;
  subChoice.value = new Map();
}

function memberIdOf(ref: { kind: string; memberId?: number }): number | null {
  return ref.kind === "member" ? (ref.memberId ?? null) : null;
}

function toggle(id: number): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

export function EditAttendeesPage() {
  useEffect(() => {
    void (async () => {
      if (rosterStore.all.value.length === 0) await rosterStore.load();
      if (!sessionStore.session.value) await sessionStore.resume();
      const s = sessionStore.session.value;
      if (s) {
        const ids = s.attendees
          .filter((a) => !a.left)
          .map((a) => memberIdOf(a.ref))
          .filter((id): id is number => id !== null);
        selected.value = new Set(ids);
      }
      subChoice.value = new Map();
      ready.value = true;
    })();
  }, []);

  const s = sessionStore.session.value;

  if (!s) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
        <h2>{t.common.noSessionTitle}</h2>
      </main>
    );
  }

  // Members already in the session but archived from the roster since the
  // session started would otherwise vanish from the grid — and a member who
  // isn't shown can't be kept selected, so they'd be silently sent home.
  const inSession = new Set(
    s.attendees.map((a) => memberIdOf(a.ref)).filter((id): id is number => id !== null),
  );
  const active = rosterStore.active.value;
  const activeIds = new Set(active.map((m) => m.id));
  const extras: Member[] = rosterStore.all.value.filter(
    (m) => inSession.has(m.id) && !activeIds.has(m.id),
  );
  const choices = [...active, ...extras];

  // 実施済みのラウンド数 = 表示中のラウンドか、勝敗を付けた最後のラウンドの遅い方まで
  // （「前」で戻って見ていても、やった試合は変えない）。ここから先を組み直す。
  const anchorIndex = attendeeAnchorIndex(s);
  const currentRoundNo = anchorIndex + 1;
  const willRegenerate = s.rounds.length > currentRoundNo;

  const currentActive = new Set(
    s.attendees
      .filter((a) => !a.left)
      .map((a) => memberIdOf(a.ref))
      .filter((id): id is number => id !== null),
  );
  const changed =
    selected.value.size !== currentActive.size ||
    [...selected.value].some((id) => !currentActive.has(id));

  const canSubmit = ready.value && changed && selected.value.size >= 2 && !submitting.value;

  // 今のラウンドのコートにいるのに外された人 = ラウンドの途中で帰る人。
  const currentRound = s.rounds[anchorIndex];
  const memberRef = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
  const leaversOnCourt = currentRound
    ? [...currentActive].filter((id) => !selected.value.has(id) && findOnCourt(currentRound, memberRef(id)))
    : [];
  const staying = [...selected.value];
  const subOptions = new Map<number, number[]>();
  for (const id of leaversOnCourt) {
    subOptions.set(
      id,
      sessionStore.suggestSubstitutes(id, staying)
        .map((r) => memberIdOf(r))
        .filter((x): x is number => x !== null),
    );
  }
  /** その人の代役。手で選んだものを先に確保し、選んでいない人には残りから
   *  既定値（勝敗未記録のコートなら一番手の候補）を当てる。同じ人を2人の代役には
   *  しない（手で選んだ同士が重なったら、先に並んでいる帰る人を優先）。 */
  function chosenSubs(): Map<number, number> {
    const out = new Map<number, number>();
    const used = new Set<number>();
    for (const id of leaversOnCourt) {
      const pick = subChoice.value.get(id);
      if (pick === undefined || pick === null) continue;
      if (!used.has(pick) && (subOptions.get(id) ?? []).includes(pick)) {
        out.set(id, pick);
        used.add(pick);
      }
    }
    for (const id of leaversOnCourt) {
      if (subChoice.value.has(id)) continue;
      const pos = findOnCourt(currentRound!, memberRef(id));
      const court = currentRound!.courts.find((c) => c.number === pos?.courtNumber);
      if (!court || court.winner !== "none") continue;
      const first = (subOptions.get(id) ?? []).find((x) => !used.has(x));
      if (first !== undefined) {
        out.set(id, first);
        used.add(first);
      }
    }
    return out;
  }
  const subs = chosenSubs();
  const nameOf = (id: number): string => {
    const name = rosterStore.all.value.find((m) => m.id === id)?.name ?? `#${id}`;
    const n = s.attendees.find((a) => memberIdOf(a.ref) === id)?.todayNumber;
    return n === undefined ? name : `${n} ${name}`;
  };

  async function apply(): Promise<void> {
    const session = sessionStore.session.value;
    if (!session) return;
    const confirmMsg = subs.size > 0
      ? t.editAttendees.applyConfirm(currentRoundNo)
      : willRegenerate
        ? t.editAttendees.applyConfirm(currentRoundNo + 1)
        : t.editAttendees.applyConfirmNoRegen;
    if (!(await appDialog.confirm(confirmMsg))) return;

    submitting.value = true;
    error.value = null;
    try {
      const res = await sessionStore.changeAttendees({
        memberIds: [...selected.value],
        memberGenders: new Map<number, Gender>(
          rosterStore.all.value.map((m) => [m.id, m.gender]),
        ),
        currentSubstitutes: subs,
      });
      if (res.regeneratedFrom !== null) {
        await offerRemainingRoundsNotify(res.regeneratedFrom);
      }
      navigate("/session/round");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error.value = msg;
      void appDialog.alert(t.editAttendees.applyFailed(msg));
    } finally {
      submitting.value = false;
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t.editAttendees.title}</h2>

      <p class="muted" data-testid="edit-attendees-hint" style={{ marginTop: 0 }}>
        {willRegenerate ? t.editAttendees.hint(currentRoundNo) : t.editAttendees.hintNoRegen}
      </p>

      <section class="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
          }}
        >
          {choices.map((m) => {
            const isSelected = selected.value.has(m.id);
            const isNew = !inSession.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                data-testid={`edit-member-${m.id}`}
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
                {isNew && isSelected && (
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
                    {" "}({t.editAttendees.joined})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p class="muted" style={{ margin: "12px 0 0" }}>
          {t.editAttendees.selectedCount(selected.value.size)}
        </p>
      </section>

      {leaversOnCourt.length > 0 && (
        <section class="card" data-testid="subs-card" style={{ marginBottom: 12 }}>
          <strong>{t.editAttendees.subsTitle(currentRoundNo)}</strong>
          <p class="muted" style={{ margin: "4px 0 8px", fontSize: 13 }}>{t.editAttendees.subsHint}</p>
          {leaversOnCourt.map((id) => (
            <label key={id} style={{ display: "block", marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
              {t.editAttendees.subsLabel(nameOf(id))}
              <select
                data-testid={`sub-select-${id}`}
                value={String(subs.get(id) ?? "")}
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  const next = new Map(subChoice.value);
                  next.set(id, v === "" ? null : Number(v));
                  subChoice.value = next;
                }}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, fontSize: 15 }}
              >
                <option value="">{t.editAttendees.subsNone}</option>
                {(subOptions.get(id) ?? [])
                  // 他の帰る人の代役に「手で」選ばれた人は選べない（既定値は譲れるので出す）
                  .filter((cand) => ![...subChoice.value].some(([other, v]) =>
                    other !== id && v === cand && leaversOnCourt.includes(other)))
                  .map((cand) => (
                    <option key={cand} value={String(cand)}>{nameOf(cand)}</option>
                  ))}
              </select>
            </label>
          ))}
        </section>
      )}

      {error.value && <p style={{ color: "crimson" }}>{error.value}</p>}

      <button
        type="button"
        class="btn-primary"
        style={{ width: "100%" }}
        data-testid="apply-attendees-btn"
        disabled={!canSubmit}
        onClick={() => { void apply(); }}
      >
        {t.editAttendees.apply}
      </button>

      <button
        type="button"
        data-testid="cancel-attendees-btn"
        onClick={() => navigate("/session/round")}
        style={{
          display: "block",
          width: "100%",
          marginTop: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "1.5px solid var(--line)",
          borderRadius: 8,
          color: "var(--muted)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {t.editAttendees.back}
      </button>
    </main>
  );
}
