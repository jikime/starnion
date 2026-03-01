# SPEC-MVP-001: Telegram 기반 자연어 가계부 MVP

## Metadata

| Field | Value |
|-------|-------|
| SPEC ID | SPEC-MVP-001 |
| Title | Telegram Natural Language Finance Tracker MVP |
| Status | Planning |
| Priority | High |
| Created | 2026-03-01 |
| Lifecycle | spec-anchored |

## Environment

- **Runtime**: Python 3.13+ / uv
- **Agent Framework**: langgraph>=0.4, langchain-google-genai>=2.1
- **LLM**: Google Gemini 2.0 Flash
- **Database**: PostgreSQL 16+ / pgvector (docker: pgvector/pgvector:pg16)
- **Telegram**: python-telegram-bot>=21.10
- **DB Driver**: psycopg[binary]>=3.2 (async)
- **Checkpointer**: langgraph-checkpoint-postgres
- **Schema Validation**: pydantic>=2.10, pydantic-settings>=2.7
- **Infrastructure**: Docker / Docker Compose

## Assumptions

- 단일 사용자 지원 (멀티테넌시 불필요)
- Agent가 PostgreSQL에 직접 연결 (Gateway 경유하지 않음)
- Telegram polling 모드 사용 (webhook 미사용, 로컬 개발 우선)
- Gemini API 키와 Telegram Bot 토큰은 환경 변수로 주입
- 한국어 자연어 입력을 Gemini가 파싱하여 Tool 호출 (별도 NLU 없음)
- 금액 단위는 원(KRW), 정수 저장
- 기존 docker/init.sql 스키마를 그대로 사용 (finances 테이블의 user_id는 telegram_id TEXT 참조)
- LangGraph checkpointer로 대화 상태 유지 (3계층 메모리 시스템은 post-MVP)

## Requirements

### Ubiquitous

- REQ-U001: 시스템은 모든 사용자 응답을 **한국어**로 생성 **SHALL** 한다.
- REQ-U002: 시스템은 'jiki(지기)' 페르소나를 유지하며, 친근하고 도움이 되는 톤으로 응답 **SHALL** 한다.
- REQ-U003: 시스템은 모든 BaseTool 하위 클래스에 명시적 `args_schema` (Pydantic BaseModel)를 정의 **SHALL** 한다.
- REQ-U004: 시스템은 Pydantic Tool 스키마에 `Optional[T]` 패턴을 사용 **SHALL NOT** 한다. (Gemini anyOf 버그 회피)
- REQ-U005: 시스템은 모든 Tool 호출 결과를 구조화된 형태로 로깅 **SHALL** 한다.
- REQ-U006: 시스템은 API 키, 비밀번호 등 민감 정보를 로그에 기록 **SHALL NOT** 한다.
- REQ-U007: 시스템은 사용자에게 내부 에러 스택 트레이스를 노출 **SHALL NOT** 한다.

### Event-Driven

- REQ-E001: **WHEN** 사용자가 `/start` 명령어를 전송 **THEN** 시스템은 한국어 환영 메시지를 표시하고, 프로필이 없으면 profiles 테이블에 새 프로필을 생성 **SHALL** 한다.
- REQ-E002: **WHEN** 사용자가 자연어로 지출/수입 내용을 포함한 메시지를 전송 **THEN** 시스템은 LLM이 메시지를 파싱하여 `save_finance` Tool을 호출하고, finances 테이블에 기록을 INSERT **SHALL** 한다.
- REQ-E003: **WHEN** `save_finance` Tool이 성공적으로 실행 **THEN** 시스템은 카테고리, 금액, 설명을 포함한 확인 메시지와 해당 월 카테고리 누적 합계를 응답 **SHALL** 한다.
- REQ-E004: **WHEN** 사용자가 월별 지출 합계를 질문 **THEN** 시스템은 `get_monthly_total` Tool을 호출하여 finances 테이블에서 해당 월의 카테고리별 합계를 조회 **SHALL** 한다.
- REQ-E005: **WHEN** 데이터베이스 연결이 실패 **THEN** 시스템은 사용자에게 "잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해주세요." 등 사용자 친화적 에러 메시지를 반환 **SHALL** 한다.
- REQ-E006: **WHEN** 사용자가 금액과 무관한 일반 대화 메시지를 전송 **THEN** 시스템은 Tool 호출 없이 일반 대화로 응답 **SHALL** 한다.
- REQ-E007: **WHEN** Telegram 봇 애플리케이션이 시작 **THEN** 시스템은 PostgreSQL 커넥션 풀과 LangGraph checkpointer를 초기화 **SHALL** 한다.
- REQ-E008: **WHEN** Telegram 봇 애플리케이션이 종료 **THEN** 시스템은 커넥션 풀과 리소스를 정리(cleanup) **SHALL** 한다.

### State-Driven

- REQ-S001: **IF** 메시지를 보낸 사용자의 프로필이 profiles 테이블에 존재하지 않으면 **THEN** 시스템은 해당 telegram_id로 프로필을 자동 생성한 후 메시지를 처리 **SHALL** 한다.
- REQ-S002: **WHILE** 대화 세션이 활성 상태인 동안 **THEN** 시스템은 LangGraph AsyncPostgresSaver checkpointer를 통해 대화 이력을 유지 **SHALL** 한다.
- REQ-S003: **IF** 사용자 메시지에서 카테고리를 명시적으로 특정할 수 없으면 **THEN** LLM이 메시지 컨텍스트를 기반으로 적절한 카테고리를 추론 **SHALL** 한다.

### Unwanted

- REQ-N001: 시스템은 매 메시지마다 새로운 Agent 인스턴스를 생성 **SHALL NOT** 한다. (성능 및 메모리 효율)
- REQ-N002: 시스템은 사용자의 금융 데이터를 다른 사용자에게 노출 **SHALL NOT** 한다.
- REQ-N003: 시스템은 데이터베이스 커넥션 풀 없이 개별 커넥션으로 DB에 접근 **SHALL NOT** 한다.

### Optional

- REQ-O001: **WHERE** 가능한 경우, save_finance 응답에 해당 카테고리의 월간 누적 합계를 포함 **SHALL** 한다.
- REQ-O002: **WHERE** 가능한 경우, 사용자의 예산 설정이 있으면 예산 대비 사용 비율을 응답에 포함 **SHALL** 한다.
- REQ-O003: **WHERE** 가능한 경우, "만원", "삼만오천원" 등 한국어 숫자 표현을 정확하게 파싱 **SHALL** 한다.

## Specifications

### 1. Database Layer (`agent/src/jiki_agent/db/`)

**Connection Pool (`pool.py`)**
- psycopg AsyncConnectionPool 사용
- Settings.database_url 기반 연결
- 애플리케이션 수명주기(startup/shutdown)와 연동
- min_size=2, max_size=10 (단일 사용자 MVP 기준)

**Finance Repository (`repositories/finance.py`)**
- `create(user_id, amount, category, description) -> FinanceRecord`: finances 테이블 INSERT
- `get_monthly_total(user_id, category, month) -> int`: 월별 카테고리 합계 SELECT SUM
- `get_monthly_total_all(user_id, month) -> list[CategoryTotal]`: 전체 카테고리별 합계

**Profile Repository (`repositories/profile.py`)**
- `upsert(telegram_id, user_name) -> Profile`: profiles 테이블 UPSERT (ON CONFLICT DO UPDATE)
- `get_by_telegram_id(telegram_id) -> Profile | None`: 프로필 조회

### 2. Tool Implementation (`agent/src/jiki_agent/tools/finance.py`)

**save_finance Tool**
- args_schema: SaveFinanceInput (category: str, amount: int, description: str)
- 주의: amount는 int (float 아님), description default=""로 Optional 회피
- DB INSERT 실행 후, 해당 월 카테고리 누적 합계를 조회하여 함께 반환
- 응답 형식: "{category} {amount:,}원 기록했어요. 이번 달 {category} 누적: {monthly_total:,}원"

**get_monthly_total Tool**
- args_schema: GetMonthlyTotalInput (category: str)
- category가 빈 문자열이면 전체 카테고리 합계
- DB SELECT SUM 실행 후 한국어 포맷 응답
- 응답 형식: "이번 달 {category} 총 지출: {total:,}원" 또는 카테고리별 상세

### 3. Agent Configuration (`agent/src/jiki_agent/graph/agent.py`)

**System Prompt**
- jiki 페르소나 정의 (한국어, 친근한 톤)
- Tool 사용 지침 명시 (금액 입력 시 save_finance, 조회 시 get_monthly_total)
- 한국어 숫자 파싱 규칙 안내 ("만원" = 10000, "삼만오천원" = 35000)

**LangGraph Checkpointer**
- AsyncPostgresSaver.from_conn_string(database_url) 사용
- thread_id = telegram chat_id (대화별 상태 분리)

**Agent Singleton**
- 모듈 레벨에서 agent 인스턴스 1회 생성, 재사용

### 4. Telegram Bot (`agent/src/jiki_agent/telegram/bot.py`)

**/start Handler**
- 한국어 환영 메시지 출력
- ProfileRepository.upsert() 호출로 프로필 자동 생성
- 기본 사용 안내 포함

**Message Handler**
- 사용자 메시지를 agent.ainvoke()로 전달
- config에 thread_id = chat_id 설정 (대화 상태 유지)
- try-except로 에러 캐치, 사용자 친화적 에러 메시지 응답
- Agent 생성을 메시지마다 하지 않도록 리팩터링

**Application Lifecycle**
- post_init에서 DB 풀 초기화, checkpointer setup
- post_shutdown에서 DB 풀 정리

### 5. Entry Point (`agent/src/jiki_agent/main.py`)

- Telegram bot polling 모드로 실행
- 환경 변수 유효성 검증 (TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, DATABASE_URL)
- 로깅 설정 (structlog 또는 기본 logging)

### 6. Docker Integration

- docker-compose.yml의 agent 서비스에서 `python -m jiki_agent.main` 실행
- .env.example 업데이트 (필수 환경 변수 문서화)

## Traceability

| Requirement ID | Test ID | Status |
|----------------|---------|--------|
| REQ-U001 | TEST-U001 | Pending |
| REQ-U002 | TEST-U002 | Pending |
| REQ-U003 | TEST-U003 | Pending |
| REQ-U004 | TEST-U004 | Pending |
| REQ-E001 | TEST-E001 | Pending |
| REQ-E002 | TEST-E002 | Pending |
| REQ-E003 | TEST-E003 | Pending |
| REQ-E004 | TEST-E004 | Pending |
| REQ-E005 | TEST-E005 | Pending |
| REQ-E006 | TEST-E006 | Pending |
| REQ-E007 | TEST-E007 | Pending |
| REQ-E008 | TEST-E008 | Pending |
| REQ-S001 | TEST-S001 | Pending |
| REQ-S002 | TEST-S002 | Pending |
| REQ-S003 | TEST-S003 | Pending |
| REQ-N001 | TEST-N001 | Pending |
| REQ-N002 | TEST-N002 | Pending |
| REQ-N003 | TEST-N003 | Pending |
| REQ-O001 | TEST-O001 | Pending |
| REQ-O002 | TEST-O002 | Pending |
| REQ-O003 | TEST-O003 | Pending |

## Out of Scope

다음 항목은 MVP 범위에 포함되지 않으며 후속 SPEC에서 다룬다:

| 항목 | 사유 | 예정 Phase |
|------|------|-----------|
| Go Gateway 통합 | MVP에서는 Telegram이 Agent에 직접 연결 | Phase 2 |
| Web UI (Next.js) | Phase 3 로드맵 항목 | Phase 3 |
| 멀티모달 입력 (이미지, 음성, 문서) | Phase 2 로드맵 항목 | Phase 2 |
| 개인 지식베이스 / RAG | Phase 2 로드맵 항목 | Phase 2 |
| 프로액티브 알림 | Phase 2 로드맵 항목 | Phase 2 |
| 멀티 유저 인증 / 인가 | 단일 사용자 MVP | Phase 3 |
| 3계층 메모리 시스템 | LangGraph checkpointer로 기본 상태 유지 | Phase 2 |
| 예산 관리 기능 | MVP 이후 개인화 강화 | Phase 2 |
| gRPC 양방향 스트리밍 | Gateway 통합 시 구현 | Phase 2 |
