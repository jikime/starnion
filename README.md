<div align="center">

![StarNion Banner](ui/public/brand_banner.webp)

# STARNION

**Your Stellar Companion in Every Task.**

A hyper-personalized AI agent platform for finance, journaling, goals, and daily life — accessible from Web and Telegram.

[![Release](https://img.shields.io/github/v/release/jikime/starnion)](https://github.com/jikime/starnion/releases)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](LICENSE)

[Documentation](https://jikime.github.io/starnion/) · [Installation Guide](https://jikime.github.io/starnion/en/getting-started/installation) · [Korean Docs](https://jikime.github.io/starnion/ko/)

</div>

---

## What is Starnion?

Starnion is an AI agent platform built around **Nion**, your personal AI companion. Talk to Nion in natural language to track expenses, write diary entries, set goals, search your memories, and more — across Web UI and Telegram.

> Full feature documentation is available at **[jikime.github.io/starnion](https://jikime.github.io/starnion/)**.

---

## Requirements

| Component | Minimum Version |
|-----------|----------------|
| **Go** | 1.22+ |
| **Python** | 3.13+ |
| **Node.js** | 20+ |
| **Docker** | 24+ (with Compose v2) |
| **PostgreSQL** | 16 + pgvector |

**API Keys required:**

- At least one LLM provider: [Google Gemini](https://aistudio.google.com/), [OpenAI](https://platform.openai.com/), or [Anthropic](https://console.anthropic.com/)
- Telegram Bot Token — optional, from [@BotFather](https://t.me/BotFather)

---

## Installation

### One-line installer (Linux / macOS)

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### From source

```bash
# 1. Clone
git clone https://github.com/jikime/starnion.git
cd starnion

# 2. Configure environment
cp .env.example .env
# Edit .env — set your LLM API key and (optionally) Telegram bot token

# 3. Start infrastructure
docker compose -f docker/docker-compose.yml up -d postgres minio

# 4. Start Python agent  (gRPC :50051)
cd agent && uv run python -m starnion_agent

# 5. Start Go gateway   (HTTP :8080 + Telegram polling)
cd gateway && go run ./cmd/gateway

# 6. Start Web UI       (http://localhost:3000)
cd ui && pnpm install && pnpm dev
```

### Verify

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

> For detailed configuration options, Docker-only setup, and production deployment, see the **[Installation Guide](https://jikime.github.io/starnion/en/getting-started/installation)**.

---

## Architecture

```
┌──────────────────────┐   ┌──────────────────────┐
│   Web UI (Next.js)   │   │   Telegram Bot        │
│   localhost:3000      │   │   (polling)           │
└──────────┬───────────┘   └──────────┬────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────────────────────────────────┐
│              Go Gateway  :8080                    │
│  REST API  ·  WebSocket  ·  Cron Scheduler        │
│                  │ gRPC (unary)                   │
└──────────────────┼───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│           Python Agent  :50051                    │
│  LangGraph ReAct  ·  Multi-LLM  ·  RAG           │
│  Tools: finance · diary · goals · memo · files   │
│  4-Layer Memory: logs · knowledge · docs · DB    │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│        PostgreSQL 16 + pgvector   (HNSW)          │
└──────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────┐
│  MinIO (S3)     │  images · audio · documents
└─────────────────┘
```

| Layer | Technology |
|-------|------------|
| Web UI | Next.js 15 · Tailwind CSS · shadcn/ui |
| Auth | NextAuth.js (Credentials + Google OAuth) |
| Gateway | Go · Echo · go-telegram-bot-api |
| Agent | Python 3.13 · LangGraph · gRPC |
| LLM | Google Gemini · OpenAI GPT · Anthropic Claude |
| Embedding | gemini-embedding-001 (768-dim) |
| Database | PostgreSQL 16 · pgvector (HNSW) |
| File Storage | MinIO (S3-compatible) |
| Scheduler | robfig/cron (KST) |
| Runtime | Docker Compose |

> Architecture deep-dive: **[docs/en/architecture/overview](https://jikime.github.io/starnion/en/architecture/overview)**.

---

## Project Structure

```
starnion/
├── ui/                   # Next.js 15 Web UI
├── agent/                # Python LangGraph agent (gRPC :50051)
├── gateway/              # Go gateway — REST API + Telegram + Cron
├── proto/                # Protobuf / gRPC definitions
└── docker/
    ├── docker-compose.yml
    ├── init.sql           # Database schema (PostgreSQL 16 + pgvector)
    └── migrations/        # Incremental schema migrations
```

---

## Documentation

Full documentation is hosted at **[jikime.github.io/starnion](https://jikime.github.io/starnion/)**.

| | 🇺🇸 English | 🇰🇷 한국어 |
|-|------------|-----------|
| Introduction | [Introduction](https://jikime.github.io/starnion/en/getting-started/introduction) | [소개](https://jikime.github.io/starnion/ko/getting-started/introduction) |
| Quick Start | [Quick Start](https://jikime.github.io/starnion/en/getting-started/quickstart) | [빠른 시작](https://jikime.github.io/starnion/ko/getting-started/quickstart) |
| Installation | [Installation](https://jikime.github.io/starnion/en/getting-started/installation) | [설치 가이드](https://jikime.github.io/starnion/ko/getting-started/installation) |
| Architecture | [Architecture](https://jikime.github.io/starnion/en/architecture/overview) | [아키텍처](https://jikime.github.io/starnion/ko/architecture/overview) |

---

## License

Private project. All rights reserved.
