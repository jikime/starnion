---
title: 数据库
nav_order: 4
parent: 架构
---

# 数据库

Starnion 使用 **PostgreSQL 16** + **pgvector** 扩展作为主数据存储。文本数据和 768 维向量嵌入在同一数据库中管理，实现混合 RAG（向量相似度 + 全文搜索）。

---

## 完整模式概览

```
PostgreSQL 16 + pgvector
│
├── 认证与身份
│   ├── users                    # 中央用户表
│   ├── platform_identities      # 平台特定 ID 映射（Telegram、Web 等）
│   └── platform_link_codes      # 账户关联码（10分钟有效期）
│
├── 对话
│   ├── conversations            # 对话会话（包含 LangGraph thread_id）
│   └── messages                 # 对话消息（附件为 JSONB）
│
├── 财务
│   ├── finances                 # 消费追踪器交易
│   └── （预算：profiles.preferences JSONB）
│
├── 个人记录（含向量嵌入）
│   ├── daily_logs               # 日常日志和日记条目（vector 768）
│   ├── diary_entries            # 日记条目（vector 768）
│   ├── memos                    # 备忘录（vector 768）
│   ├── goals                    # 目标管理
│   ├── goal_checkins            # 目标打卡记录
│   └── ddays                    # 倒计时
│
├── 媒体与文档（含向量嵌入）
│   ├── documents                # 上传文档元数据
│   ├── document_sections        # 文档分块（vector 768）
│   ├── images                   # 图片画廊
│   └── audios                   # 音频画廊
│
├── 知识与搜索（含向量嵌入）
│   ├── knowledge_base           # 模式分析结果和知识（vector 768）
│   └── searches                 # 网络搜索历史（vector 768）
│
├── 设置与集成
│   ├── skills                   # 技能目录
│   ├── user_skills              # 每用户技能激活状态
│   ├── providers                # LLM 提供商设置
│   ├── personas                 # AI 角色
│   ├── google_tokens            # Google OAuth2 令牌
│   └── integration_keys         # 外部服务 API 密钥
│
├── 频道与通知
│   ├── channel_settings         # Telegram 频道设置
│   ├── telegram_approved_contacts  # Telegram 批准联系人
│   ├── telegram_pairing_requests   # Telegram 配对请求
│   └── notifications            # 通知历史
│
├── 使用量
│   └── usage_logs               # LLM token 使用日志
│
└── 元数据
    └── schema_migrations        # 模式版本管理
```

---

## 核心表详情

### users — 用户

所有用户数据的根表。支持电子邮件/密码认证和基于平台的认证。

```sql
CREATE TABLE users (
    id            TEXT        PRIMARY KEY,          -- UUID
    display_name  TEXT,
    email         TEXT        UNIQUE,               -- 仅电子邮件认证用户
    password_hash TEXT,                             -- bcrypt
    role          TEXT        DEFAULT 'user',       -- 'admin' | 'user'
    preferences   JSONB       DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### platform_identities — 平台 ID 映射

将来自各种平台（Telegram、Web、Discord 等）的用户 ID 映射到单个 `user_id`。

```sql
CREATE TABLE platform_identities (
    user_id        TEXT  REFERENCES users(id),
    platform       TEXT,       -- 'telegram' | 'web' | 'discord' | 'credential'
    platform_id    TEXT,       -- 平台内的唯一 ID（telegram chat_id、邮件地址等）
    display_name   TEXT,
    metadata       JSONB DEFAULT '{}',
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
```

### conversations / messages — 对话

与 LangGraph 的检查点系统集成。`thread_id` 与 LangGraph 对话状态关联。

```sql
CREATE TABLE conversations (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT    REFERENCES users(id),
    title      TEXT    DEFAULT 'New Conversation',
    platform   TEXT    DEFAULT 'web',   -- 'web' | 'telegram'
    thread_id  TEXT,                    -- LangGraph 线程 ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID  REFERENCES conversations(id),
    role            TEXT  CHECK (role IN ('user', 'assistant')),
    content         TEXT,
    attachments     JSONB,          -- 附件 URL 数组
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### finances — 消费追踪器

```sql
CREATE TABLE finances (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    amount      INTEGER,    -- 金额（韩元）。收入：正数，支出：负数
    category    TEXT,       -- 'food' | 'transport' | 'shopping' | 'income' | 等
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### daily_logs — 日常日志（向量嵌入）

将对话内容和日记条目存储为向量。对应四层 RAG 记忆的第一层。

```sql
CREATE TABLE daily_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    content     TEXT,
    sentiment   TEXT,           -- 'good' | 'neutral' | 'bad' | 'tired' | 'happy'
    embedding   vector(768),    -- Gemini text-embedding-004
    content_tsv tsvector,       -- 用于全文搜索（由触发器自动更新）
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 索引：快速近似最近邻搜索
CREATE INDEX ON daily_logs USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 全文搜索 GIN 索引
CREATE INDEX ON daily_logs USING gin(content_tsv);
```

### document_sections — 文档分块（向量嵌入）

存储上传文档的分块。对应四层 RAG 记忆的第三层。

```sql
CREATE TABLE document_sections (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT REFERENCES documents(id),
    content     TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB DEFAULT '{}'     -- 页码、位置等
);
```

### knowledge_base — 知识库（向量嵌入）

存储消费模式分析结果、用户偏好和个性化数据。对应四层 RAG 记忆的第二层。

```sql
CREATE TABLE knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    key         TEXT,   -- 知识类型（例如：'pattern_analysis'、'user_preference'）
    value       TEXT,   -- 知识内容
    source      TEXT,   -- 来源技能
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### skills / user_skills — 技能管理

```sql
CREATE TABLE skills (
    id                 TEXT PRIMARY KEY,    -- 技能 ID（例如：'finance'、'weather'）
    name               TEXT,
    description        TEXT,
    category           TEXT,
    emoji              TEXT DEFAULT '',
    tools              TEXT[] DEFAULT '{}', -- 技能提供的工具列表
    reports            TEXT[] DEFAULT '{}', -- 生成的报告类型
    cron_rules         TEXT[] DEFAULT '{}', -- Cron 计划规则
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

## 向量搜索（pgvector）

### 概述

pgvector 扩展用于存储 768 维嵌入向量并执行余弦相似度搜索。

- **嵌入模型**：Google `text-embedding-004`（768 维）
- **索引类型**：HNSW（分层导航小世界）
- **相似度函数**：余弦相似度（`<=>` 运算符）

### 使用向量的表

| 表 | 用途 | RAG 层 |
|----|------|--------|
| `daily_logs` | 对话和日记记忆搜索 | 第一层 |
| `knowledge_base` | 用户模式和偏好搜索 | 第二层 |
| `document_sections` | 上传文档内容搜索 | 第三层 |
| `diary_entries` | 日记语义搜索 | - |
| `memos` | 备忘录语义搜索 | - |
| `searches` | 网络搜索历史搜索 | - |

### match_logs 函数

Agent 记忆搜索中使用的向量相似度搜索函数。

```sql
SELECT * FROM match_logs(
    query_embedding := $1::vector,  -- 768 维查询向量
    match_threshold := 0.7,         -- 最小相似度阈值
    match_count     := 5,           -- 最多返回结果数
    p_user_id       := 'uuid...'
);
-- 返回：id、content、similarity（余弦相似度 0-1）
```

---

## 混合搜索

结合向量相似度搜索与 PostgreSQL 全文搜索。

```
用户查询："上周吃的食物"
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  pgvector 搜索          FTS 搜索
  （语义相似度）          （关键词匹配）
  embedding <=>          tsvector @@ tsquery
  query_vector           to_tsquery('simple', 'ate & food')
      │                    │
      └─────────┬──────────┘
                ▼
          合并并重新排序结果
          （向量相似度 + FTS 分数）
```

### tsvector 自动更新

在 INSERT/UPDATE 时，PostgreSQL 触发器自动更新 `content_tsv`。

```sql
-- 示例：daily_logs 触发器
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();
-- 内部：NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''))
```

同类触发器应用于 `knowledge_base`、`document_sections`、`diary_entries`、`memos` 和 `searches` 表。

---

## 模式版本管理

### 全新安装

使用 `docker/init.sql`。这是一次性创建整个模式的基线文件。

```bash
# 在 Docker 初始化时自动运行
docker compose up -d postgres
```

### 版本升级

按顺序应用 `docker/migrations/incremental/` 目录中的增量迁移文件。

```bash
# 示例：应用新迁移
psql $DATABASE_URL -f docker/migrations/incremental/031_new_feature.sql
```

当前应用的版本记录在 `schema_migrations` 表中。

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;
-- 1.0.0 | 2025-01-01 00:00:00+00
```

---

## 连接方式

### Gateway（Go）

使用 `database/sql` + `lib/pq` 驱动。

```
DATABASE_URL=postgres://user:pass@localhost:5432/starnion?sslmode=disable
```

### Agent（Python）

使用 `psycopg`（psycopg3）+ `psycopg-pool` 连接池。

```
DATABASE_URL=postgresql://user:pass@localhost:5432/starnion
```

LangGraph 检查点存储也使用同一个 PostgreSQL 实例（`langgraph-checkpoint-postgres`）。

---

## 数据隔离

每个用户的数据通过 `user_id` 外键完全隔离。一个用户无法访问另一个用户的数据，所有查询都包含 `WHERE user_id = $1` 条件。

---

## 性能注意事项

| 索引 | 目标表 | 用途 |
|------|--------|------|
| HNSW（m=16，ef=64） | `daily_logs`、`document_sections`、`knowledge_base`、`diary_entries`、`memos`、`searches` | 近似最近邻向量搜索 |
| GIN | 上述表中的 `content_tsv` 列 | 全文搜索 |
| B-tree | `user_id`、`created_at` 列 | 过滤和排序 |
| 复合索引 | `conversations(user_id, updated_at DESC)` | 对话列表检索 |

HNSW 参数：
- `m = 16`：每个节点的最大连接数（越高越准确，但内存占用更多）
- `ef_construction = 64`：索引构建期间的搜索范围（越高质量越好，构建时间越长）
