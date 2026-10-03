import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { Gender } from "@/engine/models";
import {
  DEFAULT_SHUFFLE_CONFIG,
  normalizeShuffleConfig,
  type RuleStrength,
  type ShuffleConfig,
} from "@/engine/shuffle-config";
import { navigate, linkTo } from "@/ui/router";
import { t } from "@/ui/i18n";
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

const DEFAULT_LOCATION = "Hendon";

const date = signal(today());
const location = signal(DEFAULT_LOCATION);
const courtCount = signal(3);
const allowSingles = signal(true);
const selected = signal<Set<number>>(new Set());
const venues = signal<string[]>([]);
const submitting = signal(false);
const error = signal<string | null>(null);
/** Tracks the ?from=<plannedSessionId> query param. Set when preloading from a planned session. */
const plannedSessionId = signal<string | null>(null);

/** Shuffle rules — remembered across sessions on this device. */
const RULES_STORAGE_KEY = "cs_shuffle_rules";

function loadStoredRules(): ShuffleConfig {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return normalizeShuffleConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SHUFFLE_CONFIG };
  }
}

function storeRules(c: ShuffleConfig): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* private mode etc. — non-fatal */
  }
}

const rules = signal<ShuffleConfig>(loadStoredRules());

/** Reset all form state to defaults. Called by tests in beforeEach. */
export function resetFormState(): void {
  date.value = today();
  location.value = DEFAULT_LOCATION;
  courtCount.value = 3;
  allowSingles.value = true;
  selected.value = new Set();
  venues.value = [];
  submitting.value = false;
  error.value = null;
  plannedSessionId.value = null;
  rules.value = loadStoredRules();
  avoidPickA.value = null;
  avoidPickB.value = null;
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
      shuffleConfig: rules.value,
      memberGenders: new Map<number, Gender>(rosterStore.active.value.map((m) => [m.id, m.gender])),
      ...(plannedSessionId.value ? { plannedSessionId: plannedSessionId.value } : {}),
    });
    storeRules(rules.value);
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

/** Two-member picker for the "keep off the same court" rule. */
const avoidPickA = signal<number | null>(null);
const avoidPickB = signal<number | null>(null);

function memberName(id: number): string {
  return rosterStore.all.value.find((m) => m.id === id)?.name ?? `#${id}`;
}

function addAvoidPair(): void {
  const a = avoidPickA.value;
  const b = avoidPickB.value;
  if (a === null || b === null || a === b) return;
  const pair: [number, number] = a < b ? [a, b] : [b, a];
  if (rules.value.avoidPairs.some(([x, y]) => x === pair[0] && y === pair[1])) return;
  rules.value = { ...rules.value, avoidPairs: [...rules.value.avoidPairs, pair] };
  storeRules(rules.value);
  avoidPickA.value = null;
  avoidPickB.value = null;
}

function removeAvoidPair(i: number): void {
  rules.value = { ...rules.value, avoidPairs: rules.value.avoidPairs.filter((_, j) => j !== i) };
  storeRules(rules.value);
}

function MemberSelect({ value, testId, onChange }: {
  value: number | null;
  testId: string;
  onChange: (id: number | null) => void;
}) {
  return (
    <select
      data-testid={testId}
      value={value === null ? "" : String(value)}
      onChange={(e) => {
        const v = (e.currentTarget as HTMLSelectElement).value;
        onChange(v === "" ? null : Number(v));
      }}
      style={{ padding: 6, fontSize: 14, borderRadius: 8, border: "2px solid var(--line)" }}
    >
      <option value="">—</option>
      {rosterStore.active.value.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
    </select>
  );
}

function StrengthPicker({ value, disabled, onChange }: {
  value: RuleStrength;
  disabled?: boolean;
  onChange: (s: RuleStrength) => void;
}) {
  const opts: { key: RuleStrength; label: string }[] = [
    { key: "weak", label: t.newSession.strengthWeak },
    { key: "mid", label: t.newSession.strengthMid },
    { key: "strong", label: t.newSession.strengthStrong },
  ];
  return (
    <span style={{ display: "inline-flex", gap: 4, opacity: disabled ? 0.4 : 1 }}>
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.key)}
          style={{
            padding: "4px 10px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            cursor: disabled ? "default" : "pointer",
            border: `2px solid ${value === o.key ? "var(--ink)" : "var(--line)"}`,
            background: value === o.key ? "var(--ink)" : "var(--card)",
            color: value === o.key ? "#fff" : "var(--ink)",
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function NewSessionPage() {
  useEffect(() => {
    void loadAux();
  }, []);

  const canSubmit = selected.value.size >= 2 && location.value.trim().length > 0 && !submitting.value;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t.newSession.title}</h2>

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
          {t.newSession.loadedFromPlan}
        </div>
      )}

      <section class="card" style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{t.newSession.date}</div>
          <input
            type="date"
            value={date.value}
            onInput={(e) => { date.value = (e.currentTarget as HTMLInputElement).value; }}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)", width: "100%" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{t.newSession.venue}</div>
          <input
            type="text"
            list="venues-list"
            value={location.value}
            placeholder={t.newSession.venuePlaceholder}
            onInput={(e) => { location.value = (e.currentTarget as HTMLInputElement).value; }}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: "2px solid var(--line)", width: "100%" }}
          />
          <datalist id="venues-list">
            {venues.value.map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{t.newSession.courtCount}</div>
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
          {" "}{t.newSession.allowSingles}
        </label>
      </section>

      <section class="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.newSession.rulesTitle}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 14 }}>1. {t.newSession.ruleRest} <span class="muted">🔒</span></div>
          <div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>2. 🚫 {t.newSession.ruleAvoid}</div>
            {rules.value.avoidPairs.length === 0 ? (
              <p class="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>{t.newSession.ruleAvoidNone}</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {rules.value.avoidPairs.map(([a, b], i) => (
                  <span
                    key={`${a}:${b}`}
                    data-testid={`avoid-pair-${a}-${b}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 10px", fontSize: 13, fontWeight: 700, borderRadius: 999, border: "2px solid var(--line)" }}
                  >
                    {memberName(a)} × {memberName(b)}
                    <button
                      type="button"
                      aria-label={t.newSession.ruleAvoidRemove(memberName(a), memberName(b))}
                      onClick={() => removeAvoidPair(i)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <MemberSelect value={avoidPickA.value} testId="avoid-pick-a" onChange={(id) => { avoidPickA.value = id; }} />
              <span>×</span>
              <MemberSelect value={avoidPickB.value} testId="avoid-pick-b" onChange={(id) => { avoidPickB.value = id; }} />
              <button
                type="button"
                data-testid="avoid-add"
                disabled={avoidPickA.value === null || avoidPickB.value === null || avoidPickA.value === avoidPickB.value}
                onClick={addAvoidPair}
                style={{ padding: "4px 12px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "2px solid var(--line)", background: "var(--card)", cursor: "pointer" }}
              >
                {t.newSession.ruleAvoidAdd}
              </button>
            </div>
            <p class="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>{t.newSession.ruleAvoidHint}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                data-testid="rule-gender"
                checked={rules.value.genderBalance}
                onInput={(e) => { rules.value = { ...rules.value, genderBalance: (e.currentTarget as HTMLInputElement).checked }; }}
              />
              {" "}3. ⚥ {t.newSession.ruleGender}
            </label>
            <StrengthPicker
              value={rules.value.genderStrength}
              disabled={!rules.value.genderBalance}
              onChange={(s) => { rules.value = { ...rules.value, genderStrength: s }; }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>4. {t.newSession.rulePair}</span>
            <StrengthPicker value={rules.value.pairStrength} onChange={(s) => { rules.value = { ...rules.value, pairStrength: s }; }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>5. {t.newSession.ruleOpp}</span>
            <StrengthPicker value={rules.value.oppStrength} onChange={(s) => { rules.value = { ...rules.value, oppStrength: s }; }} />
          </div>
          {rules.value.genderBalance && (
            <p class="muted" style={{ margin: 0, fontSize: 12 }}>{t.newSession.ruleGenderHint}</p>
          )}
        </div>
      </section>

      <section class="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t.newSession.chooseAttendees}</h3>
        {rosterStore.active.value.length === 0 ? (
          <p class="muted">{t.newSession.noActiveMembers}<a href={linkTo("/roster")}>{t.newSession.addToRoster}</a></p>
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
        <p class="muted" style={{ margin: "12px 0 0" }}>{t.newSession.selectedCount(selected.value.size)}</p>
      </section>

      {error.value && <p style={{ color: "crimson" }}>{error.value}</p>}

      <button
        type="button"
        class="btn-primary"
        style={{ width: "100%" }}
        disabled={!canSubmit}
        onClick={() => { void submit(); }}
      >
        {t.newSession.nextDrawNumbers} <span class="a">→</span>
      </button>
    </main>
  );
}
