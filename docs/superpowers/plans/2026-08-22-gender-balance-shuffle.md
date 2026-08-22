# Gender-Balance Shuffle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対戦カード単位の男女バランスペナルティ＋性別マスター＋セッション開始画面のシャッフルルール一覧（ON/OFF・弱中強）を追加する。

**Architecture:** 既存の貪欲スコアリング（round-builder の K_ATTEMPTS 探索）に「対戦する2チームの男子数の差」ペナルティを足す。設定は `ShuffleConfig` として新規セッション画面で選択 → sessions.shuffle_config (jsonb) にスナップショット。性別はメンバーマスターに持ち、セッション開始時に attendees へスナップショットする（resume 後もリポジトリ不要）。

**Tech Stack:** Preact + @preact/signals, Vite, Vitest, Supabase (Postgres RPC), idb-keyval (local flavour)

**Spec:** `docs/superpowers/specs/2026-08-22-gender-balance-shuffle.md`

## Global Constraints

- 休みローテーション（selectResters）と決定的シード（`mulberry32(rngSeed + rounds.length)`）は一切変更しない
- 未設定 gender（`"unknown"`）またはゲストが1人でもいるコートは男女ペナルティ 0
- 強さは `"weak" | "mid" | "strong"` の3値のみ。UI に生の数値を出さない
- 旧データ互換: gender の無い members 行 → `"unknown"`、shuffle_config の無い sessions 行 → `DEFAULT_SHUFFLE_CONFIG`
- ローカルフレーバーでも同一機能（i18n は ja/en 両方に追加。`en: Strings` 型で欠落はコンパイルエラー）
- テスト実行は `npx vitest run <file>`。既知の環境依存失敗14件（host-store/public-rsvp の localStorage）はベースラインとして無視
- ブランチ: `feat/gender-balance-shuffle`（**origin/main から切る** — ローカル main には未pushのLINE関数コミットが載っているため）
- コミットは変更ファイルを個別に `git add <file>`（`-A` 禁止）

## デプロイ手順（PR マージ前に必須）

1. `supabase/migrations/0011_v1_6_gender.sql` を Supabase SQL Editor で手動適用（additive なので稼働中アプリは壊れない）
2. その後 PR を squash マージ → GitHub Pages デプロイ
3. **順序厳守**: マージが先だと `shuffle_config` カラム不在で新規セッション開始が失敗する

## PR #21 / #22 との関係

`fix/cancel-empty-round` (#21) と `fix/n11-opponent-variety` (#22) が OPEN。#22 は `rester-selector.ts` / `session-store.ts` を触る。本計画は rester-selector を触らないが session-store は触る → **先にマージされた方に対して他方を rebase**。本計画のブランチが先にマージされる場合は #21/#22 側を更新する（Katsu に報告）。

---

### Task 1: 型基盤 — Gender / ShuffleConfig

**Files:**
- Modify: `src/engine/models.ts`
- Create: `src/engine/shuffle-config.ts`
- Test: `tests/engine/shuffle-config.test.ts`
- Modify(コンパイル追随): `src/data/member-repository.ts` `src/data/local/member-repository.ts`

**Interfaces:**
- Consumes: なし
- Produces: `type Gender = "male" | "female" | "unknown"`（models.ts）; `Member.gender: Gender`; `type RuleStrength`, `interface ShuffleConfig { genderBalance: boolean; genderStrength: RuleStrength; pairStrength: RuleStrength; oppStrength: RuleStrength }`, `DEFAULT_SHUFFLE_CONFIG`, `GENDER_GAP2 / GENDER_GAP1 / STRENGTH_MULT: Record<RuleStrength, number>`, `normalizeShuffleConfig(v: unknown): ShuffleConfig`

- [ ] **Step 1: ブランチ作成**

```bash
cd ~/katsu-config/gg-tennis
git fetch origin
git checkout -b feat/gender-balance-shuffle origin/main
```

- [ ] **Step 2: 失敗するテストを書く** — `tests/engine/shuffle-config.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHUFFLE_CONFIG,
  GENDER_GAP1,
  GENDER_GAP2,
  STRENGTH_MULT,
  normalizeShuffleConfig,
} from "@/engine/shuffle-config";

describe("normalizeShuffleConfig", () => {
  it("returns defaults for null/undefined/garbage", () => {
    expect(normalizeShuffleConfig(null)).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig(undefined)).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig("junk")).toEqual(DEFAULT_SHUFFLE_CONFIG);
    expect(normalizeShuffleConfig({ genderStrength: "MAX" })).toEqual(DEFAULT_SHUFFLE_CONFIG);
  });

  it("keeps a valid config verbatim", () => {
    const c = { genderBalance: true, genderStrength: "strong", pairStrength: "weak", oppStrength: "mid" };
    expect(normalizeShuffleConfig(c)).toEqual(c);
  });

  it("does not share the DEFAULT object (mutation safety)", () => {
    const a = normalizeShuffleConfig(null);
    a.genderBalance = true;
    expect(DEFAULT_SHUFFLE_CONFIG.genderBalance).toBe(false);
  });
});

describe("strength tables", () => {
  it("gap2 dominates gap1 at every strength", () => {
    for (const s of ["weak", "mid", "strong"] as const) {
      expect(GENDER_GAP2[s]).toBeGreaterThan(GENDER_GAP1[s]);
    }
  });
  it("mult is monotonic", () => {
    expect(STRENGTH_MULT.weak).toBeLessThan(STRENGTH_MULT.mid);
    expect(STRENGTH_MULT.mid).toBeLessThan(STRENGTH_MULT.strong);
  });
});
```

- [ ] **Step 3: 失敗確認**

Run: `npx vitest run tests/engine/shuffle-config.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 4: 実装**

`src/engine/models.ts` — `Member` の直前に追加し、`Member` を変更:

```ts
export type Gender = "male" | "female" | "unknown";

export interface Member {
  id: MemberId;
  name: string;
  status: "active" | "archived";
  gender: Gender;
  createdAt: Date;
}
```

`Attendee` にも追加（セッション開始時のスナップショット先。旧セッション行との互換のため optional）:

```ts
export interface Attendee {
  ref: AttendeeRef;
  todayNumber: number;
  isGuest: boolean;
  guestName?: string;
  gender?: Gender;
}
```

`src/engine/shuffle-config.ts` 新規作成:

```ts
import type { Gender } from "./models";

export type RuleStrength = "weak" | "mid" | "strong";

/** Snapshot of the shuffle rules chosen on the new-session screen.
 *  Persisted to sessions.shuffle_config (jsonb) so resume() and past rows
 *  keep the exact rules the night ran with. */
export interface ShuffleConfig {
  genderBalance: boolean;
  genderStrength: RuleStrength;
  pairStrength: RuleStrength;
  oppStrength: RuleStrength;
}

export const DEFAULT_SHUFFLE_CONFIG: ShuffleConfig = {
  genderBalance: false,
  genderStrength: "mid",
  pairStrength: "mid",
  oppStrength: "mid",
};

// Gender-gap penalty per matchup: gap = |males(teamA) - males(teamB)|.
// gap 2 (女女 vs 男男) must effectively never happen when avoidable, so it has
// to dominate every same-session variety weight a swap could save
// (SAME_SESSION=30/pair). gap 1 (女女 vs 男女) is a soft nudge below a single
// partner repeat. Numbers finalised by the 500-trial simulation (Task 7).
export const GENDER_GAP2: Record<RuleStrength, number> = { weak: 60, mid: 250, strong: 1000 };
export const GENDER_GAP1: Record<RuleStrength, number> = { weak: 10, mid: 40, strong: 160 };

// Multiplier applied to the same-session pair / opponent weights (axes ③④).
export const STRENGTH_MULT: Record<RuleStrength, number> = { weak: 0.5, mid: 1, strong: 2 };

const STRENGTHS: readonly RuleStrength[] = ["weak", "mid", "strong"];

function asStrength(v: unknown, fallback: RuleStrength): RuleStrength {
  return STRENGTHS.includes(v as RuleStrength) ? (v as RuleStrength) : fallback;
}

/** Coerce persisted JSON (old session rows, localStorage) into a valid config. */
export function normalizeShuffleConfig(v: unknown): ShuffleConfig {
  if (typeof v !== "object" || v === null) return { ...DEFAULT_SHUFFLE_CONFIG };
  const o = v as Record<string, unknown>;
  return {
    genderBalance: o.genderBalance === true,
    genderStrength: asStrength(o.genderStrength, DEFAULT_SHUFFLE_CONFIG.genderStrength),
    pairStrength: asStrength(o.pairStrength, DEFAULT_SHUFFLE_CONFIG.pairStrength),
    oppStrength: asStrength(o.oppStrength, DEFAULT_SHUFFLE_CONFIG.oppStrength),
  };
}

/** Genders visible to the round builder are keyed by JSON.stringify(ref). */
export type GenderMap = ReadonlyMap<string, Gender>;
```

`Member.gender` 追加でコンパイルが壊れる2ファイルを追随（**この Task では型を通すだけ**。RPC/保存対応は Task 4）:

`src/data/member-repository.ts` — `MemberRow` に `gender?: string;` を足し、`toMember` を:

```ts
function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Member["status"],
    gender: (row.gender === "male" || row.gender === "female" ? row.gender : "unknown"),
    createdAt: new Date(row.created_at),
  };
}
```

`src/data/local/member-repository.ts` — `MemberRow` に `gender?: "male" | "female" | "unknown";` を足し、`toMember` に `gender: row.gender ?? "unknown",`、`add` の生成行に `gender: "unknown" as const,` を追加。

- [ ] **Step 5: テスト＋型チェック**

Run: `npx vitest run tests/engine/shuffle-config.test.ts && npx tsc --noEmit`
Expected: PASS / エラー0（`Member` を組み立てているテストフィクスチャが落ちる場合は `gender: "unknown"` を足して直す）

- [ ] **Step 6: Commit**

```bash
git add src/engine/models.ts src/engine/shuffle-config.ts tests/engine/shuffle-config.test.ts src/data/member-repository.ts src/data/local/member-repository.ts
git commit -m "feat(engine): Gender/ShuffleConfig types + normalize"
```

---

### Task 2: round-builder — 男女ギャップペナルティ＋強さ倍率

**Files:**
- Modify: `src/engine/round-builder.ts`
- Test: `tests/engine/round-builder.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `ShuffleConfig` `GenderMap` `GENDER_GAP1/2` `STRENGTH_MULT` `DEFAULT_SHUFFLE_CONFIG`
- Produces: `export interface BuildOptions { genderOf?: GenderMap; config?: ShuffleConfig }`; `buildRound(..., opts?: BuildOptions)`（第9引数・省略可）; `scoreCourts(courts, hist, ss, opts?: BuildOptions)`（第4引数・省略可 — 既存3引数呼び出しは無変更で通る）

- [ ] **Step 1: 失敗するテストを書く** — `tests/engine/round-builder.test.ts` に追記

```ts
import type { Gender } from "@/engine/models";
import { DEFAULT_SHUFFLE_CONFIG } from "@/engine/shuffle-config";
// 既存の import { buildRound, scoreCourts } / emptyHist / mulberry32 等のヘルパーをそのまま使う

const refOf = (id: number) => ({ kind: "member" as const, memberId: id });
const keyOf = (id: number) => JSON.stringify(refOf(id));

function genderMapOf(males: number[], females: number[]): Map<string, Gender> {
  const m = new Map<string, Gender>();
  for (const id of males) m.set(keyOf(id), "male");
  for (const id of females) m.set(keyOf(id), "female");
  return m;
}

describe("gender balance", () => {
  const cfg = { ...DEFAULT_SHUFFLE_CONFIG, genderBalance: true };

  it("never produces 女女 vs 男男 when a gap-free arrangement exists (4F4M, 1 court)", () => {
    // 4 players on one doubles court: any F-F vs M-M split is avoidable
    // (mixed vs mixed always exists), so gap-2 must not appear.
    const genderOf = genderMapOf([1, 2], [3, 4]);
    for (let seed = 0; seed < 50; seed++) {
      const { courts } = buildRound(
        [refOf(1), refOf(2), refOf(3), refOf(4)],
        1, 0,
        emptyHist(), { partner: new Map(), opp: new Map() },
        mulberry32(seed), new Map(), new Set(),
        { genderOf, config: cfg },
      );
      const males = (t: { kind: "member"; memberId: number }[]) =>
        t.filter(r => genderOf.get(JSON.stringify(r)) === "male").length;
      const gap = Math.abs(males(courts[0]!.teamA as never) - males(courts[0]!.teamB as never));
      expect(gap).toBeLessThan(2);
    }
  });

  it("scoreCourts adds gap-2 penalty for 女女 vs 男男 and 0 for even courts", () => {
    const hist = emptyHist();
    const ss = { partner: new Map(), opp: new Map() };
    const genderOf = genderMapOf([1, 2], [3, 4]);
    const gap2Court = [{ number: 1, type: "doubles" as const, teamA: [refOf(3), refOf(4)], teamB: [refOf(1), refOf(2)], winner: "none" as const }];
    const evenCourt = [{ number: 1, type: "doubles" as const, teamA: [refOf(1), refOf(3)], teamB: [refOf(2), refOf(4)], winner: "none" as const }];
    expect(scoreCourts(gap2Court, hist, ss, { genderOf, config: cfg })).toBeGreaterThan(0);
    expect(scoreCourts(evenCourt, hist, ss, { genderOf, config: cfg })).toBe(0);
    // OFF → no penalty even for gap-2
    expect(scoreCourts(gap2Court, hist, ss, { genderOf, config: DEFAULT_SHUFFLE_CONFIG })).toBe(0);
  });

  it("skips courts containing an unknown-gender player", () => {
    const hist = emptyHist();
    const ss = { partner: new Map(), opp: new Map() };
    const genderOf = genderMapOf([1, 2], [3]); // player 4 unknown
    const court = [{ number: 1, type: "doubles" as const, teamA: [refOf(3), refOf(4)], teamB: [refOf(1), refOf(2)], winner: "none" as const }];
    expect(scoreCourts(court, hist, ss, { genderOf, config: cfg })).toBe(0);
  });
});
```

（既存テストのヘルパー名が違う場合はファイル冒頭の実物に合わせる。`emptyHist` が無ければ `{ partnerW: new Map(), opponentW: new Map() }` を直書き。）

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/engine/round-builder.test.ts`
Expected: 新規3件が FAIL（`opts` 引数が存在しない / TypeScript エラー）

- [ ] **Step 3: 実装** — `src/engine/round-builder.ts`

冒頭に追加:

```ts
import type { Gender } from "./models";
import {
  DEFAULT_SHUFFLE_CONFIG,
  GENDER_GAP1,
  GENDER_GAP2,
  STRENGTH_MULT,
  type GenderMap,
  type ShuffleConfig,
} from "./shuffle-config";

export interface BuildOptions {
  /** JSON.stringify(ref) → gender. Missing entries count as "unknown". */
  genderOf?: GenderMap;
  config?: ShuffleConfig;
}

/** Same-session weight multipliers derived from the config (axes ③④). */
interface Mult { pair: number; opp: number }
const UNIT_MULT: Mult = { pair: 1, opp: 1 };

function multOf(config: ShuffleConfig | undefined): Mult {
  if (!config) return UNIT_MULT;
  return { pair: STRENGTH_MULT[config.pairStrength], opp: STRENGTH_MULT[config.oppStrength] };
}

/** Matchup-level gender penalty: |males(A) − males(B)|. gap 2 = 女女 vs 男男
 *  (effectively forbidden), gap 1 = 女女 vs 男女 (soft). A court with any
 *  unknown-gender player (incl. guests) is exempt — we can't judge it. */
function genderGapPenalty(
  a: readonly AttendeeRef[],
  b: readonly AttendeeRef[],
  opts: BuildOptions,
): number {
  const config = opts.config ?? DEFAULT_SHUFFLE_CONFIG;
  if (!config.genderBalance || !opts.genderOf) return 0;
  let malesA = 0;
  let malesB = 0;
  for (const r of a) {
    const g: Gender = opts.genderOf.get(refKeyOf(r)) ?? "unknown";
    if (g === "unknown") return 0;
    if (g === "male") malesA++;
  }
  for (const r of b) {
    const g: Gender = opts.genderOf.get(refKeyOf(r)) ?? "unknown";
    if (g === "unknown") return 0;
    if (g === "male") malesB++;
  }
  const gap = Math.abs(malesA - malesB);
  if (gap >= 2) return GENDER_GAP2[config.genderStrength];
  if (gap === 1) return GENDER_GAP1[config.genderStrength];
  return 0;
}
```

`teamPairScore` / `oppScore` に倍率引数を追加（既定 `UNIT_MULT`）:

```ts
function teamPairScore(team: readonly AttendeeRef[], hist: PairHistory, ss: SameSessionStats, mult: Mult = UNIT_MULT): number {
  // 中身は既存のまま、s += の2行だけ:
  //   s += mult.pair * W_PARTNER * (hist.partnerW.get(key) ?? 0);
  //   s += mult.pair * SAME_SESSION * (ss.partner.get(key) ?? 0);
}

function oppScore(a, b, hist, ss, mult: Mult = UNIT_MULT): number {
  //   s += mult.opp * W_OPP * (hist.opponentW.get(key) ?? 0);
  //   s += mult.opp * SAME_SESSION_OPP * (ss.opp.get(key) ?? 0);
}
```

`scoreCourts` — 第4引数追加・男女ペナルティ加算:

```ts
export function scoreCourts(courts: readonly Court[], hist: PairHistory, ss: SameSessionStats, opts: BuildOptions = {}): number {
  const mult = multOf(opts.config);
  let s = 0;
  for (const c of courts) {
    s += teamPairScore(c.teamA, hist, ss, mult);
    s += teamPairScore(c.teamB, hist, ss, mult);
    s += oppScore(c.teamA, c.teamB, hist, ss, mult);
    s += genderGapPenalty(c.teamA, c.teamB, opts);
  }
  return s;
}
```

`bestSplitOf4` — 4人の割り方にも男女を効かせる（ここを忘れると「同じ4人」の中で女女vs男男が残る）:

```ts
function bestSplitOf4(four: readonly AttendeeRef[], hist: PairHistory, ss: SameSessionStats, opts: BuildOptions): [AttendeeRef[], AttendeeRef[]] {
  const mult = multOf(opts.config);
  // candidates は既存のまま。スコア行を:
  //   const s = teamPairScore(A, hist, ss, mult) + teamPairScore(B, hist, ss, mult)
  //     + oppScore(A, B, hist, ss, mult) + genderGapPenalty(A, B, opts);
}
```

`buildRound` — 第9引数 `opts: BuildOptions = {}` を追加し、`bestSplitOf4(four, hist, ss, opts)`、最終スコアを `scoreCourts(courts, hist, ss, opts) + singlesPenalty` に変更。シングルスコート（1人vs1人）も `scoreCourts` 経由で自動的に gap 1 判定される（男vs女シングルス → 小ペナルティ）。

- [ ] **Step 4: テスト＋既存回帰**

Run: `npx vitest run tests/engine/ && npx tsc --noEmit`
Expected: 全 PASS（既存の3引数 `scoreCourts` / 8引数 `buildRound` 呼び出しは無変更で通ること）

- [ ] **Step 5: Commit**

```bash
git add src/engine/round-builder.ts tests/engine/round-builder.test.ts
git commit -m "feat(engine): matchup-level gender-gap penalty + strength multipliers"
```

---

### Task 3: session-store — 設定と性別のスナップショット・永続化・resume

**Files:**
- Modify: `src/state/session-store.ts`
- Modify: `src/data/session-repository.ts`（`SessionRow` に `shuffle_config?: unknown;` を追加するだけ）
- Test: `tests/state/session-store.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1-2（`ShuffleConfig` `DEFAULT_SHUFFLE_CONFIG` `normalizeShuffleConfig` `Gender`、`buildRound(..., opts)`）
- Produces: `InMemorySession.shuffleConfig: ShuffleConfig`; `InMemorySession.attendees[].gender?: Gender`; `StartNewSessionInput.shuffleConfig?: ShuffleConfig`; `StartNewSessionInput.memberGenders?: ReadonlyMap<number, Gender>`

- [ ] **Step 1: 失敗するテストを書く** — `tests/state/session-store.test.ts` に追記（既存のフェイクリポジトリ生成ヘルパーをそのまま使う）

```ts
it("snapshots shuffleConfig + genders at start and persists shuffle_config", async () => {
  const store = createStore(); // 既存ヘルパー名に合わせる
  await store.startNewSession({
    date: new Date("2026-08-22"),
    location: "Hendon",
    courtCount: 2,
    allowSingles: true,
    memberIds: [1, 2, 3, 4],
    shuffleConfig: { genderBalance: true, genderStrength: "strong", pairStrength: "mid", oppStrength: "mid" },
    memberGenders: new Map([[1, "male"], [2, "male"], [3, "female"], [4, "female"]]),
  });
  const s = store.session.value!;
  expect(s.shuffleConfig.genderBalance).toBe(true);
  expect(s.attendees.find(a => a.ref.kind === "member" && a.ref.memberId === 3)?.gender).toBe("female");
  // 保存された行にも載る（フェイク sessionRepo の最後の upsert 行を検査）
  expect(lastUpsertedRow().shuffle_config).toMatchObject({ genderBalance: true, genderStrength: "strong" });
});

it("defaults shuffleConfig for legacy rows on resume", async () => {
  // shuffle_config を持たない SessionRow を loadOngoing が返すようにして resume
  const store = createStoreWithOngoingRow(legacyRowWithoutShuffleConfig());
  await store.resume();
  expect(store.session.value!.shuffleConfig).toEqual(DEFAULT_SHUFFLE_CONFIG);
});
```

（フェイクの組み立ては同ファイル既存テストのパターンを踏襲。`lastUpsertedRow` 相当が無ければフェイク repo に記録用配列を足す。）

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run tests/state/session-store.test.ts`
Expected: FAIL（プロパティ不在の型エラー）

- [ ] **Step 3: 実装**

`src/data/session-repository.ts` — `SessionRow` に追加:

```ts
  /** v1.6: shuffle rules snapshot (jsonb). Absent on pre-v1.6 rows. */
  shuffle_config?: unknown;
```

`src/state/session-store.ts`:

1. import 追加: `import { DEFAULT_SHUFFLE_CONFIG, normalizeShuffleConfig, type ShuffleConfig } from "@/engine/shuffle-config";` と `type Gender` を models から。
2. `InMemorySession` に `shuffleConfig: ShuffleConfig;`、attendees 配列型に `gender?: Gender;` を追加。
3. `StartNewSessionInput` に `shuffleConfig?: ShuffleConfig;` `memberGenders?: ReadonlyMap<number, Gender>;` を追加。
4. `startNewSession` の attendees 構築を:

```ts
    const attendees: InMemorySession["attendees"] = input.memberIds.map((id, i) => ({
      ref: { kind: "member" as const, memberId: id },
      todayNumber: i + 1,
      isGuest: false,
      gender: input.memberGenders?.get(id) ?? "unknown",
    }));
```

   セッション生成に `shuffleConfig: input.shuffleConfig ? { ...input.shuffleConfig } : { ...DEFAULT_SHUFFLE_CONFIG },` を追加。
5. `toSessionRow` の return に `shuffle_config: s.shuffleConfig,` を追加。
6. `nextRoundInner` の buildRound 呼び出し直前に:

```ts
    const genderOf = new Map<string, Gender>();
    for (const a of s.attendees) genderOf.set(refKey(a.ref), a.gender ?? "unknown");
```

   呼び出しに第9引数 `{ genderOf, config: s.shuffleConfig }` を追加。
7. `resume` のセッション再構築に `shuffleConfig: normalizeShuffleConfig(row.shuffle_config),` を追加（attendees は行の JSONB をそのまま使うので gender も自動復元）。

- [ ] **Step 4: テスト**

Run: `npx vitest run tests/state/session-store.test.ts tests/engine/ && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/session-store.ts src/data/session-repository.ts tests/state/session-store.test.ts
git commit -m "feat(state): shuffle config + gender snapshot in session lifecycle"
```

---

### Task 4: データ層 — migration 0011・member RPC・setGender

**Files:**
- Create: `supabase/migrations/0011_v1_6_gender.sql`
- Modify: `src/data/member-repository.ts`
- Modify: `src/data/local/member-repository.ts`
- Modify: `src/state/roster-store.ts`
- Test: `tests/state/roster-store.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `Gender`
- Produces: `MemberRepository.setGender(id: number, gender: Gender, pin: string): Promise<Member>`; `RosterStore.setGender(id: number, gender: Gender, pin: string): Promise<void>`; RPC `upsert_member(p_pin, p_id, p_name, p_status, p_gender default 'unknown')`

- [ ] **Step 1: migration を書く** — `supabase/migrations/0011_v1_6_gender.sql`

```sql
-- v1.6: gender-balance shuffle
-- 1) members.gender — 男/女/未設定
alter table members add column if not exists gender text not null default 'unknown'
  check (gender in ('male', 'female', 'unknown'));

-- 2) sessions.shuffle_config — 開始時のシャッフルルールのスナップショット
alter table sessions add column if not exists shuffle_config jsonb;

-- 3) upsert_member gains p_gender. The old 4-arg signature is dropped; the new
--    one defaults p_gender so not-yet-deployed clients keep working.
drop function if exists upsert_member(text, bigint, text, text);
create or replace function upsert_member(
  p_pin text,
  p_id bigint,
  p_name text,
  p_status text,
  p_gender text default 'unknown'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not verify_club_pin(p_pin) then raise exception 'invalid_pin'; end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid_status'; end if;
  if p_gender not in ('male', 'female', 'unknown') then raise exception 'invalid_gender'; end if;
  if p_id is null then
    insert into members(name, status, gender) values (p_name, p_status, p_gender) returning id into v_id;
  else
    update members set name = p_name, status = p_status, gender = p_gender where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function upsert_member(text, bigint, text, text, text) to anon, authenticated;
```

- [ ] **Step 2: 失敗するテストを書く** — `tests/state/roster-store.test.ts` に追記

```ts
it("setGender updates the member in place", async () => {
  // 既存テストのフェイク MemberRepository パターンに setGender を足す
  const { store } = createStoreWithMembers([{ id: 1, name: "Aki", status: "active", gender: "unknown", createdAt: new Date() }]);
  await store.load();
  await store.setGender(1, "female", "1234");
  expect(store.all.value.find(m => m.id === 1)?.gender).toBe("female");
});
```

- [ ] **Step 3: 失敗確認**

Run: `npx vitest run tests/state/roster-store.test.ts`
Expected: FAIL（setGender 不在）

- [ ] **Step 4: 実装**

`src/data/member-repository.ts`:

1. `import type { Gender, Member } from "@/engine/models";`
2. interface に `setGender(id: number, gender: Gender, pin: string): Promise<Member>;` を追加。
3. RPC 呼び出しを全箇所 5引数化（gender を落とさないため）:
   - `add`: `{ p_pin: pin, p_id: null, p_name: name, p_status: "active", p_gender: "unknown" }`
   - `rename`: `{ ..., p_gender: current.gender }`
   - `archive` / `unarchive`: 同様に `p_gender: current.gender`
   - 新規 `setGender`:

```ts
    async setGender(id, gender, pin) {
      const current = await fetchMember(supabase, id);
      const { error } = await supabase.rpc("upsert_member", {
        p_pin: pin,
        p_id: id,
        p_name: current.name,
        p_status: current.status,
        p_gender: gender,
      });
      if (error) throw error;
      return fetchMember(supabase, id);
    },
```

`src/data/local/member-repository.ts` — 追加:

```ts
    async setGender(id, gender) {
      return mutateOne(id, { gender });
    },
```

（`MemberRow.gender` は Task 1 で追加済み。`mutateOne` の `patch` 型が通ることを確認。）

`src/state/roster-store.ts` — interface と実装に追加:

```ts
    async setGender(id, gender, pin) {
      const m = await repo.setGender(id, gender, pin);
      replace(id, m);
    },
```

（`import type { Gender } from "@/engine/models";` を追加。）

ほかに `MemberRepository` を実装／モックしている箇所（`src/data/local/stub-repositories.ts`、各テストのフェイク）があれば `setGender` を追加してコンパイルを通す。

- [ ] **Step 5: テスト**

Run: `npx vitest run tests/state/roster-store.test.ts tests/data/ && npx tsc --noEmit`
Expected: PASS（既知の環境依存14件を除く）

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0011_v1_6_gender.sql src/data/member-repository.ts src/data/local/member-repository.ts src/state/roster-store.ts tests/state/roster-store.test.ts
git commit -m "feat(data): members.gender + sessions.shuffle_config + upsert_member p_gender"
```

---

### Task 5: 名簿UI — 性別セレクタ + i18n

**Files:**
- Modify: `src/ui/pages/roster.tsx`
- Modify: `src/ui/i18n.ts`
- Test: `tests/ui/` は roster のUIテストが無いため対象外（store テストでカバー済み）。手動確認は Task 8。

**Interfaces:**
- Consumes: Task 4 の `rosterStore.setGender`
- Produces: なし（UIのみ）

- [ ] **Step 1: i18n 追加** — `src/ui/i18n.ts` の `ja.roster` に:

```ts
    gender: "性別",
    genderMale: "男",
    genderFemale: "女",
    genderNone: "未設定",
```

`en.roster` に:

```ts
    gender: "Gender",
    genderMale: "M",
    genderFemale: "F",
    genderNone: "—",
```

（`en: Strings` 型が欠落を検知するので、コンパイルが通れば完全。）

- [ ] **Step 2: roster.tsx 実装**

モジュールスコープに追加:

```tsx
import type { Gender } from "@/engine/models";

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
```

`MemberRow` の props に `gender: Gender` を追加し、非リネーム時の名前 `<span>` の直後（ボタン群の前）に select を置く:

```tsx
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
```

呼び出し側2箇所（active / archived の `.map`）に `gender={m.gender}` を追加。

- [ ] **Step 3: 型チェック＋全テスト**

Run: `npx tsc --noEmit && npx vitest run`
Expected: エラー0 / ベースライン維持

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/roster.tsx src/ui/i18n.ts
git commit -m "feat(roster): per-member gender selector (男/女/未設定)"
```

---

### Task 6: 新規セッション画面 — シャッフルルール一覧 + localStorage

**Files:**
- Modify: `src/ui/pages/new-session.tsx`
- Modify: `src/ui/i18n.ts`

**Interfaces:**
- Consumes: Task 1 の `ShuffleConfig` `DEFAULT_SHUFFLE_CONFIG` `normalizeShuffleConfig` `RuleStrength`; Task 3 の `StartNewSessionInput.shuffleConfig` / `.memberGenders`
- Produces: localStorage キー `"cs_shuffle_rules"`（ShuffleConfig の JSON）

- [ ] **Step 1: i18n 追加** — `ja.newSession` に:

```ts
    rulesTitle: "シャッフルルール（優先度順）",
    ruleRest: "休みの公平 — 常に最優先",
    ruleGender: "男女バランス",
    ruleGenderHint: "性別未設定のメンバーがいるコートは対象外",
    rulePair: "同じペアを避ける",
    ruleOpp: "同じ対戦を避ける",
    strengthWeak: "弱",
    strengthMid: "中",
    strengthStrong: "強",
```

`en.newSession` に:

```ts
    rulesTitle: "Shuffle rules (priority order)",
    ruleRest: "Fair resting — always first",
    ruleGender: "Gender balance",
    ruleGenderHint: "Courts with unset-gender players are exempt",
    rulePair: "Avoid repeat partners",
    ruleOpp: "Avoid repeat opponents",
    strengthWeak: "Low",
    strengthMid: "Mid",
    strengthStrong: "High",
```

- [ ] **Step 2: new-session.tsx 実装**

import 追加:

```tsx
import {
  DEFAULT_SHUFFLE_CONFIG,
  normalizeShuffleConfig,
  type RuleStrength,
  type ShuffleConfig,
} from "@/engine/shuffle-config";
import type { Gender } from "@/engine/models";
```

モジュールスコープ（`plannedSessionId` の下）:

```tsx
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
```

`resetFormState` に `rules.value = loadStoredRules();` を追加。

`submit` の `startNewSession` 呼び出しに追加:

```tsx
      shuffleConfig: rules.value,
      memberGenders: new Map<number, Gender>(rosterStore.active.value.map((m) => [m.id, m.gender])),
```

`startNewSession` 成功後（`selected.value = new Set();` の前）に `storeRules(rules.value);`。

強さピッカー（ページ内コンポーネント）:

```tsx
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
```

ルールカード（設定カードと出席カードの間に挿入）:

```tsx
      <section class="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{t.newSession.rulesTitle}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 14 }}>1. {t.newSession.ruleRest} <span class="muted">🔒</span></div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                data-testid="rule-gender"
                checked={rules.value.genderBalance}
                onInput={(e) => { rules.value = { ...rules.value, genderBalance: (e.currentTarget as HTMLInputElement).checked }; }}
              />
              {" "}2. ⚥ {t.newSession.ruleGender}
            </label>
            <StrengthPicker
              value={rules.value.genderStrength}
              disabled={!rules.value.genderBalance}
              onChange={(s) => { rules.value = { ...rules.value, genderStrength: s }; }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>3. {t.newSession.rulePair}</span>
            <StrengthPicker value={rules.value.pairStrength} onChange={(s) => { rules.value = { ...rules.value, pairStrength: s }; }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>4. {t.newSession.ruleOpp}</span>
            <StrengthPicker value={rules.value.oppStrength} onChange={(s) => { rules.value = { ...rules.value, oppStrength: s }; }} />
          </div>
          {rules.value.genderBalance && (
            <p class="muted" style={{ margin: 0, fontSize: 12 }}>{t.newSession.ruleGenderHint}</p>
          )}
        </div>
      </section>
```

- [ ] **Step 3: 型チェック＋全テスト**

Run: `npx tsc --noEmit && npx vitest run`
Expected: エラー0 / ベースライン維持（new-session のUIテストが `resetFormState` 経由で localStorage を触る場合、jsdom で localStorage 未定義なら `loadStoredRules` の try/catch がデフォルトに落とすので壊れない）

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/new-session.tsx src/ui/i18n.ts
git commit -m "feat(new-session): shuffle-rules panel (gender on/off + 弱中強) with localStorage default"
```

---

### Task 7: 500試行シミュレーション — 数値確定

**Files:**
- Create: `tests/engine/gender-sim.test.ts`
- Modify（数値確定）: `src/engine/shuffle-config.ts`
- Modify（結果記録）: このファイル末尾の「実測結果」節

**Interfaces:**
- Consumes: engine 一式（planRound / selectResters / buildRound / stats）
- Produces: 確定した `GENDER_GAP1/2` `STRENGTH_MULT` の値

- [ ] **Step 1: シミュレーションテストを書く** — `tests/engine/gender-sim.test.ts`

セッション1晩ぶん（6ラウンド）を実エンジンで回すハーネス。CI では既定 60 試行（数秒）、チューニング時は `SIM_TRIALS=500` で実行:

```ts
import { describe, expect, it } from "vitest";
import type { AttendeeRef, Gender, PairHistory, SameSessionStats } from "@/engine/models";
import { planRound } from "@/engine/round-planner";
import { selectResters } from "@/engine/rester-selector";
import { buildRound } from "@/engine/round-builder";
import { applyRoundToHistory, applyRoundToSameSession } from "@/engine/stats";
import { mulberry32 } from "@/engine/rng";
import { DEFAULT_SHUFFLE_CONFIG, type ShuffleConfig } from "@/engine/shuffle-config";

const TRIALS = Number(process.env.SIM_TRIALS ?? 60);
const ROUNDS = 6;

const ref = (id: number): AttendeeRef => ({ kind: "member", memberId: id });
const key = (r: AttendeeRef) => JSON.stringify(r);

interface Scenario { name: string; females: number; males: number; courts: number }
const SCENARIOS: Scenario[] = [
  { name: "4F4M-2courts", females: 4, males: 4, courts: 2 },
  { name: "2F8M-3courts", females: 2, males: 8, courts: 3 },
  { name: "5F6M-3courts", females: 5, males: 6, courts: 3 },
];

interface Metrics {
  gap2PerTrial: number;      // 女女vs男男 matchups per trial (avg)
  gap1PerTrial: number;
  maxPartnerRepeat: number;  // worst same-session partner count over all trials
  restSpread: number;        // worst (max-min) rest count over all trials
}

function runNight(sc: Scenario, config: ShuffleConfig, seed: number): { gap2: number; gap1: number; partnerRepeatMax: number; restSpread: number } {
  const refs = [
    ...Array.from({ length: sc.females }, (_, i) => ref(i + 1)),
    ...Array.from({ length: sc.males }, (_, i) => ref(100 + i + 1)),
  ];
  // id 1..females = female / 101.. = male
  const genderOf = new Map<string, Gender>(
    refs.map(r => [key(r), r.kind === "member" && r.memberId < 100 ? "female" : "male"]),
  );
  const hist: PairHistory = { partnerW: new Map(), opponentW: new Map() };
  const ss: SameSessionStats = { partner: new Map(), opp: new Map() };
  const stats = new Map<string, { play: number; rest: number; singles: number }>(refs.map(r => [key(r), { play: 0, rest: 0, singles: 0 }]));
  let prevResters: AttendeeRef[] = [];
  let prevSingles = new Set<string>();
  let gap2 = 0;
  let gap1 = 0;

  for (let r = 0; r < ROUNDS; r++) {
    const rng = mulberry32(seed * 1000 + r);
    const plan = planRound(refs.length, sc.courts, true);
    const playMap = new Map([...stats].map(([k, v]) => [k, v.play]));
    const resters = selectResters(refs, plan.resters, playMap, prevResters, rng);
    const resterSet = new Set(resters.map(key));
    const seated = refs.filter(x => !resterSet.has(key(x)));
    const singlesCount = new Map([...stats].map(([k, v]) => [k, v.singles]));
    const { courts } = buildRound(seated, plan.doublesCourts, plan.singlesCourts, hist, ss, rng, singlesCount, prevSingles, { genderOf, config });

    for (const c of courts) {
      const males = (team: readonly AttendeeRef[]) => team.filter(p => genderOf.get(key(p)) === "male").length;
      const gap = Math.abs(males(c.teamA) - males(c.teamB));
      if (gap >= 2) gap2++;
      else if (gap === 1) gap1++;
      for (const p of [...c.teamA, ...c.teamB]) {
        const st = stats.get(key(p))!;
        st.play++;
        if (c.type === "singles") st.singles++;
      }
    }
    for (const p of resters) stats.get(key(p))!.rest++;
    prevSingles = new Set(courts.filter(c => c.type === "singles").flatMap(c => [...c.teamA, ...c.teamB]).map(key));
    prevResters = resters;
    applyRoundToHistory(hist, courts);
    applyRoundToSameSession(ss, courts);
  }

  const partnerRepeatMax = Math.max(0, ...[...ss.partner.values()]);
  const rests = [...stats.values()].map(v => v.rest);
  return { gap2, gap1, partnerRepeatMax, restSpread: Math.max(...rests) - Math.min(...rests) };
}

function simulate(sc: Scenario, config: ShuffleConfig): Metrics {
  let gap2 = 0; let gap1 = 0; let repeat = 0; let spread = 0;
  for (let t = 0; t < TRIALS; t++) {
    const r = runNight(sc, config, t + 1);
    gap2 += r.gap2; gap1 += r.gap1;
    repeat = Math.max(repeat, r.partnerRepeatMax);
    spread = Math.max(spread, r.restSpread);
  }
  return { gap2PerTrial: gap2 / TRIALS, gap1PerTrial: gap1 / TRIALS, maxPartnerRepeat: repeat, restSpread: spread };
}

describe(`gender-balance simulation (${TRIALS} trials)`, () => {
  const ON = { ...DEFAULT_SHUFFLE_CONFIG, genderBalance: true };

  for (const sc of SCENARIOS) {
    it(`${sc.name}: mid strength kills gap-2 and keeps rest fairness`, () => {
      const off = simulate(sc, DEFAULT_SHUFFLE_CONFIG);
      const on = simulate(sc, ON);
      // eslint-disable-next-line no-console
      console.table({ [`${sc.name} OFF`]: off, [`${sc.name} ON`]: on });
      expect(on.gap2PerTrial).toBe(0);           // 女女vs男男は出ない
      expect(on.restSpread).toBeLessThanOrEqual(1); // 休みの公平は不変
      expect(on.gap1PerTrial).toBeLessThanOrEqual(off.gap1PerTrial); // 悪化しない
    });
  }
});
```

- [ ] **Step 2: 60試行で実行し通す**

Run: `npx vitest run tests/engine/gender-sim.test.ts`
Expected: PASS。console.table の数値を確認

- [ ] **Step 3: 500試行でチューニング実行**

Run: `SIM_TRIALS=500 npx vitest run tests/engine/gender-sim.test.ts`

判定基準（満たさなければ `shuffle-config.ts` の数値を調整して再実行）:
- 中: gap2 = 0（全シナリオ）、maxPartnerRepeat が OFF 比 +1 以内、restSpread ≤ 1
- 弱: gap2 が OFF 比で半分以下（多少許容）
- 強: gap2 = 0 かつ gap1 も OFF 比で明確に減る
- 弱/強の検証は `ON` の genderStrength を差し替えた simulate を一時的に足して確認（コミット時は mid のアサーションのみ残す）

- [ ] **Step 4: 実測結果をこの計画書末尾の「実測結果」節に記録**（シナリオ×OFF/弱/中/強の gap2・gap1・maxPartnerRepeat・restSpread の表）

- [ ] **Step 5: Commit**

```bash
git add tests/engine/gender-sim.test.ts src/engine/shuffle-config.ts docs/superpowers/plans/2026-08-22-gender-balance-shuffle.md
git commit -m "test(engine): 500-trial gender-balance simulation; finalise penalty weights"
```

---

### Task 8: 検証・PR

**Files:** なし（検証のみ）

- [ ] **Step 1: フルチェック**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: tsc エラー0・lint クリーン（**#25 の教訓: lint が落ちると CI/Pages が全部止まる**）・テストはベースライン14件以外すべて PASS

- [ ] **Step 2: dev サーバーで手動スモーク**（`npm run dev`）
  - 名簿: 性別セレクタで男/女を設定 → リロードで保持
  - 新規セッション: ルールカード表示・男女ONで開始 → 4F4M でラウンド生成 → 女女vs男男が出ない
  - リロード（resume）後もラウンド生成が同ルールで動く
  - ローカルフレーバー: `npm run dev:local` で同確認（PIN なし・英語）

- [ ] **Step 3: code-reviewer サブエージェントでレビュー**（作る役と確認する役を分ける）。CRITICAL/HIGH は修正。

- [ ] **Step 4: push + PR 作成**

```bash
git push -u origin feat/gender-balance-shuffle
gh pr create --title "feat: gender-balance shuffle (性別マスター + 男女ペナルティ + ルール一覧UI)" --body "..."
```

PR 本文に必ず書く: **マージ前に migration 0011 を SQL Editor で適用**・PR #21/#22 との rebase 関係・実測結果の要約。

---

## 実測結果（2026-08-22・6ラウンド/晩・gap2=女女vs男男回数/晩、gap1=女女vs男女回数/晩）

**確定値**: GENDER_GAP2 = 弱120 / 中250 / 強1000、GENDER_GAP1 = 弱10 / 中40 / 強160（弱は当初60→4F4Mでペア重複コスト2件分に負けてgap2が消えず→120に引き上げ）

| シナリオ | 指標 | OFF | 弱(500) | 中(500) | 強(200) |
|---|---|---|---|---|---|
| 4F4M-2面 | gap2 / gap1 | 2.06 / 5.57 | 0 / 1.44 | 0 / 0 | 0 / 0 |
| 2F8M-3面 | gap2 / gap1 | 0.58 / 8.51 | 0 / 8.56 | 0 / 3.43 | 0 / 0 |
| 5F6M-3面 | gap2 / gap1 | 1.83 / 9.14 | 0 / 6.59 | 0 / 3.43 | 0 / 3.24 |

- 休みの公平（restSpread）は全シナリオ・全強度で OFF と同一（≤1）。休みローテ非破壊を確認
- maxPartnerRepeat は 4F4M のみ 1→2（プール半減の必然コスト）。他シナリオは OFF と同じ 2
- 弱の性格 = gap2 だけ潰して gap1 は容認（バラエティ優先）。中 = gap1 も半減。強 = ほぼ完全ミックスまたは完全同性
- 再現コマンド: `SIM_TRIALS=500 npx vitest run tests/engine/gender-sim.test.ts`（強度は `SIM_GENDER_STRENGTH=weak|mid|strong`）
