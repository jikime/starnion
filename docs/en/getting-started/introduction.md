---
layout: default
title: What is StarNion?
nav_order: 1
parent: Getting Started
grand_parent: 🇺🇸 English
---

# What is StarNion?
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Overview

**StarNion** is a fully self-hosted personal AI assistant platform. All data and AI interactions run on your own infrastructure — no data is ever sent to external servers beyond the LLM API calls you authorize.

It gives you complete control over your personal information and data sovereignty, while retaining the convenience of cloud AI services.

---

## Core Concepts

### Personal AI Agent

StarNion's AI agent is more than a simple chatbot. It is an intelligent agent that processes complex tasks step by step using the **Vercel AI SDK v5** with a multi-LLM backend.

- **Multi-provider LLM**: Anthropic Claude, Google Gemini, OpenAI, GLM (Z.AI), Ollama
- **Skill system**: 24+ built-in skills — finance, diary, goals, wellness, search, and more
- **Conversation context management** with RAG-based memory
- **Tool Calls**: agent executes skill functions autonomously
- **Personas**: custom AI personalities configurable per context

### Privacy-first

```
Your data = stored only on your infrastructure
```

- All conversation history is stored in your own PostgreSQL database
- Only the minimum necessary text is sent when making LLM API calls
- Files, images, and audio are kept in your own MinIO storage
- No third-party analytics or tracking code

### Self-hosted

```
Running on your server = complete control
```

- The entire stack launches with a single `starnion dev` command
- Can be run anywhere — cloud, on-premises, or a home server
- Local AI models supported via Ollama (no internet required)
- Full control over data backup and migration

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Multi-LLM** | Anthropic Claude · Gemini · OpenAI · GLM · Ollama |
| **Web UI** | Next.js 16 web interface with 24+ feature pages |
| **Telegram Channel** | AI chat via Telegram bot |
| **i18n** | 4-language UI (Korean · English · Japanese · Chinese) |
| **Finance Tracker** | Record and query expenses in natural language |
| **Budget Management** | Monthly budgets with spending alerts |
| **Diary** | AI-assisted journal writing with mood tracking |
| **Goal Management** | Set, track, and check in on personal goals |
| **D-Day** | Countdown timers for important dates |
| **Memos** | Quick notes with tag filtering |
| **Garden & Wellness** | Data visualization garden + mood/wellness check-ins |
| **Reports & Statistics** | Automated periodic summaries and charts |
| **Personas** | Per-context AI personality configuration |
| **Skills Management** | Enable/disable AI tool skills per provider |
| **Web Search** | AI-powered real-time web search |
| **AI Memory** | Semantic (RAG) memory across all your data |
| **File Management** | Documents, images, audio upload & analysis |
| **Notification Center** | Per-user cron jobs (budget alerts, daily summaries, etc.) |
| **Usage Analytics** | LLM token usage and cost tracking |
| **Docker Support** | `starnion dev` or `starnion docker up` |
| **Real-time Streaming** | SSE/gRPC-based response streaming |

---

## Architecture

```
┌──────────────────────┐   ┌──────────────────────┐
│   Web UI (Next.js)   │   │   Telegram Bot        │
│   localhost:3893     │   │   (polling)           │
└──────────┬───────────┘   └──────────┬────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────────────────────────────────┐
│              Go Gateway  :8080                    │
│  REST API  ·  WebSocket  ·  Cron Scheduler        │
│                  │ gRPC (streaming)               │
└──────────────────┼───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│           TypeScript Agent  :50051                │
│  AI SDK v5  ·  Multi-LLM  ·  Skills              │
│  Streaming SSE  ·  Tool Calls  ·  RAG Memory     │
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

### Component Descriptions

| Component | Role | Tech Stack |
|-----------|------|------------|
| **Web UI** | Web interface + Auth | Next.js 16 · React 19 · TypeScript · NextAuth v5 |
| **Gateway** | REST API · WebSocket · Telegram · Cron | Go 1.22+ · Echo v4 |
| **Agent** | AI engine · gRPC server · Skill execution | TypeScript · AI SDK v5 · gRPC |
| **PostgreSQL** | Main database · vector search | PostgreSQL 16 + pgvector |
| **MinIO** | File storage | MinIO (S3-compatible) |
| **CLI** | Service management · Setup wizard | Go |

### Data Flow

```
User Message
     │
     ▼
  Web UI (Next.js)  or  Telegram Bot
     │ HTTP / WebSocket
     ▼
  Gateway (Go)
     │ gRPC streaming
     ▼
  Agent (TypeScript / AI SDK v5)
     │
     ├──▶ LLM API (Anthropic / Gemini / OpenAI / Ollama)
     ├──▶ Skill execution (finance, diary, goals, search, ...)
     ├──▶ PostgreSQL (conversation storage / vector search)
     └──▶ MinIO (file access)
     │
     ▼
  Streaming response → Gateway → UI
```

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Go | 1.22+ | Gateway API server + CLI |
| TypeScript / Node.js | 20+ | AI agent engine |
| Vercel AI SDK | v5 | LLM communication and streaming |
| gRPC | - | Gateway ↔ Agent communication |
| PostgreSQL | 16+ | Database |
| pgvector | - | Vector embeddings / semantic search |
| MinIO | latest | S3-compatible file storage |
| robfig/cron | v3 | Per-user cron scheduler |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16 | Web framework |
| React | 19 | UI library |
| TypeScript | 5+ | Type safety |
| NextAuth | v5 | Authentication |
| Tailwind CSS | 4 | Styling |
| shadcn/ui | - | UI component library |
| next-intl | 4 | Internationalization (ko/en/ja/zh) |

### Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| Docker | 24+ | Containerization |
| Docker Compose | v2 | Orchestration |
| GoReleaser | v2 | CLI release automation |

---

## Who is it for?

### Individual Users

- Those who want full control over their AI conversations without entrusting them to cloud services
- Those who want to manage personal journals, memos, goals, and finances together with AI
- Those who want to access their personal AI assistant anywhere via Telegram

### Developers / Technical Users

- Developers who want to build and extend their own AI platform
- Those who want to add custom functionality through the Skill system
- Those studying AI agent architecture

### Not the Right Fit

- Those who want an immediately usable cloud service with no server management → Recommend ChatGPT, Claude.ai, etc.
- Cases requiring hundreds of concurrent users → Additional scaling work will be needed

---

## Next Steps

- [Quick Start](quickstart) — Run StarNion right now
- [Installation Guide](installation) — Detailed installation instructions
- [Configuration](configuration) — Environment variables and API key setup
