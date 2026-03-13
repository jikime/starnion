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

**Key highlights:**
- **34 built-in skills** — finance, diary, goals, memos, documents, image/audio/video, web search, and more
- **System Scheduler Toggle** — 9 notification jobs (weekly report, budget warning, daily summary, etc.) can be individually enabled/disabled per user via Settings > Schedules > System tab
- **Language Preference** — Set your preferred language in Settings > Account; AI responds in Korean, English, Japanese, or Chinese
- **Multi-provider LLM** — Gemini, OpenAI, Anthropic, GLM (Z.AI), Ollama support

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

- At least one LLM provider: [Google Gemini](https://aistudio.google.com/), [OpenAI](https://platform.openai.com/), [Anthropic](https://console.anthropic.com/), [GLM/Z.AI](https://z.ai/), or any OpenAI-compatible endpoint (e.g. Ollama)
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

# 3. Start all services (native mode)
starnion dev
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

The wizard walks through: database connection, admin account, MinIO, service URLs, and embedding engine (optional).

**Run** (choose one)

Option A — Native mode (gateway + agent + UI as local processes):
```bash
./starnion dev
```

Option B — Docker mode (all services in containers, source tree required):
```bash
./starnion docker up --build
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
| Web UI | Next.js 16 · Tailwind CSS 4 · shadcn/ui |
| Auth | NextAuth.js (Credentials) |
| Gateway | Go · Echo · go-telegram-bot-api |
| Agent | Python 3.13 · LangGraph · gRPC |
| LLM | Google Gemini · OpenAI GPT · Anthropic Claude · GLM (Z.AI) · Ollama (custom) |
| Embedding | OpenAI text-embedding-3-small · Gemini gemini-embedding-001 (768-dim) |
| Database | PostgreSQL 16 · pgvector (HNSW) |
| File Storage | MinIO (S3-compatible) |
| Scheduler | robfig/cron (KST) |
| Runtime | Docker Compose |

> Architecture deep-dive: **[docs/en/architecture/overview](https://jikime.github.io/starnion/en/architecture/overview)**.

---

## Project Structure

```
starnion/
├── ui/                   # Next.js 16 Web UI
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

| | 🇺🇸 English | 🇰🇷 한국어 | 🇯🇵 日本語 | 🇨🇳 中文 |
|-|------------|-----------|----------|---------|
| Introduction | [Introduction](https://jikime.github.io/starnion/en/getting-started/introduction) | [소개](https://jikime.github.io/starnion/ko/getting-started/introduction) | [Starnionとは](https://jikime.github.io/starnion/ja/getting-started/introduction) | [简介](https://jikime.github.io/starnion/zh/getting-started/introduction) |
| Quick Start | [Quick Start](https://jikime.github.io/starnion/en/getting-started/quickstart) | [빠른 시작](https://jikime.github.io/starnion/ko/getting-started/quickstart) | [クイックスタート](https://jikime.github.io/starnion/ja/getting-started/quickstart) | [快速开始](https://jikime.github.io/starnion/zh/getting-started/quickstart) |
| Installation | [Installation](https://jikime.github.io/starnion/en/getting-started/installation) | [설치 가이드](https://jikime.github.io/starnion/ko/getting-started/installation) | [インストール](https://jikime.github.io/starnion/ja/getting-started/installation) | [安装指南](https://jikime.github.io/starnion/zh/getting-started/installation) |
| Architecture | [Architecture](https://jikime.github.io/starnion/en/architecture/overview) | [아키텍처](https://jikime.github.io/starnion/ko/architecture/overview) | [アーキテクチャ](https://jikime.github.io/starnion/ja/architecture/overview) | [架构](https://jikime.github.io/starnion/zh/architecture/overview) |

---

## License

Private project. All rights reserved.
