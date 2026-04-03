---
layout: home
title: StarNion
nav_order: 1
---

# ✦ StarNion

**Personal AI Agent Platform** — Self-hosted, privacy-first AI that runs on your own infrastructure.
{: .fs-6 .fw-300 }

[Get Started](en/getting-started/introduction){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[GitHub](https://github.com/jikime/starnion){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Choose Your Language

| | Language | Documentation |
|-|----------|---------------|
| 🇰🇷 | 한국어 | [문서 보기](ko/) |
| 🇺🇸 | English | [View Docs](en/) |
| 🇨🇳 | 中文 | [查看文档](zh/) |
| 🇯🇵 | 日本語 | [ドキュメントを見る](ja/) |

---

## What is StarNion?

StarNion is a self-hosted personal AI agent platform. All your data stays on your own server while AI helps you manage your daily life more smartly.

| Feature | Description |
|---------|-------------|
| **Multi-channel** | Web UI · Telegram bot · WebSocket real-time chat |
| **Finance** | Natural language expense tracking & budget management |
| **Memory & RAG** | Semantic memory across all your data |
| **24+ Features** | Finance · Diary · Goals · Memos · Garden · Wellness · and more |
| **System Scheduler** | Per-user toggleable notification jobs |
| **Multi-LLM** | Anthropic Claude · Gemini · OpenAI · GLM · Ollama |
| **Language Preference** | AI responds in your chosen language (ko/en/ja/zh) |
| **Multimodal** | Image analysis · audio transcription · document parsing |
| **Privacy-first** | All data on your own PostgreSQL + MinIO |
| **Personas** | Custom AI personalities per conversation |

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
│                  │ gRPC                           │
└──────────────────┼───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│           TypeScript Agent  :50051                │
│  AI SDK v5  ·  Multi-LLM  ·  Skills  ·  RAG      │
└──────────────────┬───────────────────────────────┘
                   ▼
         PostgreSQL 16 + pgvector
                   │
                   ▼
              MinIO (S3)
```

---

## Quick Install

Prerequisites: **Node.js 20+**, **pnpm**, **uv**, **Docker**

```bash
npm install -g pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

Supports **macOS** (Apple Silicon & Intel) and **Linux** (amd64 & arm64).

After installation:

```bash
starnion setup   # Initial setup wizard (7 steps)
starnion start   # Start all services
```

Verify:

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

