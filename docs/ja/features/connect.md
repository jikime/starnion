---
title: 人脈管理
nav_order: 20
parent: 機能ガイド
grand_parent: 🇯🇵 日本語
---

# 人脈管理 (Connect)

## 概要

Starnion の **人脈管理 (Connect)** は単なるアドレス帳ではなく、**関係維持のためのアシスタント**です。名刺スキャン、アクティビティ記録、Gmail/Calendar からの自動取り込み、連絡周期アラート、ドリフト検知、Google 連絡先の一括インポートまで — 大切な人を「忘れずに丁寧に付き合う」ための流れを一画面に集約しています。

従来の CRM と違うのは **自動化** です。ミーティングやメールを毎回手動で記録する必要はありません。Starnion が裏で Gmail と Google Calendar からアクティビティを取り込み、夜間に関係スコアを再計算し、しばらく連絡していない相手を教えてくれます。

---

## 主な機能

| 機能 | 説明 |
|---|---|
| **PersonaCard** | 一画面で avatar・氏名・役職・会社・カテゴリ・連絡先・SNS・タグ・コンテキストメモ・名刺・アクティビティタイムラインを表示 |
| **名刺スキャン (OCR)** | 名刺画像をアップロードすると Gemini Vision がフィールドを抽出し、自動で人脈に登録 |
| **コンテキストメモ** | 「ベジタリアン、子ども 2 人、Next.js 好き」のような静的な人物情報(最大 4,096 文字) |
| **アクティビティタイムライン** | 「いつ何を一緒にしたか」のイベントログ — 手動記録と Gmail/Calendar からの自動取り込み |
| **Nion の提案** | ドリフト状態・直近アクティビティ件数・最終活動を組み合わせたデータ駆動の行動提案 |
| **コネクションスコア** | `0.45 × 直近度 + 0.35 × 頻度 + 0.20 × 重要度`、毎日 03:00 に再計算 |
| **リマインダー** | 目標連絡周期を過ぎた人脈一覧、経過日数の降順 |
| **ドリフト通知** | 毎日 09:00 Telegram サマリー「3 名と連絡が途絶えています…」 |
| **Google 連絡先インポート** | Google People API で一括取り込み、メール/電話で重複排除 |

---

## 人脈の登録

### 方法 1: 名刺スキャン

```
ユーザー: [名刺画像を添付]
AI:     名刺を解析しました。新しい人脈として登録しました。
        氏名: Kim Cheol-su
        会社: ACME Corp
        役職: Senior Engineer
        メール: kim@acme.com
        電話: +82-10-1234-5678
```

内部的には `connect-ocr` スキルが Gemini Vision で OCR → フィールド抽出 → `connections` テーブルに直接 INSERT します。元の画像は `business_card` JSONB カラムに URL で保存され、PersonaCard でプレビュー・拡大表示できます。

### 方法 2: 手動入力

Web UI `/connect` → 「新しい人脈を追加」ボタン → 氏名・メール・カテゴリ等を入力 → 保存。

### 方法 3: Google 連絡先の一括取り込み (Phase 3)

```
ユーザー: Google の連絡先を全部 Connect に取り込んで
AI:     Google アドレス帳で 142 件見つけました。1 件はすでに登録済みです。
        残りの 141 件を取り込みますか?
ユーザー: うん
AI:     141 件を Connect に取り込みました。
        人脈ページで 'google_contacts' タグで絞り込めます。
```

`connect-contacts-import` スキルが Google People API をページングして全連絡先を走査します。メール → 電話の順で既存人脈と重複チェックし、新規のみ `category=acquaintance`、`tags=['google_contacts']` で INSERT します。**一回限りのインポート**であり、定期的な双方向同期ではありません。

> **事前条件:** Google Workspace スキルに `contacts.readonly` スコープが必要です。2026-04 より前に連携したユーザーは `/skills` → Google Workspace → 切断 → 再接続で新スコープを承認してください。

---

## カテゴリと連絡目標周期

人脈は 4 つのカテゴリに分類されます:

| カテゴリ | 基本重要度 | 推奨連絡周期 |
|---|---|---|
| `family` | 0.9 | 2 週間 |
| `business` | 0.7 | 1 か月 |
| `friend` | 0.7 | 1 か月 |
| `acquaintance` | 0.4 | 3 か月 |

各人脈には `contact_frequency_target` (日単位) が設定され、これがドリフト判定とスコア計算の基準になります。

---

## コンテキストメモ

**静的な人物情報** を記録するテキストエリアです — 「ベジタリアン」「子ども: 小学生の娘・幼稚園の息子」「Next.js に興味」のような **変化が少ない事実** をまとめておきます。アクティビティタイムラインとは分離されています(メモ = プロフィール、タイムライン = イベントログ)。

チャットから直接編集することもできます:

```
ユーザー: Kim のメモに「ベジタリアン、サイクリング趣味」を追加して
AI:     Kim Cheol-su さんのメモに追記しました。
```

`connect-memo` スキルが `context_notes` カラムへの append/replace/clear 3 つのアクションをサポートします。最大長は 4,096 文字 (BR-CONTEXT-1)。

---

## アクティビティタイムライン (Phase 2)

**「いつ何を一緒にしたか」のイベントログ** です。手動記録と自動取り込みの 2 つの経路があり、PersonaCard の右側パネルに縦型タイムラインとして描画されます。

### 手動記録

PersonaCard → 「記録を追加」ボタン → カテゴリチップ(ミーティング/通話/食事/コラボ/メッセージ/その他)を選択 → 内容・日時(任意)・時間(任意) → 保存。

またはチャットから:

```
ユーザー: Kim と昨日ランチ食べた。COEX で 45 分ミーティング
AI:     Kim Cheol-su さんとの 4 月 12 日ランチの記録を追加しました。
```

`connect-activity` スキルが処理します。手動記録では `connections.last_contact_at` が自動的に更新されます (monotonic — 過去方向には戻らない)。

### 自動取り込み (Gmail + Google Calendar)

**cron または手動トリガー** で直近のメール/予定を人脈タイムラインに自動取り込みします。

- **Cron (`connect_activity_ingest`)**: 毎日 02:00 (デフォルト OFF、通知センターで ON)
- **手動トリガー**: 通知センター → 「人脈アクティビティ取り込み」 ▶ ボタン
- **スキル呼び出し**: `"カレンダーから人脈アクティビティを取り込んで"`

### マッチング戦略

各メール/予定について:

1. **1 次: メールマッチング** — `From:`/`To:`/`Cc:`/`attendees[].email` → `connections.email`
2. **2 次: 名前マッチング** — メールで見つからない場合、`Subject` / `event.summary` に連絡先の名前(2 文字以上)が部分文字列として含まれるかチェック

例: 「Kim Cheol-su とミーティング」という参加者なしの個人予定でも、名前マッチングで `Kim Cheol-su` に紐付きます。

### フィルタ

- `noreply@`、`notifications@`、`alerts@` などの自動送信者を除外
- 受信者数 20 を超える(メーリングリスト)予定/メールを除外
- 重み減衰: `1 / sqrt(participant_count)` — 1:1 ミーティング = 1.0、4 人 = 0.5、16 人 = 0.25
- 未来の予定は **タイムラインに表示されるが** `last_contact_at` は更新されない (ドリフト検知の整合性を保護)

### 種別ごとの色

タイムラインの bullet は種別ごとに色分けされます:

- 🔵 メール (`email`, sky-400)
- 🟢 予定 (`calendar`, emerald-400)
- 🟣 手動 (`manual`, violet-400)
- 🔷 Telegram (`telegram`, cyan-400)

---

## Nion の提案

PersonaCard 上部の **データ駆動サマリーボックス** です。直近アクティビティ + ドリフト状態 + カテゴリの深刻度を組み合わせて、一文の行動提案を生成します。LLM 呼び出しなし、100% クライアント側計算。

```
✨ NION の提案
27 日間連絡なし (目標 30 日)
直近 90 日: 📧 メール 4  📅 予定 1
最終活動: 3 日前 · ミーティング (45 分)
─────────────────────────────
→ そろそろ定期連絡の時期です。先に一言送ってみましょう。
```

カテゴリ × ドリフトの深刻度マトリクスで 9 種類のメッセージから自動選択します:

- **family** (家族) → 深刻度 1 から強めの口調
- **business / friend / acquaintance** → 1→2→3 の段階で徐々に強くなる
- **正常 (healthy)** → 「定期的に連絡が取れています 👍」
- **未連絡** → 「最初のひと言を送ってみましょう」

---

## コネクションスコア

関係の健康度を 0.0 〜 1.0 で表す数値です。毎日 03:00 に `connect_score_recompute` cron が再計算します。

**数式** (architecture-design.md §D):

```
score = 0.45 × recency + 0.35 × frequency + 0.20 × importance

recency    = exp(-days_since_contact / (2 × target_interval))
frequency  = min(1, activity_weight_90d / (90 / target_interval))
importance = category_base[category] + tag_boost
```

- **recency**: 目標周期内の連絡で 1.0 に近く、2 倍経過で 0.37
- **frequency**: 直近 90 日の重み付きアクティビティ数 / 期待値
- **importance**: family 0.9、business/friend 0.7、acquaintance 0.4

変動幅が 0.005 未満の場合は DB 書き込みをスキップし、cron の負荷を最小化します。

---

## リマインダー (ドリフト検知)

### リマインダーパネル

`/connect` → 右ペイン上部のトグル → 「リマインダー」 を選択。

`last_contact_at + contact_frequency_target < NOW()` を満たす人脈を **経過日数の降順** で表示します。各行をクリックすると該当の PersonaCard に切り替わります。

### ドリフト通知 (Cron)

- **Job**: `connect_drift_reminder` (毎日 09:00、デフォルト OFF)
- **チャネル**: Telegram (連携済みの場合)
- **内容**: 「3 名と連絡が途絶えています: Kim、Park、Lee。人脈ページで確認してください。」
- **上位 3 名** のみ明示、残りは 「外 N 名」形式
- **重複排除**: 1 日 1 回 (重複通知を防止)

リマインダーパネルとドリフト通知は **同じクエリ** (`ListDriftingConnections`) を別チャネルに出力する構造です。互いに依存せず、cron が OFF でもパネルは常にライブで動作します。

---

## Cron 一覧

通知センター (`/cron`) で個別にトグル可能な 3 つのシステムジョブ:

| Job ID | 時刻 | アクション | デフォルト | 説明 |
|---|---|---|---|---|
| `connect_activity_ingest` | 02:00 | maintenance | OFF | Gmail + Calendar → 人脈アクティビティ自動取り込み |
| `connect_score_recompute` | 03:00 | maintenance | OFF | コネクションスコアの再計算 |
| `connect_drift_reminder` | 09:00 | smart_notify | OFF | Telegram によるドリフト通知 |

すべて **デフォルト OFF** (opt-in) です — ユーザーが `/cron` ページで明示的に ON にする必要があります。 ▶ トリガーボタンで即座に 1 回実行することも可能です。

---

## 4 つの Connect スキル

| スキル | 用途 |
|---|---|
| `connect-ocr` | 名刺画像 → OCR → 新しい人脈を作成 |
| `connect-memo` | コンテキストメモの add / replace / clear |
| `connect-activity` | アクティビティタイムラインの find / add / list / delete + Gmail/Calendar 同期 |
| `connect-contacts-import` | Google 連絡先の一括インポート (preview / import) |

すべて Python psycopg2 で直接 DB に書き込み、BR-AUTH-1 に従い `WHERE user_id = %s` で厳格に分離されます。BR-SOCIAL-3 により `social_profiles` は OCR / Contacts import 経路では **絶対に書き込みません** (LinkedIn URL は Web UI からの手動入力のみ)。

---

## ビジネスルール一覧

| ルール | 内容 |
|---|---|
| BR-AUTH-1 | 全クエリが `user_id` スコープ — 他ユーザーのデータにアクセス不可 |
| BR-CAT-1 | カテゴリは `family / friend / business / acquaintance` のいずれか (case-sensitive) |
| BR-TAG-1 | タグは最大 16 個、各 32 文字、大文字小文字を無視した重複排除 |
| BR-CONTEXT-1 | コンテキストメモは最大 4,096 文字 |
| BR-SOCIAL-1 | `social_profiles` のキーは facebook / instagram / x / linkedin / threads の 5 種のみ |
| BR-SOCIAL-2 | PATCH は merge-patch セマンティクス (nil 値 = キー削除) |
| BR-SOCIAL-3 | OCR / import 経路は `social_profiles` に絶対に書き込まない |
| BR-SCORE-1 | `connection_score` はサーバ所有 — PATCH で設定できない |
| BR-109-1 | `last_contact_at` は monotonic — 過去に戻らない、`NOW() + 60s` 超過は拒否 |

---

## トラブルシューティング

### 「Google 認証が切れたのに自動更新されない」

v0.4.0 より前のバージョンでは starnion_utils の `decrypt_value` が gateway が書き込む v2 暗号化フォーマットを読めない問題がありました。v0.4.0 にアップグレードして gateway を再起動すれば解決します。

### 「カレンダー予定がタイムラインに取り込まれない」

2 点確認してください:

1. **ウィンドウ**: cron は過去 7 日 + 未来 14 日のみスキャンします。それより広い範囲は手動スキル呼び出しで `sync --days 90` を使用。
2. **マッチング**: 予定に参加者 (`attendees`) がない場合、**名前マッチング** にフォールバックします — タイトルに人脈の名前が含まれている必要があります。両方失敗すると個人の todo とみなされてスキップされます。

### 「リマインダーパネルが空です」

正常な状態の可能性があります。目標周期を超えた人脈がない場合は「定期的に連絡が取れています 👍」の空表示になります。テストするには:

```sql
UPDATE connections SET last_contact_at = NOW() - INTERVAL '60 days'
WHERE name = '...' AND user_id = '...';
```

### 「スコアが更新されません」

`connect_score_recompute` cron が OFF の可能性があります。`/cron` ページで ON にするか、▶ トリガーボタンで即座に 1 回実行してください。

---

## 関連リンク

- [スキル](../skills.md) — connect-ocr / connect-memo / connect-activity / connect-contacts-import の詳細
- [通知 & スケジュール](schedules.md) — cron システムジョブの設定
- [アーキテクチャ](../architecture.md) — Clean Architecture とドメインモデル
