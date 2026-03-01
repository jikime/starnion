# jiki (지기) - 기술 스택 상세

**최종 수정일:** 2026-03-01
**버전:** 0.1.0
**상태:** Planning

---

## 기술 스택 요약

```
┌─────────────────────────────────────────────────────┐
│  Interface       │ Telegram Bot, Next.js (Phase 3)   │
├─────────────────────────────────────────────────────┤
│  Gateway         │ Go 1.23+ / Echo v4 / gRPC         │
├─────────────────────────────────────────────────────┤
│  Agent           │ Python 3.13+ / LangGraph / Gemini  │
├─────────────────────────────────────────────────────┤
│  Database        │ PostgreSQL 16+ / pgvector          │
├─────────────────────────────────────────────────────┤
│  Infrastructure  │ Docker / Docker Compose            │
└─────────────────────────────────────────────────────┘
```

---

## Gateway (Go)

### 기술 선택 근거

| 항목 | 기술 | 버전 | 선택 이유 |
|------|-----|------|----------|
| 언어 | Go | 1.23+ | 높은 동시성 처리, 낮은 메모리 사용, 빠른 빌드 |
| 웹 프레임워크 | Echo v4 | v4.x | 경량, 고성능, 미들웨어 생태계, WebSocket/SSE 내장 |
| RPC | gRPC | 최신 | 양방향 스트리밍, Protobuf 기반 타입 안전성, 언어 중립 |
| 설정 관리 | config.yaml | - | 환경별 설정 분리, 직관적 구조 |
| 인증 | JWT | - | 무상태 인증, Telegram 사용자 매핑 |

### 핵심 패턴

#### HTTP 핸들러 구조

```go
// handler/chat.go
type ChatHandler struct {
    agentClient proto.AgentServiceClient
    authService *auth.Service
}

func (h *ChatHandler) HandleMessage(c echo.Context) error {
    userID := c.Get("user_id").(string)

    var req ChatRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }

    // gRPC 양방향 스트리밍으로 Agent 호출
    stream, err := h.agentClient.Chat(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }

    // 요청 전송 → 응답 스트리밍
    // ...
}
```

#### 미들웨어 체인

```go
// Rate Limiting (사용자별)
e.Use(middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
    Store: middleware.NewRateLimiterMemoryStore(20), // 분당 20회
    IdentifierExtractor: func(c echo.Context) (string, error) {
        return c.Get("user_id").(string), nil
    },
}))

// CORS 설정
e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
    AllowOrigins: []string{"https://jiki.app"},
    AllowMethods: []string{http.MethodGet, http.MethodPost},
}))
```

#### gRPC 클라이언트 연결

```go
// Agent 서비스 gRPC 연결
conn, err := grpc.NewClient(
    cfg.Agent.Address,
    grpc.WithTransportCredentials(insecure.NewCredentials()),
    grpc.WithDefaultCallOptions(
        grpc.MaxCallRecvMsgSize(10 * 1024 * 1024), // 10MB
    ),
)
agentClient := proto.NewAgentServiceClient(conn)
```

---

## Agent Service (Python)

### 기술 선택 근거

| 항목 | 기술 | 버전 | 선택 이유 |
|------|-----|------|----------|
| 언어 | Python | 3.13+ | AI/ML 생태계 최대, LangChain/LangGraph 네이티브 |
| 에이전트 | LangGraph | 최신 | 상태 관리, 복잡한 워크플로우, 조건부 분기 |
| 도구 | LangChain | 최신 | BaseTool 추상화, @tool 데코레이터, 풍부한 통합 |
| 모델 | Google Gemini | 최신 | 멀티모달, 한국어 성능, 비용 효율 |
| RPC | grpcio / grpc.aio | 최신 | 비동기 gRPC 서버, 양방향 스트리밍 |
| 스키마 | Pydantic | v2 | 데이터 검증, 직렬화, Tool 스키마 정의 |
| 패키지 관리 | uv | 최신 | 빠른 의존성 해결, 가상환경 관리 |
| 테스트 | pytest | 최신 | 비동기 테스트, 풍부한 픽스처, 플러그인 |

### 핵심 패턴

#### LangGraph ReAct 에이전트

```python
# graph/agent.py
from langgraph.prebuilt import create_react_agent
from langchain_google_genai import ChatGoogleGenerativeAI

def create_jiki_agent(tools: list, memory_manager):
    """jiki ReAct 에이전트를 생성한다."""

    model = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.7,
        max_output_tokens=4096,
    )

    system_prompt = """당신은 'jiki(지기)'입니다.
    사용자의 디지털 트윈으로서, 사용자를 깊이 이해하고
    의사결정 피로를 줄여주는 것이 핵심 역할입니다.

    사용 가능한 도구를 적극적으로 활용하여
    사용자의 요청을 처리하세요."""

    agent = create_react_agent(
        model=model,
        tools=tools,
        state_modifier=system_prompt,
    )

    return agent
```

#### Tool 정의 (BaseTool + args_schema 필수)

```python
# tools/finance.py
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

class SaveFinanceInput(BaseModel):
    """금융 데이터 저장 Tool의 입력 스키마."""
    amount: int = Field(description="금액 (원 단위)")
    category: str = Field(description="카테고리 (식비, 교통, 카페 등)")
    description: str = Field(default="", description="설명")

class SaveFinanceTool(BaseTool):
    """수입/지출을 기록하는 Tool."""

    name: str = "save_finance"
    description: str = "수입 또는 지출 금액을 카테고리와 함께 기록합니다."
    args_schema: type[BaseModel] = SaveFinanceInput  # Gemini 필수!

    async def _arun(self, amount: int, category: str, description: str = "") -> str:
        # DB에 저장
        record = await self.db.finances.create(
            user_id=self.user_id,
            amount=amount,
            category=category,
            description=description,
        )

        # 월간 누적 조회
        monthly = await self.db.finances.get_monthly_total(
            user_id=self.user_id,
            category=category,
        )

        return f"{category} {amount:,}원 기록. 이번 달 {category} 누적: {monthly:,}원"
```

> **주의사항**: LangChain + Gemini 조합에서는 BaseTool 하위 클래스에 반드시 `args_schema`를 명시해야 한다. 생략하면 Gemini가 파라미터를 `__arg1: STRING` 형태로 전달하여 Tool 실행이 실패한다.

#### 3계층 메모리 시스템

```python
# memory/manager.py
class MemoryManager:
    """3계층 메모리를 통합 관리하는 매니저."""

    def __init__(self, short_term, long_term, entity):
        self.short_term = short_term   # LangGraph State
        self.long_term = long_term     # pgvector RAG
        self.entity = entity           # Structured JSON

    async def recall(self, query: str, user_id: str) -> MemoryContext:
        """3계층 메모리에서 관련 맥락을 통합 조회한다."""

        # 단기 기억: 현재 대화 맥락
        short = self.short_term.get_recent_messages(limit=10)

        # 장기 기억: 벡터 유사도 검색
        long = await self.long_term.search(
            query=query,
            user_id=user_id,
            top_k=5,
            min_score=0.7,
        )

        # 엔티티 기억: 사용자 프로필
        entity = await self.entity.get_profile(user_id)

        return MemoryContext(
            short_term=short,
            long_term=long,
            entity=entity,
        )
```

#### Gemini anyOf 스키마 정규화

```python
# graph/tools.py
def sanitize_tool_schemas_for_gemini(tools: list) -> list:
    """Gemini API의 anyOf 스키마 비호환 문제를 해결한다.

    Gemini는 Optional[str] 등의 anyOf 패턴이 포함된
    Tool 스키마를 받으면 빈 응답을 반환하는 버그가 있다.
    base type + default 값으로 변환하여 우회한다.
    """

    def _unwrap_anyof(schema: dict) -> dict:
        if "anyOf" in schema:
            # anyOf에서 null이 아닌 첫 번째 타입 추출
            for variant in schema["anyOf"]:
                if variant.get("type") != "null":
                    return variant
        return schema

    # 각 Tool의 args_schema를 정규화
    for tool in tools:
        if hasattr(tool, "args_schema"):
            schema = tool.args_schema.model_json_schema()
            for prop_name, prop_schema in schema.get("properties", {}).items():
                schema["properties"][prop_name] = _unwrap_anyof(prop_schema)

    return tools
```

---

## 데이터베이스

### 기술 선택 근거

| 항목 | 기술 | 버전 | 선택 이유 |
|------|-----|------|----------|
| RDBMS | PostgreSQL | 16+ | JSONB, 확장성, 안정성, 오픈소스 |
| 벡터 검색 | pgvector | 최신 | PostgreSQL 네이티브 확장, HNSW/IVFFlat 인덱스 |
| 임베딩 | Gemini Embedding | 최신 | 1536차원, 한국어 성능, API 비용 효율 |

### 스키마 설계

```sql
-- pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 사용자 프로필 (온보딩 데이터)
-- ============================================
CREATE TABLE profiles (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id     BIGINT UNIQUE NOT NULL,
    user_name       VARCHAR(100) NOT NULL,
    goals           TEXT[] DEFAULT '{}',
    preferences     JSONB DEFAULT '{}',
    -- preferences 구조:
    -- {
    --   "budget": { "food": 300000, "transport": 100000 },
    --   "dietary": { "allergies": ["유제품"], "preference": "매운맛" },
    --   "notification": { "weekly_report": true, "budget_alert": true }
    -- }
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 금융 기록 (구조화 데이터)
-- ============================================
CREATE TABLE finances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(user_id),
    amount          INTEGER NOT NULL,          -- 원 단위 (음수: 지출, 양수: 수입)
    category        VARCHAR(50) NOT NULL,      -- 식비, 교통, 카페, 수입 등
    description     TEXT DEFAULT '',
    transaction_at  TIMESTAMPTZ DEFAULT NOW(), -- 실제 거래 시각
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 월별 카테고리 조회용 인덱스
CREATE INDEX idx_finances_user_month
    ON finances (user_id, DATE_TRUNC('month', transaction_at));
CREATE INDEX idx_finances_category
    ON finances (user_id, category);

-- ============================================
-- 일일 로그 (벡터 임베딩 포함)
-- ============================================
CREATE TABLE daily_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(user_id),
    content         TEXT NOT NULL,              -- 원본 텍스트
    sentiment       VARCHAR(20),               -- positive, neutral, negative
    embedding       vector(1536),              -- Gemini Embedding
    metadata        JSONB DEFAULT '{}',        -- 추가 메타데이터
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 벡터 인덱스 (코사인 유사도)
CREATE INDEX idx_daily_logs_embedding
    ON daily_logs USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================
-- 문서 저장소
-- ============================================
CREATE TABLE user_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(user_id),
    title           VARCHAR(255) NOT NULL,
    file_type       VARCHAR(20) NOT NULL,      -- pdf, docx, xlsx, hwp
    file_url        TEXT NOT NULL,              -- 스토리지 URL
    file_size       INTEGER,                   -- 바이트 단위
    page_count      INTEGER,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 문서 청크 (RAG용)
-- ============================================
CREATE TABLE document_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,              -- 청크 텍스트
    embedding       vector(1536),              -- 벡터 임베딩
    metadata        JSONB DEFAULT '{}',        -- 페이지 번호, 섹션 제목 등
    chunk_index     INTEGER NOT NULL,          -- 청크 순서
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 벡터 인덱스
CREATE INDEX idx_doc_sections_embedding
    ON document_sections USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================
-- 지식 베이스 (키-값 + 벡터)
-- ============================================
CREATE TABLE knowledge_base (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(user_id),
    key             VARCHAR(255) NOT NULL,     -- 지식 키 (예: "좋아하는_음식")
    value           TEXT NOT NULL,              -- 지식 값
    source          VARCHAR(100),              -- 출처 (conversation, document, manual)
    embedding       vector(1536),
    confidence      FLOAT DEFAULT 1.0,         -- 확신도 (0.0 ~ 1.0)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 벡터 인덱스
CREATE INDEX idx_knowledge_embedding
    ON knowledge_base USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 사용자별 키 조회 인덱스
CREATE INDEX idx_knowledge_user_key
    ON knowledge_base (user_id, key);
```

### 벡터 검색 패턴

```sql
-- 코사인 유사도 기반 RAG 검색
SELECT
    content,
    metadata,
    1 - (embedding <=> $1::vector) AS similarity
FROM daily_logs
WHERE user_id = $2
    AND 1 - (embedding <=> $1::vector) > 0.7  -- 최소 유사도
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### HNSW vs IVFFlat 인덱스 비교

| 기준 | HNSW | IVFFlat |
|------|------|---------|
| 검색 정확도 | 높음 (99%+) | 중간 (95%+) |
| 검색 속도 | 빠름 | 보통 |
| 인덱스 빌드 | 느림 | 빠름 |
| 메모리 사용 | 높음 | 낮음 |
| 권장 규모 | <1M 벡터 | >1M 벡터 |
| **jiki 선택** | **HNSW** | - |

> jiki는 사용자당 데이터가 상대적으로 적으므로 (수만~수십만 건), 정확도가 높은 HNSW를 선택한다.

---

## 통신 프로토콜

### gRPC 서비스 정의

```protobuf
// proto/jiki/v1/agent.proto
syntax = "proto3";
package jiki.v1;

service AgentService {
    // 양방향 스트리밍 채팅
    rpc Chat(stream ChatRequest) returns (stream ChatResponse);

    // 에이전트 상태 조회
    rpc GetStatus(StatusRequest) returns (StatusResponse);
}

// proto/jiki/v1/chat.proto
message ChatRequest {
    string user_id = 1;
    string message = 2;
    repeated Attachment attachments = 3;
    map<string, string> metadata = 4;
}

message ChatResponse {
    oneof response {
        TextChunk text_chunk = 1;         // 텍스트 스트리밍 청크
        ToolCall tool_call = 2;           // Tool 호출 알림
        ToolResult tool_result = 3;       // Tool 실행 결과
        FinalResponse final_response = 4; // 최종 응답
    }
}

message Attachment {
    string file_url = 1;
    string file_type = 2;    // image, audio, document
    string file_name = 3;
    int64 file_size = 4;
}

message ToolCall {
    string tool_name = 1;
    string arguments_json = 2;
}

message ToolResult {
    string tool_name = 1;
    string result = 2;
    bool success = 3;
}

// proto/jiki/v1/tool.proto
service ToolRegistryService {
    // Gateway에 위임된 Tool 등록
    rpc RegisterTool(RegisterToolRequest) returns (RegisterToolResponse);

    // 등록된 Tool 목록 조회
    rpc ListTools(ListToolsRequest) returns (ListToolsResponse);

    // Tool 실행 (Agent → Gateway 방향)
    rpc ExecuteTool(ExecuteToolRequest) returns (ExecuteToolResponse);
}
```

### 통신 흐름 상세

```
[Telegram 메시지 수신]
    │
    ▼
Gateway: Telegram Webhook 수신
    │
    ├─ 인증: Telegram user_id → JWT 매핑
    ├─ Rate Limit: 사용자별 분당 20회 체크
    │
    ▼
Gateway → Agent: gRPC ChatRequest 스트리밍 시작
    │
    ▼
Agent: LangGraph ReAct 실행
    │
    ├─ Plan: 사용자 의도 파악 + 메모리 조회
    ├─ Execute: Tool 선택 및 실행
    │   ├─ 로컬 Tool: DB 직접 접근
    │   └─ Gateway Tool: gRPC ToolRegistry 호출
    ├─ Observe: Tool 결과 분석
    │
    ▼
Agent → Gateway: gRPC ChatResponse 스트리밍
    │
    ├─ TextChunk: 실시간 텍스트 전송
    ├─ ToolCall: Tool 호출 상태 알림
    ├─ ToolResult: Tool 실행 결과
    └─ FinalResponse: 최종 응답
    │
    ▼
Gateway → Telegram: sendMessage API 호출
```

---

## 핵심 설계 패턴

### 1. Repository 패턴 (데이터 접근 추상화)

```python
# 인터페이스 정의
class FinanceRepository(Protocol):
    async def create(self, user_id: str, amount: int, category: str, description: str) -> Finance: ...
    async def get_monthly_total(self, user_id: str, category: str, month: str) -> int: ...
    async def get_by_period(self, user_id: str, start: datetime, end: datetime) -> list[Finance]: ...

# PostgreSQL 구현
class PostgresFinanceRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def create(self, user_id: str, amount: int, category: str, description: str) -> Finance:
        row = await self.pool.fetchrow(
            "INSERT INTO finances (user_id, amount, category, description) "
            "VALUES ($1, $2, $3, $4) RETURNING *",
            user_id, amount, category, description,
        )
        return Finance(**dict(row))
```

### 2. 이벤트 기반 알림 (프로액티브 시스템)

```python
# notification/triggers.py
class BudgetAlertTrigger:
    """예산 경고 트리거. 금융 기록 저장 후 실행된다."""

    async def check(self, user_id: str, category: str) -> Alert | None:
        monthly_total = await self.finance_repo.get_monthly_total(user_id, category)
        budget = await self.profile_repo.get_budget(user_id, category)

        if budget is None:
            return None

        ratio = monthly_total / budget

        if ratio >= 0.9:
            return Alert(
                level="warning",
                message=f"이번 달 {category} 예산의 {ratio*100:.0f}% 사용했어요!",
            )
        elif ratio >= 0.7:
            return Alert(
                level="info",
                message=f"이번 달 {category} 예산의 {ratio*100:.0f}% 사용 중이에요.",
            )

        return None
```

### 3. 문서 RAG 파이프라인

```python
# knowledge/chunker.py
class DocumentChunker:
    """문서를 의미 단위로 청킹한다."""

    def __init__(self, chunk_size: int = 800, overlap: int = 200):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str, metadata: dict) -> list[Chunk]:
        """텍스트를 오버랩 윈도우로 청킹한다."""
        chunks = []
        start = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            # 문장 경계에서 자르기
            if end < len(text):
                last_period = text.rfind('.', start, end)
                if last_period > start + self.chunk_size // 2:
                    end = last_period + 1

            chunks.append(Chunk(
                content=text[start:end],
                metadata={**metadata, "chunk_index": len(chunks)},
            ))

            start = end - self.overlap

        return chunks
```

---

## 개발 환경

### Docker Compose (로컬 개발)

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: jiki
      POSTGRES_USER: jiki
      POSTGRES_PASSWORD: jiki_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ../migrations:/docker-entrypoint-initdb.d

  gateway:
    build:
      context: ../gateway
      dockerfile: ../docker/Dockerfile.gateway
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    environment:
      - AGENT_GRPC_ADDRESS=agent:50051
      - DB_HOST=postgres

  agent:
    build:
      context: ../agent
      dockerfile: ../docker/Dockerfile.agent
    ports:
      - "50051:50051"
    depends_on:
      - postgres
    environment:
      - DB_HOST=postgres
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}

volumes:
  postgres_data:
```

### 환경 변수

| 변수명 | 용도 | 서비스 |
|--------|------|--------|
| `GOOGLE_API_KEY` | Gemini API 키 | Agent |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot 토큰 | Agent |
| `DB_HOST` | PostgreSQL 호스트 | Gateway, Agent |
| `DB_NAME` | 데이터베이스 이름 | Gateway, Agent |
| `DB_USER` | DB 사용자 | Gateway, Agent |
| `DB_PASSWORD` | DB 비밀번호 | Gateway, Agent |
| `JWT_SECRET` | JWT 서명 키 | Gateway |
| `AGENT_GRPC_ADDRESS` | Agent gRPC 주소 | Gateway |

---

## 테스트 전략

### 테스트 피라미드

```
         ╱╲
        ╱E2E╲          Telegram → Gateway → Agent → DB
       ╱──────╲         (Playwright / pytest-asyncio)
      ╱통합 테스트╲       Agent + DB, Gateway + Agent
     ╱────────────╲      (pytest, testcontainers)
    ╱  단위 테스트   ╲     Tool 로직, 청킹, 파싱
   ╱────────────────╲    (pytest, vitest)
```

| 테스트 레벨 | 대상 | 프레임워크 | 커버리지 목표 |
|------------|------|----------|-------------|
| 단위 | Tool 로직, 청킹, 파싱, 유틸 | pytest | 90%+ |
| 통합 | gRPC 호출, DB 연동, RAG 검색 | pytest + testcontainers | 80%+ |
| E2E | Telegram 메시지 전체 흐름 | pytest-asyncio | 핵심 시나리오 |

### 테스트 예시

```python
# tests/unit/test_tools_finance.py
import pytest
from jiki_agent.tools.finance import SaveFinanceTool, SaveFinanceInput

class TestSaveFinanceTool:
    @pytest.fixture
    def tool(self, mock_db):
        return SaveFinanceTool(db=mock_db, user_id="test-user")

    async def test_save_expense(self, tool, mock_db):
        """지출 기록이 올바르게 저장되는지 검증한다."""
        result = await tool._arun(
            amount=-10000,
            category="식비",
            description="점심",
        )

        assert "식비" in result
        assert "10,000원" in result
        mock_db.finances.create.assert_called_once()

    async def test_save_income(self, tool, mock_db):
        """수입 기록이 올바르게 저장되는지 검증한다."""
        result = await tool._arun(
            amount=3500000,
            category="수입",
            description="월급",
        )

        assert "수입" in result
        assert "3,500,000원" in result
```

---

## 보안 고려사항

### 데이터 보호

| 영역 | 조치 | 구현 |
|------|------|------|
| 전송 암호화 | TLS 1.3 | gRPC TLS, HTTPS |
| 저장 암호화 | AES-256 | PostgreSQL TDE (선택) |
| 인증 | JWT + Telegram Auth | Gateway auth 미들웨어 |
| 인가 | 사용자별 데이터 격리 | 모든 쿼리에 user_id 조건 |
| 비밀 관리 | 환경 변수 | .env 파일, 시크릿 매니저 |
| API 키 보호 | 서버사이드 전용 | 클라이언트 노출 금지 |

### Rate Limiting

| 엔드포인트 | 제한 | 단위 |
|-----------|------|------|
| 채팅 메시지 | 20회 | 분 |
| 파일 업로드 | 10회 | 시간 |
| RAG 검색 | 30회 | 분 |
| 프로필 수정 | 5회 | 분 |

### 개인정보 보호 원칙

1. **최소 수집**: 서비스에 필요한 최소한의 데이터만 수집
2. **투명성**: 수집 데이터 항목과 용도를 사용자에게 명시
3. **삭제 권리**: 사용자 요청 시 모든 데이터 완전 삭제 지원
4. **격리**: 사용자 간 데이터 완전 격리 (멀티테넌시)
5. **로깅 제한**: 개인 식별 정보 로깅 금지

---

## 성능 목표

| 지표 | 목표값 | 측정 방법 |
|------|--------|----------|
| 채팅 응답 (첫 토큰) | < 1초 | gRPC 스트리밍 첫 응답 |
| 채팅 응답 (전체) | < 5초 | Tool 호출 포함 전체 |
| RAG 검색 | < 200ms | pgvector HNSW 쿼리 |
| 파일 업로드 | < 10초 | 10MB PDF 기준 |
| 동시 사용자 | 100+ | Gateway 기준 |
| 가용성 | 99.5% | 월간 다운타임 < 3.6시간 |

---

*이 문서는 jiki 프로젝트의 기술 스택과 핵심 패턴을 정의한다. 제품 기능은 `product.md`를, 프로젝트 구조는 `structure.md`를 참고한다.*
