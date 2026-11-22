/**
 * Hand-rolled string tables — two locales, no plural/gender complexity, so a
 * library would be dead weight.
 *
 * - `ja` is the source of truth: current GG literals, verbatim (extraction
 *   must leave the GG flavour pixel-identical).
 * - `en` serves BOTH flavours: the LOCAL build (device-only, no
 *   rankings/PIN/server) and English-speaking clubs on the server build.
 *   Wording that is only true for one flavour picks its text with IS_LOCAL
 *   (a build-time constant, so a module-load ternary is enough).
 * - Interpolated strings are FUNCTION entries, not templates.
 * - `en: Strings` (= typeof ja) makes key parity a compile error.
 *
 * The locale is chosen at RUNTIME: the default comes from VITE_LOCALE
 * (unset → ja for GG; local builds set VITE_LOCALE=en), and `setLocale()`
 * switches it — called once at boot, before the first render (e.g. from the
 * club the URL points at). `t` is a Proxy, so `t.section.key` always reads
 * the current table; no re-render is triggered by a switch.
 */

import { IS_LOCAL } from "@/flavor";

export const ja = {
  common: {
    noSessionTitle: "セッションが開始されていません",
    createNewSession: "新規セッションを作成",
    backHome: "← ホーム",
    homeLink: "ホームへ",
    showNames: "名前で表示",
    namesToggle: "名前",
    rest: "休憩",
    cancel: "キャンセル",
    ok: "OK",
    doubles: "ダブルス",
    singles: "シングルス",
  },
  numberMap: {
    title: "名前 → 今日の番号",
    checkYourNumber: "全員、自分の番号を確認してください。",
    startRound: "ラウンド開始",
    generateFailed: (msg: string) =>
      `ラウンドの生成・保存に失敗しました:\n${msg}\n電波を確認してもう一度お試しください。`,
  },
  round: {
    saveFailed: (msg: string) =>
      `ラウンドの保存に失敗しました:\n${msg}\n` +
      "画面のラウンドはまだサーバーに保存されていません。電波を確認してください。" +
      "（次の操作（勝敗タップ等）が成功すれば自動的に保存されます）",
    preparing: (roundNo: number) => `R${roundNo} を準備中…`,
    generate: "生成する",
    prev: "前",
    next: "次",
    recordWinnerFailed: (msg: string) => `勝敗の保存に失敗しました:\n${msg}`,
    endSession: "セッション終了",
    endConfirm:
      "セッションを終了してランキングに反映します。\n（間違えた場合は「過去のセッション」から削除できます）",
    endFailed: (msg: string) => `セッション終了に失敗しました:\n${msg}`,
    lineSendConfirm: (roundNo: number) =>
      `R${roundNo} の組み合わせをLINEグループに送りますか？`,
    lineSendNow: "このラウンドをLINEに送る",
    generateAll: (n: number) => `${n}ラウンド分まとめて作成`,
    generateAllConfirm: (n: number) =>
      `${n}ラウンド分の組み合わせをまとめて作り、LINEに1通で送ります。\n早く終わった場合は「セッション終了」を押したラウンドまでが記録されます。`,
    lineAllRoundsConfirm: (n: number) =>
      `全${n}ラウンドの組み合わせをLINEグループに1通で送りますか？`,
    lineRemainingRoundsConfirm: (n: number, fromRoundNo: number) =>
      `組み直したR${fromRoundNo}以降の${n}ラウンドをLINEグループに1通で送りますか？`,
    editAttendees: "👥 メンバーの追加・離脱",
    lineSummaryConfirm: "今日の成績をLINEグループに送りますか？",
    lineSendFailed: (msg: string) =>
      `LINEへの送信に失敗しました:\n${msg}\n（ラウンドはこのまま進められます）`,
    discardConfirm:
      "勝敗が1件も記録されていません。\nこのセッションを記録に残さず破棄しますか？\n（履歴・ランキング・ペア履歴に一切残りません）",
    discardKeepConfirm:
      "破棄せず、通常どおり終了して履歴に残しますか？",
    discardFailed: (msg: string) => `破棄に失敗しました:\n${msg}`,
  },
  history: {
    emptyTitle: "履歴なし",
    emptyBody: "まだラウンドが生成されていません。",
    toRound: "ラウンド画面へ",
    toCurrentRound: "現在のラウンドへ →",
  },
  home: {
    comingSoon: "準備中",
    copyPublicLink: "公開リンクをコピー",
    startSession: "セッション開始 →",
    noPlanned: "まだ将来セッションがありません。",
    createPlanned: "→ 予定セッションを作成する",
    staleTitle: "⚠️ 未終了",
    liveTitle: "ライブ中",
    hostStarted: (name: string) => `${name} さんが開始`,
    staleHours: (hours: number) => `開始から ${hours} 時間。終了し忘れていませんか？`,
    review: "確認する",
    watchOperate: "観戦・運営する →",
    endNowConfirm: "このセッションを終了してランキングに反映します。よろしいですか？",
    staleDiscardConfirm:
      "勝敗が1件も記録されていません。記録に残さず破棄しますか？\n（キャンセル＝履歴に残して終了）",
    endFailed: (msg: string) => `終了に失敗しました:\n${msg}`,
    endNow: "今すぐ終了",
    nextSessionHeading: "📅 次回セッション",
    navPlanned: "将来セッション (準備中)",
    navRoster: "名簿",
    navRanking: "ランキング",
    navPast: "過去セッション",
    navSettings: "設定",
  },
  newSession: {
    title: "新規セッション",
    loadedFromPlan: "📅 予定から読み込みました。内容を確認して開始してください。",
    date: "日付",
    venue: "会場",
    venuePlaceholder: "例: Golders Hill",
    courtCount: "コート数 (1-6)",
    allowSingles: "シングルス許可",
    chooseAttendees: "出席を選ぶ",
    noActiveMembers: "名簿にアクティブ会員がいません。",
    addToRoster: "名簿を追加",
    selectedCount: (n: number) => `選択: ${n} 人`,
    nextDrawNumbers: "次へ：番号を抽選",
    rulesTitle: "シャッフルルール（優先度順）",
    ruleRest: "休みの公平 — 常に最優先",
    ruleGender: "男女バランス",
    ruleGenderHint: "性別未設定のメンバーがいるコートは対象外",
    rulePair: "同じペアを避ける",
    ruleOpp: "同じ対戦を避ける",
    strengthWeak: "弱",
    strengthMid: "中",
    strengthStrong: "強",
  },
  editAttendees: {
    title: "メンバーの追加・離脱",
    hint: (currentRoundNo: number) =>
      `R${currentRoundNo} までの記録はそのまま。帰った人は、R${currentRoundNo + 1} 以降の出番を休憩の人と入れ替えます（他の組み合わせはそのまま）。途中から来た人がいるときは R${currentRoundNo + 1} 以降を組み直します。`,
    subsTitle: (currentRoundNo: number) => `R${currentRoundNo} の途中で帰る人の代わり`,
    subsHint: "今コートに出ている人が帰るときは、休憩の人から代わりを選べます。勝敗は代わりの人に付きます。",
    subsNone: "代わりなし（このラウンドは最後まで出た）",
    subsLabel: (name: string) => `${name} の代わり`,
    hintNoRegen: "組み直す先のラウンドはありません。次のラウンドから反映されます。",
    joined: "追加",
    selectedCount: (n: number) => `参加: ${n} 人`,
    apply: "変更を反映",
    applyConfirm: (fromRoundNo: number) =>
      `メンバーを変更して、R${fromRoundNo} 以降に反映します。よろしいですか？\n（実施済みのラウンドと勝敗はそのまま残ります）`,
    applyConfirmNoRegen: "メンバーを変更します。次のラウンドから反映されます。",
    applyFailed: (msg: string) => `メンバーの変更に失敗しました:\n${msg}`,
    back: "やめる",
  },
  roster: {
    title: "名簿",
    addTitle: "新規会員を追加",
    pinHint: "追加・変更にはクラブ PIN が必要です。",
    pinLocked: "PIN がロックされています",
    namePlaceholder: "名前",
    add: "追加",
    save: "保存",
    cancelRename: "取消",
    rename: "改名",
    restore: "復帰",
    archive: "アーカイブ",
    exportTooltip: "このメンバーのデータを JSON でエクスポート (GDPR §17.4)",
    export: "エクスポート",
    delete: "削除",
    activeHeading: "アクティブ",
    noActive: "アクティブ会員はまだいません。",
    archivedHeading: "アーカイブ",
    noArchived: "アーカイブされた会員はいません。",
    deleteConfirmTitle: "本当に削除しますか？",
    deleteConfirmSuffix: "されます。元に戻せません（GDPR §17.4 削除権）。",
    deleteConfirmData: " のデータ（会員情報・試合履歴・ペア履歴・RSVP）が",
    deleteAll: "すべて削除",
    gender: "性別",
    genderMale: "男",
    genderFemale: "女",
    genderNone: "未設定",
    deleteAction: "削除する",
  },
  past: {
    title: "過去セッション",
    loading: "読み込み中…",
    empty: "まだ過去セッションがありません。",
    backToList: "← 一覧へ",
    sendSummary: "成績を送る",
    deleteConfirm:
      "このセッションを削除します。\n試合結果もランキングから除かれます。\nよろしいですか？",
    deleting: "削除中…",
    deleteBtn: "🗑 削除",
    pinUnavailable: "PIN が取得できませんでした",
    updateWinnerFailed: (msg: string) => `勝敗の更新に失敗しました:\n${msg}`,
    deleteFailed: (msg: string) => `セッション削除に失敗しました:\n${msg}`,
    meta: (players: number, courts: number, rounds: number) =>
      `${players}人 · ${courts}コート · ${rounds}ラウンド`,
    listMeta: (players: number, rounds: number) => `${players}人 · ${rounds}R`,
    swapBtn: "↔ 選手を入れ替え",
    swapTitle: (roundNo: number) => `R${roundNo} に実際に出た人を直す`,
    swapOut: "記録上出ていた人",
    swapIn: "実際に出た人",
    swapApply: "入れ替える",
    swapCancel: "やめる",
    swapConfirm: (outName: string, inName: string, roundNo: number) =>
      `R${roundNo} の ${outName} を ${inName} に入れ替えます。\n勝敗は ${inName} に付け替わり、ランキングにも反映されます。`,
    swapFailed: (msg: string) =>
      `入れ替えに失敗しました:\n${msg}\n途中まで反映されている場合があります。電波を確認して、同じ入れ替えをもう一度行ってください。`,
    standingsTitle: "🏆 この日の順位",
  },
  standings: {
    empty: "まだ勝敗が記録されていません。",
    rank: "順位",
    player: "名前",
    wins: "勝",
    losses: "敗",
    guest: "ゲスト",
    liveToggle: "🏆 今日の順位",
  },
  settingsLocal: {
    title: "設定",
    displayName: "あなたの表示名",
    displayNameHint: "セッション開始時に「○○ さんが運営中」と表示されます。任意。",
    displayNamePlaceholder: "例: Katsu",
    save: "保存",
    dataTitle: "データ",
    dataHint:
      "すべてのデータはこの端末の中だけに保存されます。バックアップは JSON エクスポートで行ってください。",
    exportBtn: "JSON エクスポート",
    wipeBtn: "全データ削除",
    exportDone: "バックアップを保存しました",
    exportFailed: (msg: string) => `エクスポートに失敗しました:\n${msg}`,
    wipeConfirm1: "すべてのデータ（名簿・セッション・ペア履歴）を削除します。よろしいですか？",
    wipeConfirm2: "この操作は取り消せません。本当に削除しますか？",
    wipeDone: "すべてのデータを削除しました",
    wipeFailed: (msg: string) => `削除に失敗しました:\n${msg}`,
    privacyTitle: "プライバシー",
    privacyLink: "プライバシーノーティス",
  },
  settings: {
    title: "設定",
    displayName: "あなたの表示名",
    displayNameHint: "セッション開始時に「○○ さんが運営中」と表示されます。任意。",
    displayNamePlaceholder: "例: Katsu",
    save: "保存",
    pinTitle: "クラブ PIN",
    // JSX joined the two source lines with a single space — kept verbatim.
    pinHint: "メンバー削除や予定セッション作成など、破壊操作の保護に使います。 定期的にローテーションしてください。",
    pinStatus: "状態:",
    pinUnlocked: "解錠中",
    pinLocked: "ロック中",
    lock: "ロック",
    newPinPlaceholder: "新しい PIN (4 文字以上)",
    rotatePin: "PIN 更新",
    pinUpdated: "PIN を更新しました",
    outdoorTitle: "屋外モード",
    outdoorHint1: "画面の明るさを最大にしてください。",
    outdoorHint2: "Web版はブラウザ制約で輝度を自動制御できません。",
    outdoorHint3: "v1.5 のネイティブ App 版では自動 MAX 化される予定です。",
    privacyTitle: "プライバシー",
    privacyLink: "プライバシーノーティス（日本語 / English）",
  },
  pin: {
    title: "クラブ PIN を入力",
    hint: "メンバー削除や設定変更などの操作には PIN が必要です。",
    inputLabel: "クラブ PIN",
    wrongPin: "PIN が違います",
    verifying: "確認中…",
    unlock: "解錠",
    locked: "PIN がロックされています",
  },
  planned: {
    title: "将来セッション",
    createTitle: "新規作成",
    pinHint: "作成・編集・削除にはクラブ PIN が必要です。",
    date: "日付",
    venue: "会場",
    courts: "コート ",
    allowSingles: "シングルス許可",
    showGoingTitle: "公開リンクで「行く人」リストを公開するか",
    showGoing: "行く人リストを公開",
    create: "作成",
    empty: "まだ将来セッションがありません。",
    courtCount: (n: number) => `(${n}コート)`,
    delete: "削除",
    deleteConfirm: "この将来セッションを削除しますか？",
    editRsvp: "RSVP を編集",
    linkCopied: "コピー済み ✓",
    copyLink: "公開リンクをコピー",
    issueLink: "公開リンクを発行",
    rotateLink: "リンクを再発行",
    start: "セッション開始 →",
  },
  rsvp: {
    going: "行く",
    maybe: "未定",
    notGoing: "行かない",
    goingCount: (n: number) => `行く (${n})`,
    maybeCount: (n: number) => `未定 (${n})`,
    notGoingCount: (n: number) => `行かない (${n})`,
    unansweredCount: (n: number) => `未回答 (${n})`,
    nobodyYet: "まだいません",
    chipsOthers: (maybe: number, notGoing: number, unanswered: number) =>
      `❓ 未定 ${maybe}人 · ❌ 行かない ${notGoing}人 · ⬜ 未回答 ${unanswered}人`,
    // ── public RSVP page ──
    loading: "読み込み中…",
    invalidTitle: "このリンクは無効です",
    invalidBody: "主催者にお問い合わせください。",
    headerLabel: "出欠回答",
    courtsInfo: (courts: number, allowSingles: boolean) =>
      `コート ${courts} 面 · ${allowSingles ? "シングルス許可" : "ダブルスのみ"}`,
    goingTotal: (n: number) => `✅ 行く: ${n}人`,
    othersCount: (maybe: number, notGoing: number) =>
      `❓ 未定 ${maybe}人 · ❌ 行かない ${notGoing}人`,
    yourAnswer: "あなたの回答",
    pickMember: "名簿から選ぶ",
    pickPlaceholder: "— 選択してください —",
    note: "メモ（任意）",
    notePlaceholder: "30分遅れる など",
    submitted: "送信しました — このブラウザから回答を変更できます。",
    privacy: "プライバシー",
    footer: " · クラブ内輪共有のみ。SNSへの転載はご遠慮ください。",
  },
  ranking: {
    title: "ランキング",
    season: (year: number) => `${year} シーズン`,
    tabElo: "個人 (Elo)",
    tabPair: "ペア",
    tabAttendance: "参加",
    loading: "読み込み中…",
    noData: "データがありません。",
    noMatches: "まだ試合データがありません。",
    pairJoin: " ＆ ",
    noPairs: "最低3試合のペアがまだいません。",
    attendanceCount: (n: number) => `${n}回`,
    noSessions: "過去のセッションがありません。",
  },
  clubs: {
    title: "クラブの追加",
    intro: "別のクラブ用のシャッフル・ランキングを作ります。名簿・ランキング・過去セッション・PIN はクラブごとに完全に別で、GG のデータとは混ざりません。",
    ggOnly: "クラブの追加は GG の画面からだけできます。",
    listTitle: "クラブ一覧",
    addTitle: "新しいクラブ",
    name: "クラブ名",
    slug: "URL 用の名前（英小文字・数字・ハイフン）",
    slugRule: "英小文字・数字・ハイフンで2〜30文字",
    language: "表示言語",
    pin: "新しいクラブの PIN（6文字以上）",
    pinConfirm: "PIN をもう一度",
    pinHint: "作成には GG の PIN が要ります。作ったら、リンクとこの PIN を相手のクラブの幹事に渡してください。PIN は相手が設定画面で変えられます。",
    create: "クラブを作る",
    creating: "作成中…",
    createdTitle: (name: string) => `${name} を作りました`,
    createdHint: "このリンクと PIN を相手に渡してください。ホーム画面に追加すれば、このクラブ専用のアプリとして使えます。",
    copyLink: "リンクをコピー",
    copied: "コピーしました",
    createFailed: (msg: string) => `クラブを作れませんでした:\n${msg}`,
    errSlugTaken: "その URL 用の名前は使われています。別の名前にしてください。",
    errSlugInvalid: "その URL 用の名前は使えません（英小文字・数字・ハイフンで2〜30文字、予約語は不可）。",
    errPinShort: "PIN は6文字以上にしてください。",
    errAdminPin: "GG の PIN が違います。",
    backToSettings: "← 設定へ",
    settingsLink: "🏟 別のクラブ用を作る",
  },
  errors: {
    generating: "ラウンドを生成中です。少し待ってからやり直してください。",
    tooFewPlayers: "参加者が2人未満になります。1人以上残してください。",
    subOnlyForLeavers: "代役は帰る人にだけ指定できます。",
    subMustStay: "代わりに入る人が残るメンバーにいません。",
    subMustAttend: "代わりに入る人は今日の参加者から選んでください。",
    sameSwap: "同じ人どうしは入れ替えられません。",
    outNotOnCourt: "入れ替える人がこのラウンドのコートにいません。",
    inAlreadyOnCourt: "代わりに入る人は既にコートに出ています。",
    pinLocked: "PIN がロックされています",
    pinServer: (msg: string) => `サーバーエラー: ${msg} (migrations 0004-0006 が未適用かも)`,
    pinNetwork: (msg: string) => `通信エラー: ${msg}`,
    unknown: "不明",
  },
  privacy: {
    header: "プライバシー / Privacy",
  },
};

export type Strings = typeof ja;

export const en: Strings = {
  common: {
    noSessionTitle: "No session in progress",
    createNewSession: "Start a new session",
    backHome: "← Home",
    homeLink: "Home",
    showNames: "Show names",
    namesToggle: "Names",
    rest: "Resting",
    cancel: "Cancel",
    ok: "OK",
    doubles: "Doubles",
    singles: "Singles",
  },
  numberMap: {
    title: "Name → today's number",
    checkYourNumber: "Everyone, check your number.",
    startRound: "Start round",
    generateFailed: (msg: string) =>
      IS_LOCAL
        ? `Failed to generate the round:\n${msg}\nPlease try again.`
        : `Failed to generate or save the round:\n${msg}\nCheck your connection and try again.`,
  },
  round: {
    saveFailed: (msg: string) =>
      IS_LOCAL
        ? `Failed to save the round:\n${msg}\nThe round on screen is not saved yet. It will be saved automatically once the next action succeeds.`
        : `Failed to save the round:\n${msg}\nThe round on screen has not been saved to the server yet — check your connection. ` +
          "(It will be saved automatically once your next action, such as tapping a winner, succeeds.)",
    preparing: (roundNo: number) => `Preparing R${roundNo}…`,
    generate: "Generate",
    prev: "Prev",
    next: "Next",
    recordWinnerFailed: (msg: string) => `Failed to save the result:\n${msg}`,
    endSession: "End session",
    endConfirm: IS_LOCAL
      ? "End this session?\n(You can delete it later from Past sessions if this was a mistake.)"
      : "End this session and add it to the rankings?\n(You can delete it later from Past sessions if this was a mistake.)",
    endFailed: (msg: string) => `Failed to end the session:\n${msg}`,
    lineSendConfirm: (roundNo: number) => `Send the R${roundNo} assignments to the LINE group?`,
    lineSendNow: "Send this round to LINE",
    generateAll: (n: number) => `Generate all ${n} rounds`,
    generateAllConfirm: (n: number) =>
      `Generate ${n} rounds at once and send them to LINE in a single message.\nIf the night ends early, only the rounds up to where you press "End session" are kept.`,
    lineAllRoundsConfirm: (n: number) =>
      `Send all ${n} rounds to the LINE group in one message?`,
    lineRemainingRoundsConfirm: (n: number, fromRoundNo: number) =>
      `Send the ${n} rebuilt rounds (R${fromRoundNo} onwards) to the LINE group in one message?`,
    editAttendees: "👥 Players joining / leaving",
    lineSummaryConfirm: "Send today's standings to the LINE group?",
    lineSendFailed: (msg: string) =>
      `Failed to send to LINE:\n${msg}\n(You can keep playing — the round is unaffected.)`,
    discardConfirm:
      "No results have been recorded.\nDiscard this session without keeping it?\n(It will not appear in history, rankings, or pairing fairness.)",
    discardKeepConfirm: "Keep it instead — end normally and save to history?",
    discardFailed: (msg: string) => `Failed to discard:\n${msg}`,
  },
  history: {
    emptyTitle: "No history",
    emptyBody: "No rounds have been generated yet.",
    toRound: "Go to round view",
    toCurrentRound: "To current round →",
  },
  home: {
    comingSoon: "Coming soon",
    copyPublicLink: "Copy public link",
    startSession: "Start session →",
    noPlanned: "No upcoming sessions yet.",
    createPlanned: "→ Create a planned session",
    staleTitle: "⚠️ Not ended",
    liveTitle: "Live",
    hostStarted: (name: string) => `Started by ${name}`,
    staleHours: (hours: number) => `Started ${hours}h ago. Forgot to end it?`,
    review: "Review",
    watchOperate: "Open session →",
    endNowConfirm: IS_LOCAL
      ? "End this session now?"
      : "End this session now and add it to the rankings?",
    staleDiscardConfirm:
      "No results were recorded. Discard without keeping it?\n(Cancel = keep in history and end)",
    endFailed: (msg: string) => `Failed to end:\n${msg}`,
    endNow: "End now",
    nextSessionHeading: "📅 Next session",
    navPlanned: "Planned (soon)",
    navRoster: "Roster",
    navRanking: "Rankings",
    navPast: "Past sessions",
    navSettings: "Settings",
  },
  newSession: {
    title: "New session",
    loadedFromPlan: "📅 Loaded from the plan. Review and start.",
    date: "Date",
    venue: "Venue",
    venuePlaceholder: "e.g. Main Courts",
    courtCount: "Courts (1-6)",
    allowSingles: "Allow singles",
    chooseAttendees: "Who's playing?",
    noActiveMembers: "No active players in the roster.",
    addToRoster: "Add players",
    selectedCount: (n: number) => `Selected: ${n}`,
    nextDrawNumbers: "Next: draw numbers",
    rulesTitle: "Shuffle rules (priority order)",
    ruleRest: "Fair resting — always first",
    ruleGender: "Gender balance",
    ruleGenderHint: "Courts with unset-gender players are exempt",
    rulePair: "Avoid repeat partners",
    ruleOpp: "Avoid repeat opponents",
    strengthWeak: "Low",
    strengthMid: "Mid",
    strengthStrong: "High",
  },
  editAttendees: {
    title: "Players joining / leaving",
    hint: (currentRoundNo: number) =>
      `R${currentRoundNo} and earlier stay as they are. Anyone leaving is swapped for a resting player from R${currentRoundNo + 1} on — every other pairing stays. If someone joins, R${currentRoundNo + 1} onwards is rebuilt.`,
    subsTitle: (currentRoundNo: number) => `Who takes over in R${currentRoundNo}?`,
    subsHint: "If someone on court leaves mid-round, pick a resting player to take their place. The result goes to the replacement.",
    subsNone: "Nobody (they finished this round)",
    subsLabel: (name: string) => `Replacing ${name}`,
    hintNoRegen: "No upcoming rounds to rebuild — the change applies from the next round.",
    joined: "new",
    selectedCount: (n: number) => `Playing: ${n}`,
    apply: "Apply changes",
    applyConfirm: (fromRoundNo: number) =>
      `Update the line-up from R${fromRoundNo} on?\n(Rounds already played and their results are kept.)`,
    applyConfirmNoRegen: "Update the line-up? It applies from the next round.",
    applyFailed: (msg: string) => `Could not change the line-up:\n${msg}`,
    back: "Cancel",
  },
  roster: {
    title: "Roster",
    addTitle: "Add a player",
    // Only rendered on the server flavour (the local flavour has no PIN).
    pinHint: IS_LOCAL ? "" : "Adding or changing players needs the club PIN.",
    pinLocked: "PIN is locked",
    namePlaceholder: "Name",
    add: "Add",
    save: "Save",
    cancelRename: "Cancel",
    rename: "Rename",
    restore: "Restore",
    archive: "Archive",
    exportTooltip: IS_LOCAL
      ? "Export this player's data as JSON"
      : "Export this player's data as JSON (UK GDPR right of access)",
    export: "Export",
    delete: "Delete",
    activeHeading: "Active",
    noActive: "No active players yet.",
    archivedHeading: "Archived",
    noArchived: "No archived players.",
    deleteConfirmTitle: "Really delete?",
    deleteConfirmData: IS_LOCAL
      ? "'s data (profile and pairing history) will be "
      : "'s data (profile, match history, pairing history and RSVPs) will be ",
    deleteAll: "permanently deleted",
    deleteConfirmSuffix: IS_LOCAL
      ? ". This cannot be undone."
      : ". This cannot be undone (UK GDPR right to erasure).",
    deleteAction: "Delete",
    gender: "Gender",
    genderMale: "M",
    genderFemale: "F",
    genderNone: "—",
  },
  past: {
    title: "Past sessions",
    loading: "Loading…",
    empty: "No past sessions yet.",
    backToList: "← Back",
    sendSummary: "Send standings",
    deleteConfirm: IS_LOCAL
      ? "Delete this session?\nThis cannot be undone."
      : "Delete this session?\nIts results will also be removed from the rankings.\nThis cannot be undone.",
    deleting: "Deleting…",
    deleteBtn: "🗑 Delete",
    pinUnavailable: "PIN unavailable",
    updateWinnerFailed: (msg: string) => `Failed to update the result:\n${msg}`,
    deleteFailed: (msg: string) => `Failed to delete the session:\n${msg}`,
    meta: (players: number, courts: number, rounds: number) =>
      `${players} players · ${courts} courts · ${rounds} rounds`,
    listMeta: (players: number, rounds: number) => `${players} players · ${rounds}R`,
    swapBtn: "↔ Swap a player",
    swapTitle: (roundNo: number) => `Fix who actually played in R${roundNo}`,
    swapOut: "Recorded as playing",
    swapIn: "Actually played",
    swapApply: "Swap",
    swapCancel: "Cancel",
    swapConfirm: (outName: string, inName: string, roundNo: number) =>
      `Replace ${outName} with ${inName} in R${roundNo}?\nThe result moves to ${inName} and the rankings are updated.`,
    swapFailed: (msg: string) =>
      `Could not swap the player:\n${msg}\nIt may be partly saved — check your connection and do the same swap again.`,
    standingsTitle: "🏆 Standings for the day",
  },
  standings: {
    empty: "No results recorded yet.",
    rank: "#",
    player: "Player",
    wins: "W",
    losses: "L",
    guest: "Guest",
    liveToggle: "🏆 Today's standings",
  },
  settingsLocal: {
    title: "Settings",
    displayName: "Your display name",
    displayNameHint: 'Shown as "Hosted by …" when you start a session. Optional.',
    displayNamePlaceholder: "e.g. Alex",
    save: "Save",
    dataTitle: "Data",
    dataHint: "All data lives only on this device. Use JSON export to back it up.",
    exportBtn: "Export JSON",
    wipeBtn: "Delete all data",
    exportDone: "Backup saved",
    exportFailed: (msg: string) => `Export failed:\n${msg}`,
    wipeConfirm1: "Delete ALL data (roster, sessions, pairing history)?",
    wipeConfirm2: "This cannot be undone. Really delete everything?",
    wipeDone: "All data deleted",
    wipeFailed: (msg: string) => `Delete failed:\n${msg}`,
    privacyTitle: "Privacy",
    privacyLink: "Privacy notice",
  },
  settings: {
    title: "Settings",
    displayName: "Your display name",
    displayNameHint: 'Shown as "Hosted by …" when you start a session. Optional.',
    displayNamePlaceholder: "e.g. Alex",
    save: "Save",
    pinTitle: "Club PIN",
    pinHint:
      "Protects destructive actions such as deleting members or creating planned sessions. Change it regularly.",
    pinStatus: "Status:",
    pinUnlocked: "Unlocked",
    pinLocked: "Locked",
    lock: "Lock",
    newPinPlaceholder: "New PIN (at least 4 characters)",
    rotatePin: "Update PIN",
    pinUpdated: "PIN updated",
    outdoorTitle: "Outdoor mode",
    outdoorHint1: "Turn your screen brightness up to maximum.",
    outdoorHint2: "Browsers don't let the web version control brightness automatically.",
    outdoorHint3: "The native app (v1.5) is planned to do this for you.",
    privacyTitle: "Privacy",
    privacyLink: "Privacy notice",
  },
  pin: {
    title: "Enter the club PIN",
    hint: "The PIN is needed for actions such as deleting members or changing settings.",
    inputLabel: "Club PIN",
    wrongPin: "Incorrect PIN",
    verifying: "Checking…",
    unlock: "Unlock",
    locked: "PIN is locked",
  },
  planned: {
    title: "Planned sessions",
    createTitle: "New planned session",
    pinHint: "Creating, editing or deleting needs the club PIN.",
    date: "Date",
    venue: "Venue",
    courts: "Courts ",
    allowSingles: "Allow singles",
    showGoingTitle: "Show the list of who's going on the public link",
    showGoing: "Show who's going publicly",
    create: "Create",
    empty: "No planned sessions yet.",
    courtCount: (n: number) => `(${n} ${n === 1 ? "court" : "courts"})`,
    delete: "Delete",
    deleteConfirm: "Delete this planned session?",
    editRsvp: "Edit RSVPs",
    linkCopied: "Copied ✓",
    copyLink: "Copy public link",
    issueLink: "Create public link",
    rotateLink: "Reissue link",
    start: "Start session →",
  },
  rsvp: {
    going: "Going",
    maybe: "Maybe",
    notGoing: "Not going",
    goingCount: (n: number) => `Going (${n})`,
    maybeCount: (n: number) => `Maybe (${n})`,
    notGoingCount: (n: number) => `Not going (${n})`,
    unansweredCount: (n: number) => `No reply (${n})`,
    nobodyYet: "Nobody yet",
    chipsOthers: (maybe: number, notGoing: number, unanswered: number) =>
      `❓ Maybe ${maybe} · ❌ Not going ${notGoing} · ⬜ No reply ${unanswered}`,
    // ── public RSVP page ──
    loading: "Loading…",
    invalidTitle: "This link is not valid",
    invalidBody: "Please contact the organiser.",
    headerLabel: "RSVP",
    courtsInfo: (courts: number, allowSingles: boolean) =>
      `${courts} ${courts === 1 ? "court" : "courts"} · ${allowSingles ? "Singles allowed" : "Doubles only"}`,
    goingTotal: (n: number) => `✅ Going: ${n}`,
    othersCount: (maybe: number, notGoing: number) =>
      `❓ Maybe ${maybe} · ❌ Not going ${notGoing}`,
    yourAnswer: "Your reply",
    pickMember: "Pick your name",
    pickPlaceholder: "— Select —",
    note: "Note (optional)",
    notePlaceholder: "e.g. Running 30 minutes late",
    submitted: "Sent — you can change your reply from this browser.",
    privacy: "Privacy",
    footer: " · For club members only. Please don't repost on social media.",
  },
  ranking: {
    title: "Rankings",
    season: (year: number) => `${year} season`,
    tabElo: "Individual (Elo)",
    tabPair: "Pairs",
    tabAttendance: "Attendance",
    loading: "Loading…",
    noData: "No data.",
    noMatches: "No match data yet.",
    pairJoin: " & ",
    noPairs: "No pairs with at least 3 matches yet.",
    attendanceCount: (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`,
    noSessions: "No past sessions.",
  },
  clubs: {
    title: "Add a club",
    intro: "Create a separate shuffle and ranking for another club. Players, rankings, past sessions and the PIN are completely separate per club.",
    ggOnly: "Clubs can only be added from the GG app.",
    listTitle: "Clubs",
    addTitle: "New club",
    name: "Club name",
    slug: "Name for the link (lowercase letters, digits, hyphens)",
    slugRule: "2–30 lowercase letters, digits or hyphens",
    language: "Language",
    pin: "PIN for the new club (6+ characters)",
    pinConfirm: "PIN again",
    pinHint: "Creating a club needs the GG PIN. Afterwards, give the link and this PIN to the other club's organiser — they can change the PIN in Settings.",
    create: "Create club",
    creating: "Creating…",
    createdTitle: (name: string) => `${name} has been created`,
    createdHint: "Share this link and the PIN. Adding it to the home screen gives the club its own app icon.",
    copyLink: "Copy link",
    copied: "Copied",
    createFailed: (msg: string) => `Could not create the club:\n${msg}`,
    errSlugTaken: "That link name is already taken. Please choose another.",
    errSlugInvalid: "That link name can't be used (2–30 lowercase letters, digits or hyphens; some words are reserved).",
    errPinShort: "The PIN must be at least 6 characters.",
    errAdminPin: "The GG PIN is wrong.",
    backToSettings: "← Settings",
    settingsLink: "🏟 Create an app for another club",
  },
  errors: {
    generating: "A round is being generated. Please wait a moment and try again.",
    tooFewPlayers: "That would leave fewer than 2 players. Keep at least one more.",
    subOnlyForLeavers: "A replacement can only be set for someone who is leaving.",
    subMustStay: "The replacement isn't among the players who are staying.",
    subMustAttend: "Choose the replacement from today's players.",
    sameSwap: "You can't swap a player with themselves.",
    outNotOnCourt: "That player isn't on court in this round.",
    inAlreadyOnCourt: "The replacement is already on court.",
    pinLocked: "The PIN is locked",
    pinServer: (msg: string) => `Server error: ${msg}`,
    pinNetwork: (msg: string) => `Network error: ${msg}`,
    unknown: "unknown",
  },
  privacy: {
    header: "Privacy",
  },
};

export type Locale = "ja" | "en";
const TABLES: Record<Locale, Strings> = { ja, en };

let current: Locale = import.meta.env.VITE_LOCALE === "en" ? "en" : "ja";

/** The active locale (default: VITE_LOCALE === "en" → en, else ja). */
export function getLocale(): Locale {
  return current;
}

/**
 * Switch the active string table. Call once at boot, before the first
 * render — already-rendered text is not refreshed. Keeps <html lang> in step.
 */
export function setLocale(l: Locale): void {
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

/** The active string table. Pages import this; every read resolves against
 *  the CURRENT locale, so `t.section.key` follows setLocale(). */
export const t: Strings = new Proxy({} as Strings, {
  get: (_target, prop) => Reflect.get(TABLES[current], prop),
  has: (_target, prop) => Reflect.has(TABLES[current], prop),
  ownKeys: () => Reflect.ownKeys(TABLES[current]),
  getOwnPropertyDescriptor: (_target, prop) => {
    const d = Reflect.getOwnPropertyDescriptor(TABLES[current], prop);
    // The (empty) target has no own props, so the Proxy invariants require
    // every reported property to be configurable.
    return d && { ...d, configurable: true };
  },
});
