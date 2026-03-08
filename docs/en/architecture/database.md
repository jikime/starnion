---
title: Database
nav_order: 4
parent: Architecture
---

# Database

Starnion uses **PostgreSQL 16** + the **pgvector** extension as its primary data store. Text data and 768-dimensional vector embeddings are managed in the same database, implementing a hybrid RAG (vector similarity + full-text search).

---

## Full Schema Overview

```
PostgreSQL 16 + pgvector
│
├── Auth & Identity
│   ├── users                    # Central user table
│   ├── platform_identities      # Platform-specific ID mapping (Telegram, web, etc.)
│   └── platform_link_codes      # Account link codes (10-minute TTL)
│
├── Conversations
│   ├── conversations            # Conversation sessions (includes LangGraph thread_id)
│   └── messages                 # Conversation messages (attachments as JSONB)
│
├── Finance
│   ├── finances                 # Expense tracker transactions
│   └── (budget: profiles.preferences JSONB)
│
├── Personal Records (with vector embeddings)
│   ├── daily_logs               # Daily logs and diary entries (vector 768)
│   ├── diary_entries            # Diary entries (vector 768)
│   ├── memos                    # Memos (vector 768)
│   ├── goals                    # Goal management
│   ├── goal_checkins            # Goal check-in records
│   └── ddays                    # D-Days
│
├── Media & Documents (with vector embeddings)
│   ├── documents                # Uploaded document metadata
│   ├── document_sections        # Document chunks (vector 768)
│   ├── images                   # Image gallery
│   └── audios                   # Audio gallery
│
├── Knowledge & Search (with vector embeddings)
│   ├── knowledge_base           # Pattern analysis results and knowledge (vector 768)
│   └── searches                 # Web search history (vector 768)
│
├── Settings & Integrations
│   ├── skills                   # Skill catalog
│   ├── user_skills              # Per-user skill activation state
│   ├── providers                # LLM provider settings
│   ├── personas                 # AI personas
│   ├── google_tokens            # Google OAuth2 tokens
│   └── integration_keys         # External service API keys
│
├── Channels & Notifications
│   ├── channel_settings         # Telegram channel settings
│   ├── telegram_approved_contacts  # Telegram approved contacts
│   ├── telegram_pairing_requests   # Telegram pairing requests
│   └── notifications            # Notification history
│
├── Usage
│   └── usage_logs               # LLM token usage logs
│
└── Meta
    └── schema_migrations        # Schema version management
```

---

## Core Table Details

### users — Users

The root table for all user data. Supports both email/password authentication and platform-based authentication.

```sql
CREATE TABLE users (
    id            TEXT        PRIMARY KEY,          -- UUID
    display_name  TEXT,
    email         TEXT        UNIQUE,               -- Email auth users only
    password_hash TEXT,                             -- bcrypt
    role          TEXT        DEFAULT 'user',       -- 'admin' | 'user'
    preferences   JSONB       DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### platform_identities — Platform ID Mapping

Maps user IDs from various platforms (Telegram, web, Discord, etc.) to a single `user_id`.

```sql
CREATE TABLE platform_identities (
    user_id        TEXT  REFERENCES users(id),
    platform       TEXT,       -- 'telegram' | 'web' | 'discord' | 'credential'
    platform_id    TEXT,       -- Unique ID within the platform (telegram chat_id, email, etc.)
    display_name   TEXT,
    metadata       JSONB DEFAULT '{}',
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
```

### conversations / messages — Conversations

Integrates with LangGraph's checkpoint system. `thread_id` is linked to the LangGraph conversation state.

```sql
CREATE TABLE conversations (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT    REFERENCES users(id),
    title      TEXT    DEFAULT 'New Conversation',
    platform   TEXT    DEFAULT 'web',   -- 'web' | 'telegram'
    thread_id  TEXT,                    -- LangGraph thread ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID  REFERENCES conversations(id),
    role            TEXT  CHECK (role IN ('user', 'assistant')),
    content         TEXT,
    attachments     JSONB,          -- Array of attachment URLs
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### finances — Expense Tracker

```sql
CREATE TABLE finances (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    amount      INTEGER,    -- Amount in KRW. Income: positive, Expense: negative
    category    TEXT,       -- 'food' | 'transport' | 'shopping' | 'income' | etc.
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### daily_logs — Daily Logs (Vector Embeddings)

Stores conversation content and diary entries as vectors. This corresponds to Layer 1 of the 4-Layer RAG memory.

```sql
CREATE TABLE daily_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    content     TEXT,
    sentiment   TEXT,           -- 'good' | 'neutral' | 'bad' | 'tired' | 'happy'
    embedding   vector(768),    -- Gemini text-embedding-004
    content_tsv tsvector,       -- For full-text search (auto-updated by trigger)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index: fast approximate nearest neighbor search
CREATE INDEX ON daily_logs USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Full-text search GIN index
CREATE INDEX ON daily_logs USING gin(content_tsv);
```

### document_sections — Document Chunks (Vector Embeddings)

Stores uploaded documents split into chunks. This corresponds to Layer 3 of the 4-Layer RAG memory.

```sql
CREATE TABLE document_sections (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT REFERENCES documents(id),
    content     TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB DEFAULT '{}'     -- Page number, position, etc.
);
```

### knowledge_base — Knowledge Base (Vector Embeddings)

Stores spending pattern analysis results, user preferences, and personalization data. This corresponds to Layer 2 of the 4-Layer RAG memory.

```sql
CREATE TABLE knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    key         TEXT,   -- Knowledge type (e.g., 'pattern_analysis', 'user_preference')
    value       TEXT,   -- Knowledge content
    source      TEXT,   -- Source skill
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### skills / user_skills — Skill Management

```sql
CREATE TABLE skills (
    id                 TEXT PRIMARY KEY,    -- Skill ID (e.g., 'finance', 'weather')
    name               TEXT,
    description        TEXT,
    category           TEXT,
    emoji              TEXT DEFAULT '',
    tools              TEXT[] DEFAULT '{}', -- List of tools provided by the skill
    reports            TEXT[] DEFAULT '{}', -- Types of reports generated
    cron_rules         TEXT[] DEFAULT '{}', -- Cron schedule rules
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

## Vector Search (pgvector)

### Overview

The pgvector extension is used to store 768-dimensional embedding vectors and perform cosine similarity searches.

- **Embedding model**: Google `text-embedding-004` (768 dimensions)
- **Index type**: HNSW (Hierarchical Navigable Small World)
- **Similarity function**: Cosine similarity (`<=>` operator)

### Tables Using Vectors

| Table | Purpose | RAG Layer |
|-------|---------|-----------|
| `daily_logs` | Conversation and diary memory search | Layer 1 |
| `knowledge_base` | User pattern and preference search | Layer 2 |
| `document_sections` | Uploaded document content search | Layer 3 |
| `diary_entries` | Diary semantic search | - |
| `memos` | Memo semantic search | - |
| `searches` | Web search history search | - |

### match_logs Function

A vector similarity search function used in the Agent's memory search.

```sql
SELECT * FROM match_logs(
    query_embedding := $1::vector,  -- 768-dimensional query vector
    match_threshold := 0.7,         -- Minimum similarity threshold
    match_count     := 5,           -- Maximum number of results to return
    p_user_id       := 'uuid...'
);
-- Returns: id, content, similarity (cosine similarity 0–1)
```

---

## Hybrid Search

Combines vector similarity search with PostgreSQL Full-Text Search.

```
User query: "food I ate last week"
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  pgvector search       FTS search
  (semantic similarity) (keyword matching)
  embedding <=>         tsvector @@ tsquery
  query_vector          to_tsquery('simple', 'ate & food')
      │                    │
      └─────────┬──────────┘
                ▼
          Merge & re-rank results
          (vector similarity + FTS score)
```

### Automatic tsvector Updates

On INSERT/UPDATE, a PostgreSQL trigger automatically updates `content_tsv`.

```sql
-- Example: daily_logs trigger
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();
-- Internally: NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''))
```

The same type of trigger is applied to the `knowledge_base`, `document_sections`, `diary_entries`, `memos`, and `searches` tables.

---

## Schema Version Management

### Fresh Installation

Use `docker/init.sql`. This is a baseline file that creates the entire schema at once.

```bash
# Runs automatically on Docker initialization
docker compose up -d postgres
```

### Version Upgrade

Apply incremental migration files from the `docker/migrations/incremental/` directory in order.

```bash
# Example: apply a new migration
psql $DATABASE_URL -f docker/migrations/incremental/031_new_feature.sql
```

The currently applied version is recorded in the `schema_migrations` table.

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;
-- 1.0.0 | 2025-01-01 00:00:00+00
```

---

## Connection Methods

### Gateway (Go)

Uses `database/sql` + `lib/pq` driver.

```
DATABASE_URL=postgres://user:pass@localhost:5432/starnion?sslmode=disable
```

### Agent (Python)

Uses `psycopg` (psycopg3) + `psycopg-pool` connection pool.

```
DATABASE_URL=postgresql://user:pass@localhost:5432/starnion
```

The LangGraph checkpoint store also uses the same PostgreSQL instance (`langgraph-checkpoint-postgres`).

---

## Data Isolation

Each user's data is completely isolated by the `user_id` foreign key. One user cannot access another user's data, and all queries include a `WHERE user_id = $1` condition.

---

## Performance Considerations

| Index | Target Tables | Purpose |
|-------|--------------|---------|
| HNSW (m=16, ef=64) | `daily_logs`, `document_sections`, `knowledge_base`, `diary_entries`, `memos`, `searches` | Approximate nearest neighbor vector search |
| GIN | `content_tsv` column in above tables | Full-text search |
| B-tree | `user_id`, `created_at` columns | Filtering and sorting |
| Composite index | `conversations(user_id, updated_at DESC)` | Conversation list retrieval |

HNSW parameters:
- `m = 16`: Maximum number of connections per node (higher = more accurate but more memory)
- `ef_construction = 64`: Search scope during index construction (higher = better quality, longer build time)
