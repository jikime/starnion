---
title: 데이터베이스
nav_order: 4
parent: 아키텍처
grand_parent: 🇰🇷 한국어
---

# 데이터베이스

Starnion은 **PostgreSQL 16** + **pgvector** 확장을 주요 데이터 저장소로 사용합니다. 텍스트 데이터와 768차원 벡터 임베딩을 동일한 데이터베이스에서 관리하여 하이브리드 RAG(벡터 유사도 + 전문 검색)를 구현합니다.

---

## 전체 스키마 개요

```
PostgreSQL 16 + pgvector
│
├── 인증·신원
│   ├── users                    # 중앙 사용자 테이블
│   ├── platform_identities      # 플랫폼별 ID 매핑 (텔레그램, 웹 등)
│   └── platform_link_codes      # 계정 연결 코드 (10분 TTL)
│
├── 대화
│   ├── conversations            # 대화 세션 (LangGraph thread_id 포함)
│   └── messages                 # 대화 메시지 (첨부파일 JSONB)
│
├── 재무
│   ├── finances                 # 가계부 거래 내역
│   └── (budget: profiles.preferences JSONB)
│
├── 개인 기록 (벡터 임베딩 포함)
│   ├── daily_logs               # 일일 로그·일기 (vector 768)
│   ├── diary_entries            # 일기 엔트리 (vector 768)
│   ├── memos                    # 메모 (vector 768)
│   ├── goals                    # 목표 관리
│   ├── goal_checkins            # 목표 체크인 기록
│   └── ddays                    # 디데이
│
├── 미디어·문서 (벡터 임베딩 포함)
│   ├── documents                # 업로드된 문서 메타데이터
│   ├── document_sections        # 문서 청크 (vector 768)
│   ├── images                   # 이미지 갤러리
│   └── audios                   # 오디오 갤러리
│
├── 지식 및 검색 (벡터 임베딩 포함)
│   ├── knowledge_base           # 패턴 분석 결과·지식 (vector 768)
│   └── searches                 # 웹 검색 기록 (vector 768)
│
├── 설정·연동
│   ├── skills                   # 스킬 카탈로그
│   ├── user_skills              # 사용자별 스킬 활성화 상태
│   ├── providers                # LLM 프로바이더 설정
│   ├── personas                 # AI 페르소나
│   ├── google_tokens            # Google OAuth2 토큰
│   └── integration_keys         # 외부 서비스 API 키
│
├── 채널·알림
│   ├── channel_settings         # 텔레그램 채널 설정
│   ├── telegram_approved_contacts  # 텔레그램 승인 연락처
│   ├── telegram_pairing_requests   # 텔레그램 페어링 요청
│   └── notifications            # 알림 내역
│
├── 사용량
│   └── usage_logs               # LLM 토큰 사용량 로그
│
└── 메타
    └── schema_migrations        # 스키마 버전 관리
```

---

## 핵심 테이블 상세

### users — 사용자

모든 사용자 데이터의 루트가 되는 테이블입니다. 이메일/비밀번호 인증과 플랫폼 기반 인증을 모두 지원합니다.

```sql
CREATE TABLE users (
    id            TEXT        PRIMARY KEY,          -- UUID
    display_name  TEXT,
    email         TEXT        UNIQUE,               -- 이메일 인증 사용자만
    password_hash TEXT,                             -- bcrypt
    role          TEXT        DEFAULT 'user',       -- 'admin' | 'user'
    preferences   JSONB       DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### platform_identities — 플랫폼 ID 매핑

텔레그램, 웹, 디스코드 등 다양한 플랫폼의 사용자 ID를 단일 `user_id`로 통합합니다.

```sql
CREATE TABLE platform_identities (
    user_id        TEXT  REFERENCES users(id),
    platform       TEXT,       -- 'telegram' | 'web' | 'discord' | 'credential'
    platform_id    TEXT,       -- 플랫폼 내 고유 ID (telegram chat_id, 이메일 등)
    display_name   TEXT,
    metadata       JSONB DEFAULT '{}',
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (platform, platform_id)
);
```

### conversations / messages — 대화

LangGraph의 체크포인트 시스템과 연동됩니다. `thread_id`가 LangGraph 대화 상태와 연결됩니다.

```sql
CREATE TABLE conversations (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT    REFERENCES users(id),
    title      TEXT    DEFAULT '새 대화',
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
    attachments     JSONB,          -- 첨부파일 URL 배열
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### finances — 가계부

```sql
CREATE TABLE finances (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    amount      INTEGER,    -- 원(KRW) 단위. 수입: 양수, 지출: 음수
    category    TEXT,       -- '식비' | '교통' | '쇼핑' | '수입' 등
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### daily_logs — 일일 로그 (벡터 임베딩)

대화 내용과 일기를 벡터로 저장합니다. 4-Layer RAG 메모리의 Layer 1에 해당합니다.

```sql
CREATE TABLE daily_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    content     TEXT,
    sentiment   TEXT,           -- '좋음' | '보통' | '나쁨' | '피곤' | '기쁨'
    embedding   vector(768),    -- Gemini text-embedding-004
    content_tsv tsvector,       -- 전문 검색용 (자동 트리거)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 인덱스: 빠른 근사 최근접 이웃 검색
CREATE INDEX ON daily_logs USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 전문 검색 GIN 인덱스
CREATE INDEX ON daily_logs USING gin(content_tsv);
```

### document_sections — 문서 청크 (벡터 임베딩)

업로드된 문서를 청크 단위로 분할하여 저장합니다. 4-Layer RAG 메모리의 Layer 3에 해당합니다.

```sql
CREATE TABLE document_sections (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT REFERENCES documents(id),
    content     TEXT,
    embedding   vector(768),
    content_tsv tsvector,
    metadata    JSONB DEFAULT '{}'     -- 페이지 번호, 위치 등
);
```

### knowledge_base — 지식 베이스 (벡터 임베딩)

소비 패턴 분석 결과, 사용자 선호, 개인화 정보를 저장합니다. 4-Layer RAG 메모리의 Layer 2에 해당합니다.

```sql
CREATE TABLE knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    key         TEXT,   -- 지식 유형 (예: 'pattern_analysis', 'user_preference')
    value       TEXT,   -- 지식 내용
    source      TEXT,   -- 출처 스킬
    embedding   vector(768),
    content_tsv tsvector,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### skills / user_skills — 스킬 관리

```sql
CREATE TABLE skills (
    id                 TEXT PRIMARY KEY,    -- 스킬 ID (예: 'finance', 'weather')
    name               TEXT,
    description        TEXT,
    category           TEXT,
    emoji              TEXT DEFAULT '',
    tools              TEXT[] DEFAULT '{}', -- 스킬이 제공하는 도구 목록
    reports            TEXT[] DEFAULT '{}', -- 생성하는 리포트 유형
    cron_rules         TEXT[] DEFAULT '{}', -- 크론 스케줄 규칙
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

## 벡터 검색 (pgvector)

### 개요

pgvector 확장을 통해 768차원 임베딩 벡터를 저장하고 코사인 유사도 검색을 수행합니다.

- **임베딩 모델**: Google `text-embedding-004` (768차원)
- **인덱스 방식**: HNSW (Hierarchical Navigable Small World)
- **유사도 함수**: 코사인 유사도 (`<=>` 연산자)

### 벡터를 사용하는 테이블

| 테이블 | 용도 | RAG Layer |
|--------|------|-----------|
| `daily_logs` | 대화·일기 기억 검색 | Layer 1 |
| `knowledge_base` | 사용자 패턴·선호 검색 | Layer 2 |
| `document_sections` | 업로드 문서 내용 검색 | Layer 3 |
| `diary_entries` | 일기 시맨틱 검색 | - |
| `memos` | 메모 시맨틱 검색 | - |
| `searches` | 웹 검색 기록 검색 | - |

### match_logs 함수

Agent의 메모리 검색에서 사용하는 벡터 유사도 검색 함수입니다.

```sql
SELECT * FROM match_logs(
    query_embedding := $1::vector,  -- 768차원 쿼리 벡터
    match_threshold := 0.7,         -- 최소 유사도 임계값
    match_count     := 5,           -- 반환할 최대 결과 수
    p_user_id       := 'uuid...'
);
-- 반환: id, content, similarity (코사인 유사도 0~1)
```

---

## 하이브리드 검색

벡터 유사도 검색과 PostgreSQL 전문 검색(Full-Text Search)을 결합합니다.

```
사용자 쿼리: "지난주에 먹은 음식"
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  pgvector 검색         FTS 검색
  (의미 유사도)         (키워드 매칭)
  embedding <=>         tsvector @@ tsquery
  query_vector          to_tsquery('simple', '먹은 & 음식')
      │                    │
      └─────────┬──────────┘
                ▼
          결과 병합 & 재정렬
          (벡터 유사도 + FTS 점수)
```

### tsvector 자동 업데이트

INSERT/UPDATE 시 PostgreSQL 트리거가 자동으로 `content_tsv`를 갱신합니다.

```sql
-- 예시: daily_logs 트리거
CREATE TRIGGER trg_daily_logs_tsv
    BEFORE INSERT OR UPDATE OF content ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_tsv_trigger();
-- 내부: NEW.content_tsv := to_tsvector('simple', COALESCE(NEW.content, ''))
```

같은 방식의 트리거가 `knowledge_base`, `document_sections`, `diary_entries`, `memos`, `searches` 테이블에도 적용됩니다.

---

## 스키마 버전 관리

### 신규 설치

`docker/init.sql`을 사용합니다. 전체 스키마를 한 번에 생성하는 기준선(baseline) 파일입니다.

```bash
# Docker 초기화 시 자동 실행
docker compose up -d postgres
```

### 버전 업그레이드

`docker/migrations/incremental/` 디렉터리의 증분 마이그레이션 파일을 순서대로 적용합니다.

```bash
# 예시: 새 마이그레이션 적용
psql $DATABASE_URL -f docker/migrations/incremental/031_new_feature.sql
```

현재 적용된 버전은 `schema_migrations` 테이블에 기록됩니다.

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;
-- 1.0.0 | 2025-01-01 00:00:00+00
```

---

## 연결 방식

### Gateway (Go)

`database/sql` + `lib/pq` 드라이버를 사용합니다.

```
DATABASE_URL=postgres://user:pass@localhost:5432/starnion?sslmode=disable
```

### Agent (Python)

`psycopg` (psycopg3) + `psycopg-pool` 커넥션 풀을 사용합니다.

```
DATABASE_URL=postgresql://user:pass@localhost:5432/starnion
```

LangGraph 체크포인트 저장소도 동일한 PostgreSQL 인스턴스를 사용합니다 (`langgraph-checkpoint-postgres`).

---

## 데이터 격리

각 사용자의 데이터는 `user_id` 외래키로 완전히 격리됩니다. 한 사용자가 다른 사용자의 데이터에 접근할 수 없으며, 모든 쿼리에 `WHERE user_id = $1` 조건이 적용됩니다.

---

## 성능 고려사항

| 인덱스 | 대상 테이블 | 용도 |
|--------|-----------|------|
| HNSW (m=16, ef=64) | `daily_logs`, `document_sections`, `knowledge_base`, `diary_entries`, `memos`, `searches` | 벡터 근사 최근접 이웃 검색 |
| GIN | 위 테이블의 `content_tsv` | 전문 검색 |
| B-tree | `user_id`, `created_at` 컬럼 | 필터링 및 정렬 |
| 복합 인덱스 | `conversations(user_id, updated_at DESC)` | 대화 목록 조회 |

HNSW 파라미터:
- `m = 16`: 각 노드의 최대 연결 수 (높을수록 정확하지만 메모리 증가)
- `ef_construction = 64`: 인덱스 구축 시 탐색 범위 (높을수록 품질 향상, 구축 시간 증가)
