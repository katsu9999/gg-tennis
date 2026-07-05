export const PRIVACY_JA = `# プライバシーノーティス

最終更新: 2026-05-25

## 1. データ管理者
Golders Green テニスクラブ — 連絡先: admin@example.com

## 2. 集めるデータと用途
- **会員名**: クラブ運営・コート割り振り・履歴・ランキング表示
- **幹事のメールアドレス**: マジックリンク認証
- **RSVP（出欠と任意メモ）**: 出席集計・コート計画
- **試合結果・ラウンド履歴**: ランキング算出

特別カテゴリーデータ（健康・宗教・政治信条等）は扱いません。

## 3. 法的根拠
**正当な利益（Legitimate Interest）** — クラブ運営に不可欠な処理。

## 4. 保管場所
- **データ**: Supabase（EU/UK リージョン — London）
- **ホスティング**: GitHub Pages（コードのみ・個人データなし）

## 5. 保管期間
在籍中は保持。退会時はハードデリート要請で削除可能。

## 6. あなたの権利
アクセス権、訂正権、**削除権（"忘れられる権利"）**、**データポータビリティ**、監督当局（UK ICO）への苦情申し立て権。

削除・エクスポート要請は admin@example.com にご連絡ください（数日以内に対応）。

## 7. 第三者処理者
- **Supabase**（クラウドDB） — GDPR-ready DPA
- **GitHub Pages**（静的配信） — GDPR Statement

## 8. クッキー
トラッキングクッキー不使用。認証トークンは LocalStorage（"strictly necessary"）のみ。クッキーバナーは PECR/ePrivacy 上必要ありません。

## 9. 連絡先
admin@example.com
`;

export const PRIVACY_EN = `# Privacy Notice

Last updated: 2026-05-25

## 1. Data Controller
Golders Green Tennis Club — Contact: admin@example.com

## 2. Data we collect and why
- **Member names**: club operation, court assignment, history, rankings
- **Admin email addresses**: magic-link authentication
- **RSVPs (status + optional note)**: attendance forecasting, court planning
- **Match results & round history**: ranking computation

No special-category data (health, religion, etc.) is processed.

## 3. Lawful basis
**Legitimate Interest** — necessary for running the club.

## 4. Storage
- **Data**: Supabase (EU/UK region — London)
- **Hosting**: GitHub Pages (code only, no personal data)

## 5. Retention
Held while a member. On departure, hard-delete on request.

## 6. Your rights
Access, rectification, **erasure ("right to be forgotten")**, **data portability**, and the right to complain to the UK ICO.

Contact admin@example.com for deletion or export.

## 7. Sub-processors
- **Supabase** (cloud DB) — GDPR-ready DPA
- **GitHub Pages** (static hosting) — GDPR Statement

## 8. Cookies
No tracking cookies. Auth tokens use LocalStorage ("strictly necessary"). No PECR/ePrivacy cookie banner required.

## 9. Contact
admin@example.com
`;

/** Local (device-only) flavour — shipped to Google Play as "Court Shuffle".
 *  Also published as a static page on the GG Pages deploy for the Play
 *  listing's privacy-policy URL (Phase 5). */
export const PRIVACY_LOCAL_EN = `# Privacy Notice — Court Shuffle

## 1. The short version
Court Shuffle collects **no data**. Everything you enter stays on your device.

## 2. What is stored, and where
- Player names, venues, sessions, and pairing history are stored **only in this app's local storage on your device** (IndexedDB).
- Nothing is sent to any server. The app makes **no network requests** and works fully offline.
- There are no accounts, no sign-in, no analytics, no ads, and no tracking of any kind.

## 3. Your control
- **Export**: Settings → JSON export saves a full copy of your data as a file you own.
- **Delete**: Settings → Delete all data erases everything instantly. Uninstalling the app does the same.

## 4. Player names
Names you type in are visible only to you, on your device. As the session organizer, it is your responsibility to use names your players are comfortable with (initials work fine).

## 5. Contact
For questions about this notice, contact the developer via the app's Google Play listing page.
`;
