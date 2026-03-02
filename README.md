# OlyOwl

**Oly the Owl** — 친근하면서도 영리한 밤의 AI 비서

> 어둠 속에서도 미세한 소리(데이터)를 포착해 정확히 낚아채는(Retrieval) 정교함.

---

## About the Name

**Oly** (올리): **O**mni-**L**ayer **Y**ield. 모든 데이터 레이어에서 최고의 결과물(통찰)을 뽑아낸다는 약자 조합이면서, 부르기 쉽고 친근합니다.

**Owl** (올빼미): 'Oly'에서 자연스럽게 연상되는 올빼미는 밤의 지배자이자 지혜의 상징입니다.

- **Omni-directional**: 올빼미는 목을 270도 회전하여 모든 방향을 살핍니다. 이는 사용자의 모든 데이터 레이어(Omni-Layer)를 감시하고 분석하는 에이전트의 능력과 일치합니다.
- **Precision Retrieval**: 어둠 속에서도 미세한 소리(데이터)를 포착해 정확히 낚아채는(Retrieval) 정교함을 상징합니다.

---

## Overview

OlyOwl은 Telegram 기반 Hyper-Personalized AI Agent입니다. 자연어 가계부, 일상 기록, 메모리/RAG 검색, 멀티모달 입력, 예산 관리, 프로액티브 알림을 제공합니다.

### Core Features

| Feature | Description |
|---------|-------------|
| **Natural Language Finance** | "점심 김치찌개 9000원" → 자동 카테고리 분류 + 기록 |
| **Budget Management** | 카테고리별 예산 설정, 사용률 추적, 초과 경고 |
| **Daily Log** | 일상 기록 저장 + 감정 분석 + 벡터 임베딩 |
| **Memory/RAG** | 4계층 메모리 검색 (일상기록, 지식, 문서, 가계부) |
| **Multimodal** | 이미지 분석, PDF 텍스트 추출, 음성 인식 |
| **Proactive Notifications** | 주간 리포트 자동 발송 (매주 월요일 09:00 KST) |

---

## Architecture

```
Telegram
   │
   ▼
┌─────────────────────────────────────┐
│  Go Gateway (:8080)                 │
│  ├─ Telegram Bot (polling)          │
│  │   ├─ 👀 Reaction + Typing Loop  │
│  │   ├─ Message Chunking (4096)     │
│  │   └─ Markdown Fallback           │
│  ├─ HTTP API (/api/v1/chat)         │
│  ├─ Cron Scheduler (weekly report)  │
│  └─ gRPC Client ─────────────────┐ │
└───────────────────────────────────┼─┘
                                    │ gRPC (unary)
                                    ▼
┌─────────────────────────────────────┐
│  Python Agent (:50051)              │
│  ├─ LangGraph ReAct Agent           │
│  │   └─ Gemini 2.5 Flash LLM       │
│  ├─ Tools                           │
│  │   ├─ save_finance                │
│  │   ├─ get_monthly_total           │
│  │   ├─ retrieve_memory (RAG)       │
│  │   ├─ save_daily_log              │
│  │   ├─ set_budget / get_budget     │
│  │   ├─ process_image (Vision)      │
│  │   ├─ process_document (PDF)      │
│  │   └─ process_voice (STT)         │
│  ├─ Embedding Service               │
│  │   └─ gemini-embedding-001 (768d) │
│  └─ 4-Layer Memory Retriever        │
│      ├─ daily_logs (vector)         │
│      ├─ knowledge_base (vector)     │
│      ├─ document_sections (vector)  │
│      └─ finances (recent)           │
└───────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  PostgreSQL 16 + pgvector           │
│  ├─ profiles                        │
│  ├─ finances                        │
│  ├─ daily_logs          (vector)    │
│  ├─ knowledge_base      (vector)    │
│  ├─ user_documents                  │
│  ├─ document_sections   (vector)    │
│  └─ checkpoints (LangGraph state)   │
└─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **LLM** | Google Gemini 2.5 Flash |
| **Embedding** | gemini-embedding-001 (768 dims) |
| **Agent Framework** | LangGraph (ReAct pattern) |
| **Agent Runtime** | Python 3.13 + gRPC |
| **Gateway** | Go + Echo + go-telegram-bot-api |
| **Database** | PostgreSQL 16 + pgvector (HNSW) |
| **Messaging** | Telegram Bot API |
| **Scheduler** | robfig/cron (KST) |
| **Containerization** | Docker Compose |

---

## Project Structure

```
olyowl/
├── agent/                          # Python Agent Service
│   └── src/jiki_agent/
│       ├── graph/agent.py          # LangGraph ReAct agent
│       ├── grpc/server.py          # gRPC server (AgentServiceServicer)
│       ├── tools/                  # Agent tools
│       │   ├── finance.py          #   Natural language finance
│       │   ├── memory.py           #   RAG memory retrieval
│       │   ├── daily_log.py        #   Daily log recording
│       │   ├── budget.py           #   Budget management
│       │   ├── multimodal.py       #   Image/PDF/voice processing
│       │   └── report.py           #   Weekly report generation
│       ├── memory/retriever.py     # 4-layer memory retriever
│       ├── embedding/service.py    # Gemini embedding service
│       ├── document/               # PDF parsing + chunking
│       └── db/repositories/        # Database access layer
├── gateway/                        # Go Gateway Service
│   ├── cmd/gateway/                # Entry point
│   └── internal/
│       ├── telegram/bot.go         # Telegram bot (reaction + typing)
│       ├── scheduler/cron.go       # Proactive notification scheduler
│       ├── handler/chat.go         # HTTP API handler
│       └── middleware/cors.go      # CORS middleware
├── proto/jiki/v1/agent.proto       # gRPC service definition
├── docker/
│   ├── docker-compose.yml          # Full stack orchestration
│   ├── init.sql                    # Database schema + pgvector
│   └── Dockerfile.*                # Container definitions
└── docs/                           # Documentation
```

---

## Quick Start

### Prerequisites

- Python 3.13+, Go 1.25+, Docker
- Google Gemini API Key
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))

### Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env: GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, DATABASE_URL

# 2. Start PostgreSQL
cd docker && docker compose up -d postgres

# 3. Start Agent (Python gRPC server)
cd agent && uv run python -m jiki_agent
# → gRPC server starting on [::]:50051

# 4. Start Gateway (Go HTTP + Telegram)
cd gateway && go run ./cmd/gateway
# → Telegram bot polling started
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
| POST | `/api/v1/report` | Trigger manual weekly report |

---

## License

Private project.
