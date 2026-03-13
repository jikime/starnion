---
layout: home
title: Starnion
nav_order: 1
---

# ✦ Starnion

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

## What is Starnion?

Starnion is a self-hosted personal AI agent platform. All your data stays on your own server while AI helps you manage your daily life more smartly.

| Feature | Description |
|---------|-------------|
| **Multi-channel** | Web UI, Telegram bot, WebSocket real-time chat |
| **Finance** | Natural language expense tracking & budget management |
| **Memory & RAG** | 4-layer semantic memory across all your data |
| **Skills** | 34 AI skills — diary, goals, memos, documents, and more |
| **System Scheduler** | 9 notification jobs individually toggleable per user |
| **Language Preference** | AI responds in your chosen language (ko/en/ja/zh) |
| **Multimodal** | Image analysis, audio transcription, document parsing |
| **Privacy-first** | All data on your own PostgreSQL + MinIO |
| **Multi-provider** | Gemini, OpenAI, Anthropic, Ollama support |

---

## Architecture

```
Web UI (Next.js) + Telegram
         │
         ▼
  Go Gateway (:8080)
  ├─ REST API + WebSocket
  ├─ Telegram Bot
  └─ gRPC Client ──────────▶ Python Agent (:50051)
                              ├─ LangGraph ReAct
                              ├─ 34 Skills
                              └─ 4-Layer Memory
                                      │
                              PostgreSQL + pgvector
                              MinIO (file storage)
```

---

## Quick Install

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

Supports **macOS** (Apple Silicon & Intel) and **Linux** (amd64 & arm64).
