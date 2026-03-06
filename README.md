# STARPION

> **"당신의 은하를 항해하는 가장 영리한 성좌."**
> *Navigating your cosmos, the smartest constellation.*

---

## Brand Identity

### Symbol

![Starpion Brand](ui/public/brand_logo.webp)

기계적 전갈 + 독침 끝의 별 + 성좌 데이터 노드로 구성된 Starpion의 공식 엠블럼.

| 요소 | 의미 |
|------|------|
| **Scorpion Body** | 탄탄한 기술력과 보안 (pgvector / 보안 레이어) |
| **Stinger Star** | 방대한 데이터 속에서 길을 찾는 통찰력(하이브리드 검색)과 목표를 타격하는 정밀한 실행 (MCP / Skills) |
| **Constellation** | 사용자의 파편화된 삶과 기억을 유기적으로 연결하는 지능망 |

---

## Core Values — S.T.A.R.

| 가치 | 설명 |
|------|------|
| **S — SYNC (동기화)** | 사용자의 모든 기기, 스케줄, 취향을 완벽하게 동기화합니다 |
| **T — TARGET (정밀 타격)** | 사용자의 의도를 독침처럼 정확히 파악하여 필요한 액션(Skill)을 즉시 수행합니다 |
| **A — AUTONOMY (자율성)** | 사용자가 명령하기 전에 먼저 상황을 분석하고(Self-Refining) 최적의 제안을 합니다 |
| **R — RELIANCE (신뢰)** | 전갈의 갑주처럼 사용자의 민감한 개인 정보를 안전하게 수호합니다 |

---

## Overview

Starpion은 Hyper-Personalized AI Agent 플랫폼입니다. 웹 UI, Telegram 등 멀티 채널에서 자연어 가계부, 일기, 목표 관리, 메모, 메모리/RAG 검색, 멀티모달 입력, 예산 관리, 프로액티브 알림을 제공합니다.

### Core Features

| Feature | Description |
|---------|-------------|
| **Natural Language Finance** | "점심 김치찌개 9000원" → 자동 카테고리 분류 + 기록 |
| **Budget Management** | 카테고리별 예산 설정, 사용률 추적, 초과 경고 |
| **Diary / Daily Log** | 일상 기록 저장 + 감정 분석 + 벡터 임베딩 |
| **Goals & Habits** | 목표 설정, 체크인, 스트릭, 진행률 추적 |
| **Memo** | 태그 기반 메모 CRUD + 통합 검색 |
| **Memory / RAG** | 4계층 메모리 검색 (일상기록, 지식, 문서, 가계부) |
| **Multimodal** | 이미지 분석, PDF 텍스트 추출, 음성 인식 |
| **Proactive Notifications** | 주간 리포트 자동 발송 (매주 월요일 09:00 KST) |
| **Statistics & Analytics** | 소비 패턴 분석, 인사이트 리포트 |
| **Web Chat** | 실시간 WebSocket 기반 AI 채팅 |

---

## Architecture

```
Web UI (Next.js)  /  Telegram
         │                │
         ▼                ▼
┌────────────────────────────────────────┐
│  Go Gateway (:8080)                    │
│  ├─ REST API (/api/v1/*)               │
│  ├─ WebSocket (/ws)                    │
│  ├─ Telegram Bot (polling)             │
│  ├─ Cron Scheduler                     │
│  └─ gRPC Client ──────────────────┐   │
└───────────────────────────────────┼───┘
                                    │ gRPC (unary)
                                    ▼
┌────────────────────────────────────────┐
│  Python Agent (:50051)                 │
│  ├─ LangGraph ReAct Agent              │
│  │   └─ Multi-LLM (Gemini / OpenAI / …)│
│  ├─ Tools                              │
│  │   ├─ save_finance                   │
│  │   ├─ get_monthly_total              │
│  │   ├─ retrieve_memory (RAG)          │
│  │   ├─ save_daily_log                 │
│  │   ├─ set_budget / get_budget        │
│  │   ├─ process_image (Vision)         │
│  │   ├─ process_document (PDF)         │
│  │   └─ process_voice (STT)            │
│  ├─ Embedding Service                  │
│  │   └─ gemini-embedding-001 (768d)    │
│  └─ 4-Layer Memory Retriever           │
│      ├─ daily_logs      (vector)       │
│      ├─ knowledge_base  (vector)       │
│      ├─ document_sections (vector)     │
│      └─ finances        (recent)       │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  PostgreSQL 16 + pgvector              │
│  ├─ profiles / credentials             │
│  ├─ finances / budgets                 │
│  ├─ diary_entries                      │
│  ├─ goals / goal_checkins              │
│  ├─ memos                              │
│  ├─ cron_schedules                     │
│  ├─ daily_logs          (vector)       │
│  ├─ knowledge_base      (vector)       │
│  ├─ document_sections   (vector)       │
│  └─ checkpoints (LangGraph state)      │
└────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Web UI** | Next.js 15 + Tailwind CSS + shadcn/ui |
| **Auth** | NextAuth.js (Credentials + Google OAuth) |
| **LLM** | Google Gemini / OpenAI GPT / Anthropic Claude |
| **Embedding** | gemini-embedding-001 (768 dims) |
| **Agent Framework** | LangGraph (ReAct pattern) |
| **Agent Runtime** | Python 3.13 + gRPC |
| **Gateway** | Go + Echo + go-telegram-bot-api |
| **Database** | PostgreSQL 16 + pgvector (HNSW) |
| **File Storage** | MinIO |
| **Messaging** | Telegram Bot API |
| **Scheduler** | robfig/cron (KST) |
| **Containerization** | Docker Compose |

---

## Project Structure

```
starpion/
├── ui/                             # Next.js Web UI
│   ├── app/
│   │   ├── (dashboard)/            # Dashboard pages
│   │   │   ├── finance/            # 가계부
│   │   │   ├── budget/             # 예산 관리
│   │   │   ├── statistics/         # 소비 분석
│   │   │   ├── diary/              # 일기
│   │   │   ├── goals/              # 목표 관리
│   │   │   ├── memo/               # 메모
│   │   │   ├── analytics/          # 통계/분석
│   │   │   ├── chat/               # 웹챗
│   │   │   └── settings/           # 설정
│   │   └── api/                    # Next.js API routes (proxy)
│   └── components/                 # UI components
├── agent/                          # Python Agent Service
│   └── src/starpion_agent/
│       ├── graph/agent.py          # LangGraph ReAct agent
│       ├── grpc/server.py          # gRPC server
│       ├── tools/                  # Agent tools
│       ├── memory/retriever.py     # 4-layer memory retriever
│       └── embedding/service.py   # Gemini embedding service
├── gateway/                        # Go Gateway Service
│   ├── cmd/gateway/                # Entry point
│   └── internal/
│       ├── handler/                # REST API handlers
│       ├── telegram/               # Telegram bot
│       ├── scheduler/              # Cron scheduler
│       ├── identity/               # Platform identity service
│       └── storage/                # MinIO file storage
├── proto/starpion/v1/              # gRPC service definition
└── docker/
    ├── docker-compose.yml          # Full stack orchestration
    ├── init.sql                    # Database schema + pgvector
    ├── migrations/                 # Incremental DB migrations
    └── Dockerfile.*                # Container definitions
```

---

## Quick Start

### Prerequisites

- Python 3.13+, Go 1.22+, Node.js 20+, Docker
- Google Gemini API Key (or OpenAI / Anthropic)
- Telegram Bot Token (optional, [@BotFather](https://t.me/BotFather))

### Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env: GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, DATABASE_URL

# 2. Start infrastructure (PostgreSQL + MinIO)
cd docker && docker compose up -d postgres minio

# 3. Start Agent (Python gRPC server)
cd agent && uv run python -m starpion_agent
# → gRPC server starting on [::]:50051

# 4. Start Gateway (Go HTTP + Telegram)
cd gateway && go run ./cmd/gateway
# → Gateway server starting on :8080

# 5. Start Web UI
cd ui && pnpm install && pnpm dev
# → Next.js running on http://localhost:3000
```

### Verify

```bash
# Health check
curl localhost:8080/healthz
# → {"status":"ok"}

# HTTP API test
curl -X POST http://localhost:8080/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "test-user", "message": "점심 만원"}'
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| POST | `/api/v1/chat` | Send message to agent |
| POST | `/api/v1/chat/stream` | SSE streaming chat |
| GET/POST | `/api/v1/finance/transactions` | 가계부 CRUD |
| GET/PUT | `/api/v1/budget` | 예산 관리 |
| GET | `/api/v1/statistics` | 소비 통계 |
| GET/POST | `/api/v1/diary/entries` | 일기 CRUD |
| GET/POST | `/api/v1/goals` | 목표 관리 CRUD |
| GET/POST | `/api/v1/memos` | 메모 CRUD |
| GET/POST | `/api/v1/cron/schedules` | 스케줄 관리 |
| GET/POST | `/api/v1/providers` | LLM 프로바이더 설정 |
| GET/POST | `/api/v1/personas` | 페르소나 관리 |

---

## License

Private project. All rights reserved.
