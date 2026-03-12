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
| **MinIO** | RELEASE.2024-01-01 or later |

**API Keys required:**

- At least one LLM provider: [Google Gemini](https://aistudio.google.com/), [OpenAI](https://platform.openai.com/), or [Anthropic](https://console.anthropic.com/)
- Telegram Bot Token — optional, from [@BotFather](https://t.me/BotFather)

---

## Installation

### One-line installer (Linux / macOS)

Requires **Node.js 20+** and **pnpm** to be installed beforehand.
`uv` is installed automatically if missing.

```bash
# Install pnpm if not already installed
npm install -g pnpm

curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

After installation, PostgreSQL + MinIO must be running before setup:

```bash
# 1. Start PostgreSQL + MinIO (skip if you already have them running)
cp ~/.starnion/docker/.env.example ~/.starnion/docker/.env   # set your passwords
docker compose -f ~/.starnion/docker/docker-compose.yml up -d postgres minio

# 2. Run the setup wizard (creates ~/.starnion/starnion.yaml)
starnion setup

# 3. Start all services
starnion dev              # native mode: gateway + agent + UI
# — or —
starnion docker up --build   # Docker mode: agent + gateway + UI (postgres/minio already running)
```

### From source

**Install prerequisites**

```bash
# pnpm — Node.js package manager (required for the Web UI)
npm install -g pnpm
```

Go 1.22+, Node.js 20+, and Docker must also be installed.
`uv` is installed automatically by `starnion setup` if missing.

**Clone & build**

```bash
git clone https://github.com/jikime/starnion.git
cd starnion

# Create docker environment file (edit passwords before starting)
cp docker/.env.example docker/.env

# Start PostgreSQL + MinIO (infrastructure only)
docker compose -f docker/docker-compose.yml up -d postgres minio

# Build the starnion CLI (outputs ./starnion in the project root)
make starnion
```

**Configure**

```bash
# Interactive setup wizard — creates ~/.starnion/starnion.yaml
./starnion setup
```

The wizard walks through: database connection, admin account, MinIO, service URLs, Google OAuth (optional), and embedding engine (optional).

**Run**

```bash
# Start all services: gateway (:8080) + agent (:50051) + UI (:3000)
./starnion dev
```

`starnion dev` automatically runs `uv sync` and `pnpm install` when dependencies are out of date. Press **Ctrl+C** to stop all services.

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
