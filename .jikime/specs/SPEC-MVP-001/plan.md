# Implementation Plan: SPEC-MVP-001

## Overview

Telegram 기반 자연어 가계부 MVP의 구현 계획이다. 기존 스캐폴딩된 코드(agent, tools, telegram bot)를 기반으로 PostgreSQL 연동과 LangGraph checkpointer를 추가하여 완전한 E2E 흐름을 완성한다. 구현은 Foundation(DB) -> Core(Tools) -> Intelligence(Agent) -> Interface(Telegram) -> Infrastructure(Docker) 순서로 진행한다.

## Milestones

### Primary Goals (Priority: High)

- [ ] PostgreSQL 비동기 커넥션 풀 및 Repository 패턴 구현
- [ ] save_finance, get_monthly_total Tool의 실제 DB 연동
- [ ] LangGraph AsyncPostgresSaver checkpointer로 대화 상태 유지
- [ ] jiki 한국어 페르소나 시스템 프롬프트 적용
- [ ] Telegram /start 온보딩 + 자연어 메시지 처리 전체 흐름 완성
- [ ] Docker Compose로 PostgreSQL + Agent 통합 실행 가능

### Secondary Goals (Priority: Medium)

- [ ] 단위 테스트: Tool 로직, Repository CRUD (커버리지 85%+)
- [ ] 통합 테스트: DB 연동 (testcontainers-python)
- [ ] 에러 핸들링 강화 (DB 실패, LLM 타임아웃 등)
- [ ] 로깅 구조화 (structlog 또는 표준 logging)

### Optional Goals (Priority: Low)

- [ ] E2E 테스트: Telegram 메시지 전체 흐름 mock 테스트
- [ ] 한국어 숫자 표현 파싱 최적화 ("만원", "삼만오천원")
- [ ] 사용자 프로필 업데이트 기능 (이름, 시간대)

## Technical Approach

### Architecture

```
Telegram User
    |
    | (HTTP Long Polling)
    v
python-telegram-bot (polling)
    |
    | (in-process call)
    v
LangGraph ReAct Agent (Gemini 2.0 Flash)
    |
    |-- System Prompt (한국어 jiki 페르소나)
    |-- Tools: save_finance, get_monthly_total
    |-- Checkpointer: AsyncPostgresSaver
    |
    v
PostgreSQL 16 + pgvector
    |
    |-- profiles (사용자 프로필)
    |-- finances (수입/지출 기록)
    |-- (기타 테이블은 post-MVP)
```

### Architecture Decisions

- **Agent가 DB 직접 연결**: MVP에서는 Gateway를 경유하지 않고 Agent가 PostgreSQL에 직접 연결한다. 이는 복잡도를 줄이고 빠른 MVP 검증에 집중하기 위함이다.
- **psycopg3 AsyncConnectionPool**: 비동기 환경(python-telegram-bot + LangGraph)에 최적화. asyncpg 대신 psycopg3을 선택한 이유는 pyproject.toml에 이미 psycopg가 의존성으로 포함되어 있기 때문이다.
- **LangGraph AsyncPostgresSaver**: 대화 상태를 PostgreSQL에 영구 저장하여, 봇 재시작 후에도 대화 맥락을 유지한다. langgraph-checkpoint-postgres 패키지 사용.
- **Tool에 DB 풀 주입**: 모듈 레벨 싱글턴 패턴 대신, 봇 시작 시 DB 풀을 생성하고 Tool 함수에 접근 가능하도록 모듈 변수 또는 config 객체를 통해 주입한다.
- **Polling 모드**: 로컬 개발 환경에서 webhook 설정 없이 즉시 테스트 가능. 프로덕션에서는 webhook으로 전환 권장.

### Technology Stack

- **psycopg[binary]>=3.2**: PostgreSQL 비동기 드라이버 + 커넥션 풀
- **langgraph-checkpoint-postgres**: LangGraph 대화 상태 PostgreSQL 영구화
- **python-telegram-bot>=21.10**: Telegram Bot API 래퍼
- **langgraph>=0.4**: ReAct 에이전트 프레임워크
- **langchain-google-genai>=2.1**: Gemini LLM 통합
- **pydantic>=2.10**: Tool 스키마 검증 (args_schema 필수)

## Implementation Phases

### Phase 1: Database Layer (Foundation)

**Task**: PostgreSQL 비동기 커넥션 풀 및 Repository 구현

**Files**:
- `agent/src/jiki_agent/db/__init__.py` (new)
- `agent/src/jiki_agent/db/pool.py` (new)
- `agent/src/jiki_agent/db/repositories/__init__.py` (new)
- `agent/src/jiki_agent/db/repositories/finance.py` (new)
- `agent/src/jiki_agent/db/repositories/profile.py` (new)

**Dependencies**: docker/init.sql 스키마가 이미 존재

**Detail**:
```python
# pool.py - 핵심 구조
from psycopg_pool import AsyncConnectionPool

pool: AsyncConnectionPool | None = None

async def init_pool(database_url: str) -> AsyncConnectionPool:
    global pool
    pool = AsyncConnectionPool(conninfo=database_url, min_size=2, max_size=10)
    await pool.open()
    return pool

async def close_pool() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None

def get_pool() -> AsyncConnectionPool:
    if pool is None:
        raise RuntimeError("DB pool not initialized")
    return pool
```

```python
# repositories/finance.py - 핵심 메서드
async def create(pool, user_id: str, amount: int, category: str, description: str) -> dict
async def get_monthly_total(pool, user_id: str, category: str, month: str) -> int
async def get_monthly_summary(pool, user_id: str, month: str) -> list[dict]
```

```python
# repositories/profile.py - 핵심 메서드
async def upsert(pool, telegram_id: str, user_name: str) -> dict
async def get_by_telegram_id(pool, telegram_id: str) -> dict | None
```

### Phase 2: Tool Implementation (Core Logic)

**Task**: save_finance, get_monthly_total Tool에 실제 DB 연동

**Files**:
- `agent/src/jiki_agent/tools/finance.py` (update)

**Dependencies**: Phase 1 (DB Layer)

**Detail**:
- `save_finance`: DB INSERT 후 월간 누적 합계 조회하여 한국어 응답 생성
- `get_monthly_total`: DB SELECT SUM 후 한국어 포맷 응답
- args_schema 유지 (Gemini 호환), Optional[T] 사용 금지
- amount 타입을 float에서 int로 변경 (원 단위 정수 저장)
- Tool 함수 내에서 get_pool()로 DB 접근

### Phase 3: Agent Enhancement (Intelligence)

**Task**: 한국어 시스템 프롬프트 + LangGraph checkpointer 적용

**Files**:
- `agent/src/jiki_agent/graph/agent.py` (update)
- `agent/pyproject.toml` (update - langgraph-checkpoint-postgres 추가)

**Dependencies**: Phase 1 (DB Pool for checkpointer)

**Detail**:
```python
# System Prompt 핵심 내용
SYSTEM_PROMPT = """당신은 'jiki(지기)'입니다.
사용자의 디지털 트윈으로서 일상 속 의사결정 피로를 줄여주는 개인 AI 비서입니다.

핵심 역할:
- 사용자가 자연어로 말하는 수입/지출을 정확하게 파싱하여 기록
- 월별, 카테고리별 지출 현황을 친절하게 안내
- 항상 한국어로 응답하며, 친근하고 도움이 되는 톤 유지

금액 파싱 규칙:
- "만원" = 10,000원, "삼만오천원" = 35,000원
- "350만원" = 3,500,000원
- 금액이 명확하지 않으면 사용자에게 확인

카테고리 가이드:
- 식비: 식사, 간식, 카페, 배달
- 교통: 택시, 버스, 지하철, 주유
- 쇼핑: 의류, 전자제품, 생활용품
- 문화: 영화, 공연, 도서
- 수입: 월급, 부수입, 용돈
- 기타: 분류가 어려운 항목

도구 사용 지침:
- 수입이나 지출 내용이 포함된 메시지 → save_finance 호출
- 월별 합계 질문 → get_monthly_total 호출
- 일반 대화나 질문 → 도구 호출 없이 자연스럽게 대화
"""
```

```python
# AsyncPostgresSaver 적용
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

async def create_agent(database_url: str):
    checkpointer = AsyncPostgresSaver.from_conn_string(database_url)
    await checkpointer.setup()

    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=SYSTEM_PROMPT,
        checkpointer=checkpointer,
    )
    return agent
```

### Phase 4: Telegram Integration (Interface)

**Task**: Telegram 봇 핸들러 완성 (온보딩, 에러 핸들링, 라이프사이클)

**Files**:
- `agent/src/jiki_agent/telegram/bot.py` (update)
- `agent/src/jiki_agent/main.py` (new)

**Dependencies**: Phase 1 (DB Pool), Phase 2 (Tools), Phase 3 (Agent)

**Detail**:
```python
# bot.py - /start 핸들러 개선
async def start_command(update, context):
    telegram_id = str(update.effective_user.id)
    user_name = update.effective_user.first_name or "사용자"

    # 프로필 자동 생성
    await profile_repo.upsert(pool, telegram_id, user_name)

    await update.message.reply_text(
        f"반가워요, {user_name}님! 저는 지기예요.\n"
        "여러분의 개인 가계부 AI 비서입니다.\n\n"
        "이렇게 사용해보세요:\n"
        '- "오늘 점심 만원 썼어"\n'
        '- "커피 4,500원"\n'
        '- "이번 달 식비 얼마 썼어?"\n\n'
        "편하게 말씀해주세요!"
    )
```

```python
# main.py - 진입점
async def main():
    # 1. DB 풀 초기화
    await init_pool(settings.database_url)
    # 2. Agent 생성
    agent = await create_agent(settings.database_url)
    # 3. Telegram 봇 시작
    app = create_bot(agent)
    await app.run_polling()
    # 4. 종료 시 정리
    await close_pool()
```

### Phase 5: Infrastructure (Deployment)

**Task**: Docker Compose 통합 실행 확인 및 문서화

**Files**:
- `agent/.env.example` (update)
- `docker/docker-compose.yml` (verify)
- `agent/pyproject.toml` (update - 의존성 추가)

**Dependencies**: Phase 1-4 완료

**Detail**:
- pyproject.toml에 `langgraph-checkpoint-postgres` 의존성 추가
- .env.example에 필수 환경 변수 문서화
- Docker Compose로 PostgreSQL + Agent 동시 실행 확인
- init.sql이 정상적으로 테이블 생성하는지 확인
- Smoke test: /start -> 지출 기록 -> 조회 전체 흐름

## Implementation File Map

| Phase | File | Action | Description |
|-------|------|--------|-------------|
| 1 | `agent/src/jiki_agent/db/__init__.py` | New | DB 패키지 초기화 |
| 1 | `agent/src/jiki_agent/db/pool.py` | New | 비동기 커넥션 풀 관리 |
| 1 | `agent/src/jiki_agent/db/repositories/__init__.py` | New | Repository 패키지 초기화 |
| 1 | `agent/src/jiki_agent/db/repositories/finance.py` | New | 금융 데이터 CRUD |
| 1 | `agent/src/jiki_agent/db/repositories/profile.py` | New | 프로필 CRUD |
| 2 | `agent/src/jiki_agent/tools/finance.py` | Update | DB 연동 구현 |
| 3 | `agent/src/jiki_agent/graph/agent.py` | Update | 시스템 프롬프트 + checkpointer |
| 3 | `agent/pyproject.toml` | Update | 의존성 추가 |
| 4 | `agent/src/jiki_agent/telegram/bot.py` | Update | 핸들러 강화 |
| 4 | `agent/src/jiki_agent/main.py` | New | 진입점 |
| 5 | `agent/.env.example` | Update | 환경 변수 문서화 |
| 5 | `docker/docker-compose.yml` | Verify | 통합 실행 확인 |

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Gemini가 한국어 자연어를 정확히 파싱하지 못함 | High | Medium | 시스템 프롬프트에 파싱 규칙과 예시를 상세히 포함. Few-shot 예시 추가. |
| langgraph-checkpoint-postgres 버전 호환성 | Medium | Low | Context7 문서 확인 완료. AsyncPostgresSaver 공식 지원됨. |
| psycopg3 AsyncConnectionPool과 python-telegram-bot 이벤트 루프 충돌 | Medium | Medium | python-telegram-bot v21은 asyncio 기반. 동일 이벤트 루프에서 실행. |
| Tool 함수에서 DB 풀 접근 패턴 복잡도 | Medium | Medium | 모듈 레벨 get_pool() 함수로 단순화. 테스트 시 mock 주입 용이. |
| Gemini anyOf 스키마 버그 (Optional[T]) | High | High | args_schema에서 Optional[T] 완전 배제. base type + default 값 사용. 검증됨. |
| Docker Compose 네트워크에서 Agent → PostgreSQL DNS 해석 실패 | Low | Low | depends_on + healthcheck로 순서 보장. 연결 재시도 로직 추가. |
| Telegram Bot Token 유출 | Critical | Low | .env 파일 사용, .gitignore에 포함, 환경 변수 주입 패턴 강제. |

## Related SPECs

- **Depends On**: 없음 (첫 번째 SPEC)
- **Blocks**: SPEC-MVP-002 (예정: Go Gateway 통합), SPEC-MVP-003 (예정: 3계층 메모리 시스템)
- **Related**: product.md (Phase 1 로드맵), tech.md (기술 스택)
