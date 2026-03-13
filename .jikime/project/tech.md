# Starnion 기술 스택

**Last Updated:** 2026-03-13

## 1. 기술 스택 요약

| 계층 | 기술 | 버전 |
|------|------|------|
| **Web UI** | Next.js + React + TypeScript | 16.1.6 / 19.2.4 / 5.7.3 |
| **Gateway** | Go + Echo + gRPC | 1.22+ / v4.15.1 / 1.79.1 |
| **Agent** | Python + LangGraph + LangChain | 3.13+ / 0.4+ / latest |
| **Database** | PostgreSQL + pgvector | 16 / latest |
| **Storage** | MinIO (S3 호환) | latest |
| **통신** | gRPC (protobuf) | 1.79.1 |
| **컨테이너** | Docker + Docker Compose | latest |

## 2. 레이어별 기술

### Gateway (Go)

게이트웨이는 모든 외부 요청의 진입점으로, HTTP API, WebSocket, Telegram 봇을 처리한다.

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **Go** | 1.22+ | 런타임 |
| **Echo** | v4.15.1 | HTTP 웹 프레임워크 |
| **gRPC** | 1.79.1 | Agent 서비스 통신 |
| **go-telegram-bot-api** | v5 | Telegram 봇 통합 |
| **lib/pq** | latest | PostgreSQL 드라이버 |
| **MinIO Go Client** | latest | S3 호환 오브젝트 스토리지 |
| **golang-jwt** | v5 | JWT 인증 토큰 |
| **gorilla/websocket** | latest | WebSocket 실시간 통신 |
| **robfig/cron** | latest | Cron 기반 스케줄링 |
| **zerolog** | latest | 구조화된 JSON 로깅 |
| **cobra** | latest | CLI 프레임워크 |
| **yaml.v3** | latest | YAML 설정 파싱 |

### Agent (Python)

에이전트는 AI 추론과 스킬 실행을 담당하는 핵심 서비스다.

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **Python** | 3.13+ | 런타임 |
| **LangGraph** | >= 0.4 | ReAct 에이전트 오케스트레이션 |
| **LangChain google-genai** | latest | Google Gemini 연동 |
| **LangChain anthropic** | latest | Anthropic Claude 연동 |
| **LangChain openai** | latest | OpenAI GPT 연동 |
| **LangChain ollama** | latest | Ollama 로컬 모델 연동 |
| **psycopg3** | latest | PostgreSQL 비동기 드라이버 |
| **Pydantic** | v2 | 데이터 검증 및 스키마 |
| **grpcio** | latest | gRPC 서버 |
| **docling** | latest | 문서 파싱 |
| **pypdf** | latest | PDF 처리 |
| **pillow** | latest | 이미지 처리 |
| **playwright** | latest | 웹 스크래핑/자동화 |
| **tavily-python** | latest | 웹 검색 API |

### UI (Next.js)

웹 UI는 풀 기능 대시보드로, SSR과 Server Actions를 활용한다.

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **Next.js** | 16.1.6 | React 프레임워크 (App Router) |
| **React** | 19.2.4 | UI 라이브러리 |
| **TypeScript** | 5.7.3 | 타입 안전성 |
| **Tailwind CSS** | 4.2.0 | 유틸리티 CSS 프레임워크 |
| **NextAuth.js** | 5.0.0-beta | 인증 (OAuth, Credentials) |
| **next-intl** | 4.8.3 | 다국어 지원 (ko, en, ja, zh) |
| **Radix UI** | latest | 헤드리스 UI 컴포넌트 |
| **AI SDK (Vercel)** | latest | AI 스트리밍 응답 처리 |
| **React Hook Form** | latest | 폼 상태 관리 |
| **Zod** | latest | 스키마 검증 |
| **recharts** | latest | 데이터 시각화 차트 |

### 인프라

| 기술 | 용도 |
|------|------|
| **PostgreSQL 16** | 관계형 데이터베이스 |
| **pgvector** | 벡터 유사도 검색 (HNSW 인덱스) |
| **MinIO** | S3 호환 오브젝트 스토리지 |
| **Docker** | 컨테이너화 |
| **Docker Compose** | 멀티 컨테이너 오케스트레이션 |
| **gRPC / protobuf** | 서비스 간 고성능 통신 |

## 3. 개발 환경 설정

### 필수 요구사항

| 도구 | 최소 버전 |
|------|----------|
| Go | 1.22+ |
| Python | 3.13+ |
| Node.js | 20+ |
| Docker | 24+ |
| Docker Compose | v2+ |
| uv (Python 패키지 매니저) | latest |
| pnpm (Node.js 패키지 매니저) | latest |

### 환경 변수

각 서비스별 `.env` 파일이 필요하다. 주요 설정 항목은 다음과 같다.

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/starnion

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...

# LLM Providers
GOOGLE_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Telegram
TELEGRAM_BOT_TOKEN=...

# Auth
JWT_SECRET=...
NEXTAUTH_SECRET=...
```

## 4. 주요 기술 결정

### Go Gateway 선택 이유

- **고성능 동시성**: goroutine 기반의 경량 동시 처리로 다수의 WebSocket 연결과 HTTP 요청을 효율적으로 처리
- **단일 바이너리 배포**: 의존성 없는 단일 실행 파일로 배포 간소화
- **gRPC 네이티브 지원**: Protocol Buffer 기반의 타입 안전한 서비스 간 통신

### Python LangGraph Agent 선택 이유

- **LangChain 생태계**: 다양한 LLM 프로바이더 통합이 용이
- **ReAct 패턴**: LangGraph의 그래프 기반 에이전트 오케스트레이션으로 복잡한 도구 호출 흐름 관리
- **멀티 LLM 지원**: 단일 코드베이스에서 Gemini, OpenAI, Claude, Ollama 모두 지원

### Next.js App Router 선택 이유

- **Server Components**: 서버 사이드 렌더링으로 초기 로딩 성능 최적화
- **Server Actions**: 별도 API 레이어 없이 서버 로직 직접 호출
- **next-intl**: 4개 언어 (ko, en, ja, zh) 다국어 지원 내장

### pgvector 선택 이유

- **별도 벡터 DB 불필요**: PostgreSQL 확장으로 기존 인프라에서 벡터 검색 수행
- **HNSW 인덱스**: 고속 근사 최근접 이웃 검색으로 RAG 메모리 시스템 지원
- **트랜잭션 일관성**: 관계형 데이터와 벡터 데이터를 동일 트랜잭션에서 관리

### gRPC 선택 이유

- **타입 안전성**: Protocol Buffer 스키마로 Gateway-Agent 간 계약 보장
- **양방향 스트리밍**: AI 응답 스트리밍에 적합
- **고성능**: JSON REST 대비 직렬화/역직렬화 성능 우위

## 5. 빌드 & 실행 명령어

### Docker Compose (전체 서비스)

```bash
# 전체 서비스 시작
docker compose up -d

# 로그 확인
docker compose logs -f

# 서비스 중지
docker compose down
```

### Gateway (Go)

```bash
cd gateway

# 의존성 설치
go mod download

# 빌드
go build -o bin/gateway cmd/gateway/main.go

# 실행
./bin/gateway serve

# CLI 도구
go run cmd/starnion/main.go --help
```

### Agent (Python)

```bash
cd agent

# 의존성 설치 (uv 사용)
uv sync

# 실행
uv run python -m starnion_agent

# gRPC 서버 시작
uv run python -m starnion_agent.grpc.server
```

### UI (Next.js)

```bash
cd ui

# 의존성 설치
pnpm install

# 개발 서버
pnpm dev

# 프로덕션 빌드
pnpm build

# 프로덕션 실행
pnpm start
```

### DB 마이그레이션

```bash
# 초기 스키마 적용 (Docker 환경)
docker exec -i starnion-db psql -U postgres -d starnion < docker/init.sql

# 증분 마이그레이션
docker exec -i starnion-db psql -U postgres -d starnion < docker/migrations/incremental/v1.3.5.sql

# Gateway CLI를 통한 마이그레이션
cd gateway
go run cmd/starnion/main.go migrate up
```

### Proto 컴파일

```bash
cd proto

# Go 코드 생성
protoc --go_out=../gateway --go-grpc_out=../gateway *.proto

# Python 코드 생성
python -m grpc_tools.protoc --python_out=../agent --grpc_python_out=../agent *.proto
```
