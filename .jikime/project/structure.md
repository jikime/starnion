# jiki (지기) - 프로젝트 구조

**최종 수정일:** 2026-03-01
**버전:** 0.1.0
**상태:** Planning

---

## 전체 디렉토리 구조

```
jiki/
├── gateway/                        # Go Gateway 서비스
│   ├── cmd/gateway/                # 진입점 (main.go)
│   ├── internal/                   # 내부 패키지 (외부 비공개)
│   │   ├── auth/                   # 인증/인가 처리
│   │   ├── handler/                # HTTP/WebSocket/SSE 핸들러
│   │   ├── middleware/             # 미들웨어 (CORS, Rate Limit 등)
│   │   └── storage/                # 파일 스토리지 관리
│   ├── proto/                      # 컴파일된 Protobuf Go 코드
│   ├── config.yaml                 # Gateway 설정 파일
│   ├── go.mod                      # Go 모듈 정의
│   └── go.sum                      # Go 의존성 체크섬
│
├── agent/                          # Python LangGraph Agent 서비스
│   ├── src/jiki_agent/             # 메인 패키지
│   │   ├── graph/                  # LangGraph 워크플로우 정의
│   │   ├── tools/                  # Tool 정의 (LangChain BaseTool)
│   │   ├── memory/                 # 3계층 메모리 시스템
│   │   ├── telegram/               # Telegram 봇 핸들러
│   │   ├── knowledge/              # 지식베이스 / RAG 파이프라인
│   │   └── models/                 # Pydantic 데이터 모델
│   ├── tests/                      # 테스트 코드
│   │   ├── unit/                   # 단위 테스트
│   │   ├── integration/            # 통합 테스트
│   │   └── conftest.py             # pytest 공통 설정
│   ├── pyproject.toml              # Python 프로젝트 설정 (uv)
│   └── uv.lock                     # 의존성 잠금 파일
│
├── web-ui/                         # Next.js 대시보드 (Phase 3)
│   ├── src/
│   │   ├── app/                    # App Router 페이지
│   │   ├── components/             # UI 컴포넌트
│   │   └── lib/                    # 유틸리티, API 클라이언트
│   ├── package.json                # Node.js 의존성
│   └── next.config.js              # Next.js 설정
│
├── proto/                          # 공유 Protobuf 정의 (원본)
│   └── jiki/v1/                    # v1 API 정의
│       ├── agent.proto             # Agent 서비스 인터페이스
│       ├── chat.proto              # 채팅 메시지 타입
│       └── tool.proto              # Tool 레지스트리 인터페이스
│
├── docker/                         # Docker 설정
│   ├── Dockerfile.gateway          # Gateway 빌드
│   ├── Dockerfile.agent            # Agent 빌드
│   └── docker-compose.yml          # 로컬 개발 환경
│
├── migrations/                     # DB 마이그레이션
│   ├── 001_initial_schema.sql      # 초기 스키마
│   └── 002_add_vectors.sql         # pgvector 확장
│
├── scripts/                        # 빌드/배포 스크립트
│   ├── proto-gen.sh                # Protobuf 코드 생성
│   ├── migrate.sh                  # DB 마이그레이션 실행
│   └── dev.sh                      # 로컬 개발 환경 시작
│
├── docs/                           # 프로젝트 문서
│   └── CODEMAPS/                   # 코드맵 문서
│
├── .jikime/                        # JikiME-ADK 설정
│   ├── project/                    # 프로젝트 문서
│   │   ├── product.md              # 제품 개요
│   │   ├── structure.md            # 프로젝트 구조 (이 문서)
│   │   └── tech.md                 # 기술 스택 상세
│   └── config/                     # 프로젝트 설정
│
└── README.md                       # 프로젝트 소개
```

---

## 모듈별 상세 설명

### Gateway (Go)

Go로 작성된 API 게이트웨이. 모든 클라이언트 요청의 진입점 역할을 하며, 인증, 라우팅, 파일 처리를 담당한다.

```
gateway/
├── cmd/gateway/
│   └── main.go                     # 서버 시작점, 설정 로드, 라우트 등록
│
├── internal/
│   ├── auth/
│   │   ├── jwt.go                  # JWT 토큰 생성/검증
│   │   ├── middleware.go           # 인증 미들웨어
│   │   └── telegram.go             # Telegram 사용자 인증
│   │
│   ├── handler/
│   │   ├── chat.go                 # 채팅 메시지 처리 (REST)
│   │   ├── websocket.go            # WebSocket 실시간 통신
│   │   ├── sse.go                  # SSE 스트리밍 응답
│   │   ├── telegram.go             # Telegram Webhook 핸들러
│   │   └── file.go                 # 파일 업로드/다운로드
│   │
│   ├── middleware/
│   │   ├── cors.go                 # CORS 설정
│   │   ├── ratelimit.go            # Rate Limiting (사용자별)
│   │   ├── logging.go              # 요청/응답 로깅
│   │   └── recovery.go             # 패닉 복구
│   │
│   └── storage/
│       ├── storage.go              # 스토리지 인터페이스
│       ├── local.go                # 로컬 파일 스토리지
│       └── s3.go                   # S3 호환 스토리지
│
├── proto/
│   └── jiki/v1/                    # 컴파일된 gRPC Go 코드
│       ├── agent_grpc.pb.go
│       └── agent.pb.go
│
└── config.yaml                     # 서버 포트, DB, gRPC 설정
```

**핵심 역할:**

| 컴포넌트 | 역할 | 의존성 |
|---------|------|--------|
| `cmd/gateway` | 앱 부트스트랩, 라우트 등록 | Echo v4, 전체 internal |
| `auth` | 사용자 인증/인가 | JWT 라이브러리 |
| `handler` | 프로토콜별 요청 처리 | gRPC client, auth |
| `middleware` | 횡단 관심사 처리 | Echo middleware |
| `storage` | 파일 저장/조회 추상화 | S3 SDK (선택) |

---

### Agent (Python)

Python LangGraph 기반 AI 에이전트. 사용자 의도를 이해하고, 적절한 Tool을 선택하여 실행하는 ReAct 패턴의 핵심 서비스이다.

```
agent/
├── src/jiki_agent/
│   ├── __init__.py
│   ├── main.py                     # gRPC 서버 시작점
│   │
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── agent.py                # LangGraph ReAct 에이전트 정의
│   │   ├── state.py                # AgentState 타입 정의
│   │   ├── nodes.py                # 그래프 노드 (plan, execute, observe)
│   │   └── tools.py                # Tool 등록 및 스키마 정규화
│   │
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── finance.py              # save_finance, get_monthly_total
│   │   ├── calendar.py             # manage_calendar
│   │   ├── knowledge.py            # query_knowledge_base
│   │   ├── profile.py              # 사용자 프로필 관리
│   │   └── notification.py         # 프로액티브 알림 생성
│   │
│   ├── memory/
│   │   ├── __init__.py
│   │   ├── short_term.py           # LangGraph State 기반 단기 기억
│   │   ├── long_term.py            # pgvector RAG 장기 기억
│   │   ├── entity.py               # 구조화 엔티티 기억
│   │   └── manager.py              # 메모리 계층 통합 관리
│   │
│   ├── telegram/
│   │   ├── __init__.py
│   │   ├── bot.py                  # Telegram Bot 초기화
│   │   ├── handlers.py             # 메시지/커맨드 핸들러
│   │   └── formatters.py           # 응답 포맷팅 (Markdown)
│   │
│   ├── knowledge/
│   │   ├── __init__.py
│   │   ├── chunker.py              # 문서 청킹 로직
│   │   ├── embedder.py             # 벡터 임베딩 생성
│   │   ├── retriever.py            # RAG 검색 엔진
│   │   └── parsers/                # 문서 파서
│   │       ├── pdf.py              # PDF 파싱
│   │       ├── docx.py             # DOCX 파싱
│   │       ├── xlsx.py             # XLSX 파싱
│   │       └── hwp.py              # HWP 파싱
│   │
│   └── models/
│       ├── __init__.py
│       ├── user.py                 # 사용자 모델
│       ├── finance.py              # 금융 데이터 모델
│       ├── document.py             # 문서 모델
│       └── schemas.py              # API 요청/응답 스키마
│
└── tests/
    ├── unit/
    │   ├── test_tools_finance.py   # 금융 Tool 단위 테스트
    │   ├── test_tools_knowledge.py # 지식 Tool 단위 테스트
    │   ├── test_memory.py          # 메모리 시스템 테스트
    │   └── test_chunker.py         # 청킹 로직 테스트
    ├── integration/
    │   ├── test_graph.py           # LangGraph 통합 테스트
    │   ├── test_telegram.py        # Telegram 봇 통합 테스트
    │   └── test_rag.py             # RAG 파이프라인 테스트
    └── conftest.py                 # 공통 fixture, mock 설정
```

**핵심 역할:**

| 컴포넌트 | 역할 | 의존성 |
|---------|------|--------|
| `graph` | LangGraph 에이전트 워크플로우 정의 | LangGraph, LangChain |
| `tools` | 도메인별 Tool 구현 | Pydantic, DB 클라이언트 |
| `memory` | 3계층 메모리 시스템 관리 | pgvector, LangGraph State |
| `telegram` | Telegram 봇 인터페이스 | python-telegram-bot |
| `knowledge` | 문서 RAG 파이프라인 | Gemini Embedding, pgvector |
| `models` | 데이터 모델, 스키마 정의 | Pydantic |

---

### Web UI (Next.js) - Phase 3

사용자 대시보드 웹 애플리케이션. 데이터 시각화, 설정 관리, 지식베이스 탐색 기능을 제공한다.

```
web-ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 루트 레이아웃
│   │   ├── page.tsx                # 메인 대시보드
│   │   ├── chat/                   # 채팅 인터페이스
│   │   │   └── page.tsx
│   │   ├── finance/                # 가계부 대시보드
│   │   │   └── page.tsx
│   │   ├── knowledge/              # 지식베이스 관리
│   │   │   └── page.tsx
│   │   └── settings/               # 설정 페이지
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── chat/                   # 채팅 관련 컴포넌트
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   └── InputBar.tsx
│   │   ├── finance/                # 가계부 관련 컴포넌트
│   │   │   ├── SpendingChart.tsx
│   │   │   ├── CategoryBreakdown.tsx
│   │   │   └── BudgetProgress.tsx
│   │   └── common/                 # 공통 컴포넌트
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── LoadingSpinner.tsx
│   │
│   └── lib/
│       ├── api.ts                  # Gateway API 클라이언트
│       ├── ws.ts                   # WebSocket 연결 관리
│       └── utils.ts                # 유틸리티 함수
│
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

### 공유 Protobuf 정의

Gateway와 Agent 간 gRPC 통신의 계약을 정의하는 Protocol Buffers 원본 파일이다.

```
proto/
└── jiki/v1/
    ├── agent.proto                 # Agent 서비스 RPC 정의
    │                               # - Chat: 양방향 스트리밍
    │                               # - GetStatus: 에이전트 상태 조회
    │
    ├── chat.proto                  # 채팅 메시지 타입 정의
    │                               # - ChatRequest: 사용자 메시지
    │                               # - ChatResponse: 에이전트 응답 (스트리밍)
    │                               # - Attachment: 파일 첨부
    │
    └── tool.proto                  # Tool 레지스트리 인터페이스
                                    # - RegisterTool: Tool 등록
                                    # - ListTools: 등록된 Tool 목록
                                    # - ExecuteTool: Tool 실행 요청
```

---

### 인프라 & 설정

```
docker/
├── Dockerfile.gateway              # Gateway 멀티스테이지 빌드
├── Dockerfile.agent                # Agent Python 빌드
└── docker-compose.yml              # 로컬 개발 전체 스택
                                    # - gateway, agent, postgres, pgvector

migrations/
├── 001_initial_schema.sql          # profiles, finances, daily_logs 테이블
└── 002_add_vectors.sql             # pgvector 확장, 벡터 컬럼, HNSW 인덱스

scripts/
├── proto-gen.sh                    # protoc 실행 (Go + Python 코드 생성)
├── migrate.sh                      # DB 마이그레이션 순차 실행
└── dev.sh                          # docker-compose up + 개발 서버 시작
```

---

## 모듈 간 의존성

```
┌─────────────────────────────────────────────────┐
│                      proto/                       │
│          (공유 인터페이스 정의, 의존성 없음)            │
└──────────┬─────────────────────┬────────────────┘
           │                     │
     protoc 코드 생성          protoc 코드 생성
           │                     │
           ▼                     ▼
┌──────────────────┐   ┌──────────────────────────┐
│    gateway/       │   │       agent/              │
│    (Go)           │──▶│       (Python)            │
│                   │   │                           │
│  Echo v4          │   │  LangGraph               │
│  gRPC Client      │   │  gRPC Server             │
│  JWT Auth         │   │  LangChain Tools         │
└────────┬─────────┘   └────────────┬──────────────┘
         │                          │
         │     ┌────────────────┐   │
         └────▶│  PostgreSQL    │◀──┘
               │  + pgvector    │
               └────────────────┘
                     ▲
                     │
              ┌──────┴──────┐
              │ migrations/  │
              └─────────────┘
```

### 의존성 규칙

| 모듈 | 의존 대상 | 의존 방식 |
|------|----------|----------|
| `gateway` | `proto` | 컴파일된 gRPC 스텁 |
| `gateway` | `agent` | gRPC 클라이언트 호출 (런타임) |
| `agent` | `proto` | 컴파일된 gRPC 스텁 |
| `agent` | PostgreSQL | 직접 DB 연결 |
| `web-ui` | `gateway` | HTTP/WebSocket API 호출 |
| `migrations` | PostgreSQL | SQL DDL 실행 |

### 핵심 설계 원칙

1. **모듈 독립성**: 각 서비스(gateway, agent, web-ui)는 독립적으로 빌드, 테스트, 배포 가능
2. **프로토콜 중심 계약**: proto/ 디렉토리가 서비스 간 통신의 단일 진실 원천(Single Source of Truth)
3. **내부 패키지 보호**: Go의 `internal/` 패턴으로 외부 접근 차단
4. **기능별 조직**: 타입별(components, hooks 등)이 아닌 기능별(finance, calendar 등) 디렉토리 구조
5. **점진적 확장**: web-ui는 Phase 3에서 추가, 기존 구조에 영향 없음

---

*이 문서는 jiki 프로젝트의 디렉토리 구조와 모듈 역할을 정의한다. 제품 기능은 `product.md`를, 기술 스택 상세는 `tech.md`를 참고한다.*
