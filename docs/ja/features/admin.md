---
title: 管理ツール
nav_order: 13
parent: 機能ガイド
grand_parent: 🇯🇵 日本語
---

# 管理ツール

## 概要

Starnionは、サーバー管理者がユーザーアカウントとデータベースマイグレーションをターミナルから直接管理するためのCLIコマンドを提供します。

---

## starnion users -- ユーザーアカウント管理

`starnion users` コマンドグループは、PostgreSQLに直接アクセスしてユーザーアカウントを管理します。**ログイン不要** -- `~/.starnion/config.yaml` に有効なデータベース接続が設定されている必要があります。

### ユーザー一覧

```bash
starnion users list
```

出力例：

```
══════════════════════════════════ USERS ═══════════════════════════════════════

  ID        EMAIL                  NAME          ROLE    CREATED
  ──────    ─────────────────────  ────────────  ─────   ──────────
  a1b2c3    admin@example.com      Admin         admin   2024-01-15
  d4e5f6    user@example.com       John Doe      user    2024-02-01

  Total: 2 users
```

### ユーザー追加

```bash
starnion users add \
  --email user@example.com \
  --password "StrongPassword123!" \
  --name "John Doe"

# 管理者権限を付与
starnion users add \
  --email admin@example.com \
  --password "AdminPass!" \
  --name "System Admin" \
  --admin
```

| フラグ | 必須 | 説明 |
|--------|------|------|
| `--email` | はい | メールアドレス（一意である必要あり） |
| `--password` | はい | 初期パスワード |
| `--name` | はい | 表示名 |
| `--admin` | いいえ | 管理者ロールを付与（デフォルト：一般ユーザー） |

### ユーザー削除

```bash
starnion users remove user@example.com
```

確認プロンプトが表示されます。`yes` と入力して削除を実行します。

> **警告**: アカウントに関連するすべてのデータ（会話、メモ、日記など）が完全に削除されます。

### パスワードリセット

```bash
starnion users reset-password user@example.com
```

新しいパスワードを入力するためのセキュアプロンプトが表示されます（入力はターミナルに表示されません）。

---

## starnion db -- データベースマイグレーション

`starnion db` コマンドグループは、データベーススキーマバージョンを管理します。`schema_migrations` テーブルを使用して、適用済みのマイグレーションを追跡します。

### マイグレーション適用

```bash
starnion db migrate
```

`gateway/internal/cli/migrations/incremental/` 内のすべての `.sql` ファイルをファイル名順に実行します。適用済みのファイルはスキップされます。

出力例：

```
  · v1.1.0-add-search-index.sql already applied
  ✓ v1.2.0-add-usage-logs.sql applied

  Migration complete: 1 applied, 1 skipped
```

### マイグレーションステータス確認

```bash
starnion db status
```

出力例：

```
══════════════════════════ MIGRATION STATUS ════════════════════════════════════

  ✓ v1.0.0 (baseline)          [applied 2024-01-15 10:30:00]
  ✓ v1.1.0-add-search-index    [applied 2024-02-01 14:22:10]
  · v1.2.0-add-usage-logs      [pending]
```

### 新しいマイグレーションファイルの追加

1. `gateway/internal/cli/migrations/incremental/` に `.sql` ファイルを作成
2. バージョンプレフィックスを使用（ファイル名のソート順で実行されます）：

   ```
   v1.2.0-add-usage-logs.sql
   v1.2.1-add-audit-table.sql
   ```

3. `starnion db migrate` で適用
4. `starnion db status` で確認

---

## ドキュメント処理キュー（バックグラウンドキュー）

大きなドキュメント（500 KB以上）の解析と埋め込みは、gRPCハンドラーのタイムアウトを防ぐため**バックグラウンドキュー**で処理されます。

### 仕組み

```
parse_document 呼び出し
  ↓
ファイルサイズチェック
  ├── < 500 KB → 同期処理 → 結果を返す
  └── ≥ 500 KB → キューに追加 → task_id を返す
                     ↓
               バックグラウンドワーカー（最大2並列）
                     ↓
               Docling解析 + 埋め込み + DB保存
```

### ステータス確認（AIツール）

大きなドキュメントをアップロードした後、返された `task_id` で進捗を確認できます：

```
check_document_status('<task_id>')
```

ステータス値：

| ステータス | 意味 |
|-----------|------|
| `pending` | 待機中（未開始） |
| `processing` | 処理中（Docling解析 + 埋め込み） |
| `done` | 完了（NセクションがベクターDBに保存済み） |
| `error` | 失敗（エラーメッセージ付き） |

### 設定

```bash
# 並列ワーカー数（デフォルト：2）
DOC_QUEUE_WORKERS=3
```

> DoclingはCPU集約的です。ワーカー数を多くしすぎると、CPU競合が発生し、かえって処理が遅くなる可能性があります。
