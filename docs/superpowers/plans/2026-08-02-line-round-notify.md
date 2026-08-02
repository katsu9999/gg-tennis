# LINE連携 Phase 1「ラウンド通知」計画書 (2026-08-02)

## 背景 (Katsuの要望)
- コート1・2とコート5が離れており、ラウンド終了・次の組み合わせを**声で伝えるのが大変**。
- メンバー全員がLINEユーザー。アプリを配るより**既存のLINEグループを再利用**してbotで通知するのがベスト。
- 将来的には勝敗もLINEで集めたい（→ Phase 2、本計画のスコープ外）。

## 確定要件 (2026-08-02 Katsu回答)
1. **スコープ**: 通知のみ。勝敗入力は今まで通りアプリ（Phase 2で検討）。
2. **送信UX**: ホストが「次ラウンド生成」した時に**確認ポップアップ**「LINEに送りますか？」→ OKで送信。
3. **送信先**: **既存のGGテニスLINEグループにbotを招待**。メンバー側の作業ゼロ。

## 技術方式
- **LINE Notifyは2025年に廃止済み** → LINE公式アカウント + **Messaging API** の一択。
- 無料枠 **200通/月**。グループへのpushは人数に関係なく1通カウント。
  実使用 ≈ 7ラウンド × 週1セッション ≈ **月30通** → 余裕。
- サーバーは **Supabase Edge Function**（既存プロジェクト内・追加費用ゼロ）。
  チャネルアクセストークンとgroupIdはFunction側のsecretsに保持（クライアントに露出させない）。

```
PWA(ホスト端末)                Edge Function              LINE
「次ラウンド生成」→ 確認OK ──→ line-notify ──push API──→ GGグループ
  {round, courts, resters}      (メッセージ整形+送信)     🎾 R3開始！...
```

## メッセージ例
```
🎾 R3 スタート！
コート1: 田中・佐藤 vs 山本・鈴木
コート2: 高橋・伊藤 vs 渡辺・中村
休憩: 高田
```
- 名前は`todayNumber`ではなく実名（クライアントがroster情報から整形して構造化データを送り、Function側でテキスト化）。
- セッション終了時の「お疲れさまでした＋勝敗サマリー」pushはオプション（同じFunctionで送れるので工数+30分。v1に含めるか実装時に判断）。

## 実装ステップ

### A. Katsuの一度きりセットアップ（約1時間・アカウント作成を伴うためKatsu作業）
1. [LINE Developers](https://developers.line.biz/) でプロバイダー＋Messaging APIチャネル作成
2. チャネルアクセストークン（long-lived）発行
3. botの「グループトーク参加を許可」をON
4. botをGGテニスのグループに招待
5. **groupId取得**: 一時的にwebhook URL（下記 line-webhook）を設定し、botがグループ参加した時のイベントログからgroupIdを拾う → 取得後webhookはOFF
6. Supabase secretsに `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_GROUP_ID` を設定

### B. コード（SKY実装・約半日）
1. `supabase/functions/line-notify/index.ts` — POST `{round, courts[], resters[]}` を受けてメッセージ整形→LINE push。簡易レート制限（同一IP 10req/分）。
2. `supabase/functions/line-webhook/index.ts` — groupId取得専用の使い捨てログ関数（セットアップ後は未使用）。
3. `src/data/line-notify-client.ts` — Function呼び出しの薄いクライアント（GGフレーバーのみ。ローカル版はno-opスタブ）。
4. `round.tsx` — 次ラウンド生成成功後に `appDialog.confirm("この組み合わせをLINEに送りますか？")` → OKでpush。失敗はalertのみ（ラウンド進行は止めない）。
5. i18n ja/en 追加。
6. テスト: Function整形ロジックのunit test＋UIダイアログ分岐テスト。

## セキュリティ・注意点
- Function URLを知る第三者がグループにスパム送信できるリスク → レート制限＋ペイロード形式検証で緩和（既存のanon書き込みと同じ信頼モデル。クラブ内部ツールとして許容）。
- 送信するのは名前＋組み合わせのみ（個人情報最小）。
- 無料枠超過時はpushが失敗するだけ（アプリ本体に影響なし）。

## ブランチ戦略（今回の教訓）
- 8/2の修正がPR #20同乗になった反省から、**先にPR #20をマージしてから** `feature/line-notify` をmainから切るのを推奨。
- migration 0009・0010のSQL Editor適用もPR #20マージ時に同時実施。

## スコープ外（Phase 2以降）
- LINEボタン（postback）での勝敗入力 → match_log反映
- 「全コート終わったよ」ボタンによるメンバー発の終了報告
- 自由文の読み取り（やらない。ボタン方式が堅実）
