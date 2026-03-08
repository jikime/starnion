---
layout: default
title: What is Starnion?
nav_order: 1
parent: Getting Started
---

# What is Starnion?
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Overview

**Starnion** is a fully self-hosted personal AI assistant platform. All data and AI interactions run on your own infrastructure, and no data is ever sent to external servers.

It is designed to give you complete control over your personal information and data sovereignty, while retaining the convenience of cloud AI services.

---

## Core Concepts

### Personal AI Agent

Starnion's AI agent is more than a simple chatbot. It is an intelligent agent that processes complex tasks step by step through a LangGraph-based graph workflow.

- Multi-AI provider support (Anthropic Claude, OpenAI GPT, Google Gemini, Z.AI)
- Feature extension through the Skill system
- Long-term memory and context management
- External service integration via Tool Calls

### Privacy-first

```
Your data = stored only on your infrastructure
```

- All conversation history is stored in your own PostgreSQL database
- Only the minimum necessary information is sent when making AI API calls
- Files, images, and documents are kept in your own MinIO storage
- No third-party analytics services or tracking code

### Self-hosted

```
Running on your server = complete control
```

- The entire stack can be launched with a single Docker Compose command
- Can be run anywhere — cloud, on-premises, or a home server
- Can be used with local AI models without an internet connection (future support)
- You have direct control over data backup and migration

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Multi-AI Providers** | Simultaneous support for Anthropic, OpenAI, Google Gemini, Z.AI |
| **Multi-Channel** | Access via Web UI, Telegram, and Discord |
| **Skill System** | 30+ built-in skills including weather, translation, search, and scheduling |
| **Document Processing** | PDF and DOCX upload with semantic search (pgvector) |
| **Image Analysis** | Image upload and AI analysis |
| **Audio Processing** | Voice memo upload and transcription |
| **Web Search** | Real-time web search integration |
| **Personas** | User-defined AI personality and prompts |
| **Docker Support** | Single-command deployment |
| **Real-time Streaming** | WebSocket-based real-time response streaming |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Starnion                              │
│                                                             │
│  ┌──────────────┐    ┌───────────────┐    ┌─────────────┐  │
│  │      UI      │    │    Gateway    │    │    Agent    │  │
│  │  (Next.js)   │───▶│  (Go + REST)  │───▶│  (Python)   │  │
│  │   :3000      │    │    :8080      │    │   :50051    │  │
│  └──────────────┘    └──────┬────────┘    └──────┬──────┘  │
│                             │                    │         │
│                    ┌────────▼────────────────────▼──────┐  │
│                    │                                    │  │
│                    │  ┌──────────────┐ ┌────────────┐  │  │
│                    │  │  PostgreSQL  │ │   MinIO    │  │  │
│                    │  │ (+ pgvector) │ │ (Storage)  │  │  │
│                    │  │    :5432     │ │   :9000    │  │  │
│                    │  └──────────────┘ └────────────┘  │  │
│                    │         Infrastructure Layer        │  │
│                    └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

Channel Integrations:
  Telegram Bot ──▶ Gateway
  Discord Bot  ──▶ Gateway
  Web Browser  ──▶ UI ──▶ Gateway
```

### Component Descriptions

| Component | Role | Tech Stack |
|-----------|------|------------|
| **UI** | Web interface | Next.js 15, React 19, TypeScript |
| **Gateway** | REST API server / WebSocket | Go 1.22+, Gin |
| **Agent** | AI engine / gRPC server | Python 3.13+, LangGraph, gRPC |
| **PostgreSQL** | Main database / vector search | PostgreSQL 16 + pgvector |
| **MinIO** | File storage | MinIO (S3-compatible) |

### Data Flow

```
User Message
     │
     ▼
  UI (Next.js)
     │ HTTP / WebSocket
     ▼
  Gateway (Go)
     │ gRPC
     ▼
  Agent (Python / LangGraph)
     │
     ├──▶ AI API (Gemini / Claude / GPT)
     ├──▶ Skill execution (weather, search, translation...)
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
| Go | 1.22+ | Gateway API server |
| Python | 3.13+ | AI agent engine |
| LangGraph | latest | AI workflow graph |
| gRPC | - | Gateway ↔ Agent communication |
| PostgreSQL | 16+ | Database |
| pgvector | - | Vector embeddings / semantic search |
| MinIO | latest | S3-compatible file storage |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15 | Web framework |
| React | 19 | UI library |
| TypeScript | 5+ | Type safety |
| NextAuth | v5 | Authentication |
| Tailwind CSS | - | Styling |

### Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| Docker | 24+ | Containerization |
| Docker Compose | v2 | Orchestration |
| uv | latest | Python package management |
| pnpm | latest | Node.js package management |

---

## Who is it for?

Starnion is a good fit for:

### Individual Users

- Those who want full control over their AI conversations without entrusting them to cloud services
- Those who want to manage personal journals, memos, and goals together with AI
- Those who want to access their personal AI assistant anywhere via Telegram

### Developers / Technical Users

- Developers who want to build their own AI platform
- Those who want to add custom functionality through the Skill system
- Those who want to study AI agent architecture

### Small Teams

- Teams that want to operate an in-house AI assistant
- Businesses that do not want to send customer data to external services
- Teams that need AI access across multiple channels (web, Telegram, Discord)

### Not the Right Fit

- Those who want an immediately usable cloud service with no server management → We recommend ChatGPT, Claude.ai, etc.
- Cases that need to handle hundreds or more concurrent users → Additional scaling work will be required

---

## Next Steps

- [Quick Start (5 minutes)](quickstart) — Run Starnion right now
- [Installation Guide](installation) — Detailed installation instructions
- [Configuration](configuration) — Environment variables and API key setup
