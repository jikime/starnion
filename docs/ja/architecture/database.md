---
title: データベース
nav_order: 4
parent: アーキテクチャ
---

# データベース

Starnionは**PostgreSQL 16** + **pgvector**拡張機能を主要なデータストアとして使用しています。テキストデータと768次元のベクター埋め込みが同じデータベースで管理され、ハイブリッドRAG（ベクター類似性 + 全文検索）を実現しています。

---

## 完全なスキーマの概要

```
PostgreSQL 16 + pgvector
│
├── 認証とID
│   ├── users                    # 中央ユーザーテーブル
│   ├── platform_identities      # プラットフォーム固有のIDマッピング（Telegram、ウェブなど）
│   └── platform_link_codes      # アカウントリンクコード（10分TTL）
│
├── 会話
│   ├── conversations            # 会話セッション（LangGraph thread_idを含む）
│   └── messages                 # 会話メッセージ（添付ファイルはJSONB）
│
├── 財務管理
│   ├── finances                 # 費用管理の取引
│   └── （予算：profiles.preferences JSONB）
│
├── 個人記録（ベクター埋め込み付き）
│   ├── daily_logs               # デイリーログと日記エントリ（vector 768）
│   ├── diary_entries            # 日記エントリ（vector 768）
│   ├── memos                    # メモ（vector 768）
│   ├── goals                    # 目標管理
│   ├── goal_checkins            # 目標チェックイン記録
│   └── ddays                    # Dデイ
│
├── メディアとドキュメント（ベクター埋め込み付き）
│   ├── documents                # アップロードされたドキュメントのメタデータ
│   ├── document_sections        # ドキュメントチャンク（vector 768）
│   ├── images                   # 画像ギャラリー
│   └── audios                   # 音声ギャラリー
│
├── ナレッジと検索（ベクター埋め込み付き）
│   ├── knowledge_base           # パターン分析結果とナレッジ（vector 768）
│   └── searches                 # ウェブ検索履歴（vector 768）
│
├── 設定と連携
│   ├── skills                   # スキルカタログ
│   ├── user_skills              # ユーザーごとのスキル有効化状態
│   ├── providers                # LLMプロバイダー設定
│   ├── personas                 # AIペルソナ
│   ├── google_tokens            # Google OAuth2トークン
│   └── integration_keys         # 外部サービスAPIキー
│
├── チャンネルと通知
│   ├── channel_settings         # Telegramチャンネル設定
│   ├── telegram_approved_contacts  # Telegram承認済み連絡先
│   ├── telegram_pairing_requests   # Telegramペアリングリクエスト
│   └── notifications            # 通知履歴
│
├── 使用状況
│   └── usage_logs               # LLMトークン使用ログ
│
└── メタ
    └── schema_migrations        # スキーマバージョン管理
```

---

## コアテーブルの詳細

### users — ユーザー

すべてのユーザーデータのルートテーブル。メール/パスワード認証とプラットフォームベース認証の両方をサポートします。

```sql
CREATE TABLE users (
    id            TEXT        PRIMARY KEY,          -- UUID
    display_name  TEXT,
    email         TEXT        UNIQUE,               -- メール認証ユーザーのみ
    password_hash TEXT,                             -- bcrypt
    role          TEXT        DEFAULT 'user',       -- 'admin' | 'user'
    preferences   JSONB       DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### platform_identities — プラットフォームIDマッピング

さまざまなプラットフォーム（Telegram、ウェブ、Discordなど）のユーザーIDを単一の `user_id` にマッピングします。

```sql
CREATE TABLE platform_identities (
    user_id        TEXT  REFERENCES users(id),
    platform       TEXT,       -- 'telegram' | 'web' | 'discord' | 'credential'
    platform_id    TEXT,       -- プラットフォーム内のユニークID（telegram chat_id、メールなど）
    display_name   TEXT,
    metadata       JSONB DEFAULT '{}',
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
```

### conversations / messages — 会話

LangGraphのチェックポイントシステムと連携します。`thread_id` はLangGraphの会話状態にリンクされています。

```sql
CREATE TABLE conversations (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT    REFERENCES users(id),
    title      TEXT    DEFAULT 'New Conversation',
    platform   TEXT    DEFAULT 'web',   -- 'web' | 'telegram'
    thread_id  TEXT,                    -- LangGraphスレッドID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID  REFERENCES conversations(id),
    role            TEXT  CHECK (role IN ('user', 'assistant')),
    content         TEXT,
    attachments     JSONB,          -- 添付ファイルURLの配列
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### finances — 費用管理

```sql
CREATE TABLE finances (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    amount      INTEGER,    -- 金額（円）。収入：正、支出：負
    category    TEXT,       -- 'food' | 'transport' | 'shopping' | 'income' | など
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### daily_logs — デイリーログ（ベクター埋め込み）

会話内容と日記エントリをベクターとして保存します。4層RAGメモリのレイヤー1に対応します。

```sql
CREATE TABLE daily_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    content     TEXT,
    sentiment   TEXT,           -- 'good' | 'neutral' | 'bad' | 'tired' | 'happy'
    embedding   vector(768),    -- Gemini text-embedding-004
    content_tsv tsvector,       -- 全文検索用（トリガーで自動更新）
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSWインデックス：高速な近似最近傍探索
CREATE INDEX ON daily_logs USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 全文検索GINインデックス
CREATE INDEX ON daily_logs USING gin(content_tsv);
```

### document_sections — ドキュメントチャンク（ベクター埋め込み）

アップロードされたドキュメントをチャンクに分割して保存します。4層RAGメモリのレイヤー3に対応します。

```sql
CREATE TABLE document_sections (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT REFERENCES documents(id),
    content     TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB DEFAULT '{}'     -- ページ番号、位置など
);
```

### knowledge_base — ナレッジベース（ベクター埋め込み）

支出パターン分析結果、ユーザーの好み、パーソナライズデータを保存します。4層RAGメモリのレイヤー2に対応します。

```sql
CREATE TABLE knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    key         TEXT,   -- ナレッジタイプ（例：'pattern_analysis'、'user_preference'）
    value       TEXT,   -- ナレッジコンテンツ
    source      TEXT,   -- ソーススキル
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### skills / user_skills — スキル管理

```sql
CREATE TABLE skills (
    id                 TEXT PRIMARY KEY,    -- スキルID（例：'finance'、'weather'）
    name               TEXT,
    description        TEXT,
    category           TEXT,
    emoji              TEXT DEFAULT '',
    tools              TEXT[] DEFAULT '{}', -- スキルが提供するツールのリスト
    reports            TEXT[] DEFAULT '{}', -- 生成されるレポートの種類
    cron_rules         TEXT[] DEFAULT '{}', -- Cronスケジュールルール
    enabled_by_default BOOLEAN DEFAULT TRUE,
    permission_level   INT DEFAULT 1,
    sort_order         INT DEFAULT 0,
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_skills (
    user_id    TEXT,
    skill_id   TEXT REFERENCES skills(id),
    enabled    BOOLEAN,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);
```

---

## ベクター検索（pgvector）

### 概要

pgvector拡張機能を使用して、768次元の埋め込みベクターを保存してコサイン類似性検索を実行します。

- **埋め込みモデル**：Google `text-embedding-004`（768次元）
- **インデックスタイプ**：HNSW（Hierarchical Navigable Small World）
- **類似性関数**：コサイン類似性（`<=>` 演算子）

### ベクターを使用するテーブル

| テーブル | 目的 | RAGレイヤー |
|---------|------|-----------|
| `daily_logs` | 会話と日記のメモリ検索 | レイヤー1 |
| `knowledge_base` | ユーザーパターンと好みの検索 | レイヤー2 |
| `document_sections` | アップロードされたドキュメントコンテンツの検索 | レイヤー3 |
| `diary_entries` | 日記のセマンティック検索 | - |
| `memos` | メモのセマンティック検索 | - |
| `searches` | ウェブ検索履歴の検索 | - |

### match_logs関数

Agentのメモリ検索で使用されるベクター類似性検索関数。

```sql
SELECT * FROM match_logs(
    query_embedding := $1::vector,  -- 768次元のクエリベクター
    match_threshold := 0.7,         -- 最小類似性閾値
    match_count     := 5,           -- 返す最大結果数
    p_user_id       := 'uuid...'
);
-- 返値：id、content、similarity（コサイン類似性0〜1）
```

---

## ハイブリッド検索

ベクター類似性検索とPostgreSQL全文検索を組み合わせます。

```
ユーザークエリ：「先週食べたもの」
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  pgvector検索          FTS検索
  （セマンティック類似性）  （キーワードマッチング）
  embedding <=>         tsvector @@ tsquery
  query_vector          to_tsquery('simple', '食べた & 食')
      │                    │
      └─────────┬──────────┘
                ▼
          結果のマージと再ランキング
          （ベクター類似性 + FTSスコア）
```

### tsvectorの自動更新

INSERT/UPDATE時に、PostgreSQLトリガーが自動的に `content_tsv` を更新します。

```sql
-- 例：daily_logsのトリガー
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();
-- 内部的に：NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''))
```

同じ種類のトリガーが `knowledge_base`、`document_sections`、`diary_entries`、`memos`、`searches` テーブルにも適用されます。

---

## スキーマバージョン管理

### 新規インストール

`docker/init.sql` を使用します。これはスキーマ全体を一度に作成するベースラインファイルです。

```bash
# Dockerの初期化時に自動的に実行されます
docker compose up -d postgres
```

### バージョンアップグレード

`docker/migrations/incremental/` ディレクトリからインクリメンタルなマイグレーションファイルを順番に適用します。

```bash
# 例：新しいマイグレーションを適用
psql $DATABASE_URL -f docker/migrations/incremental/031_new_feature.sql
```

現在適用されているバージョンは `schema_migrations` テーブルに記録されています。

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;
-- 1.0.0 | 2025-01-01 00:00:00+00
```

---

## 接続方法

### Gateway (Go)

`database/sql` + `lib/pq` ドライバーを使用します。

```
DATABASE_URL=postgres://user:pass@localhost:5432/starnion?sslmode=disable
```

### Agent (Python)

`psycopg` (psycopg3) + `psycopg-pool` 接続プールを使用します。

```
DATABASE_URL=postgresql://user:pass@localhost:5432/starnion
```

LangGraphチェックポイントストアも同じPostgreSQLインスタンスを使用します（`langgraph-checkpoint-postgres`）。

---

## データの分離

各ユーザーのデータは `user_id` 外部キーによって完全に分離されています。あるユーザーが別のユーザーのデータにアクセスすることはできず、すべてのクエリに `WHERE user_id = $1` 条件が含まれます。

---

## パフォーマンスに関する考慮事項

| インデックス | 対象テーブル | 目的 |
|-----------|-----------|------|
| HNSW (m=16, ef=64) | `daily_logs`、`document_sections`、`knowledge_base`、`diary_entries`、`memos`、`searches` | 近似最近傍ベクター検索 |
| GIN | 上記テーブルの `content_tsv` カラム | 全文検索 |
| B-tree | `user_id`、`created_at` カラム | フィルタリングとソート |
| 複合インデックス | `conversations(user_id, updated_at DESC)` | 会話リストの取得 |

HNSWパラメータ：
- `m = 16`：ノードごとの最大接続数（高いほど精度が上がるがメモリを消費）
- `ef_construction = 64`：インデックス構築中の検索スコープ（高いほど品質が向上するが構築時間が長くなる）
