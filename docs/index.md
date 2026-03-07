---
layout: home
title: StarNion
nav_order: 1
---

# ✦ StarNion

**Personal AI Assistant** — Self-hosted, privacy-first AI platform that runs on your own infrastructure.
{: .fs-6 .fw-300 }

[Get Started](getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/jikime/starnion){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Quick Install

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

Supports **macOS** (Apple Silicon & Intel) and **Linux** (amd64 & arm64).

---

## What is StarNion?

StarNion is a self-hosted AI assistant platform that puts you in control of your data and AI interactions.

| Feature | Description |
|---------|-------------|
| **Multi-provider AI** | Anthropic, OpenAI, Google Gemini, Z.AI |
| **Privacy-first** | All data stays on your infrastructure |
| **Multi-channel** | Web UI, Telegram, Discord |
| **Extensible** | Skills, personas, custom workflows |
| **Docker-ready** | One-command deployment with Docker Compose |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  StarNion                    │
│                                             │
│  ┌──────┐    ┌─────────┐    ┌───────────┐  │
│  │  UI  │───▶│ Gateway │───▶│   Agent   │  │
│  │ :3000│    │  :8080  │    │  :50051   │  │
│  └──────┘    └────┬────┘    └─────┬─────┘  │
│                   │               │         │
│             ┌─────▼──────────────▼─────┐   │
│             │  PostgreSQL  +  MinIO     │   │
│             └──────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- **UI** — Next.js web interface
- **Gateway** — Go REST/WebSocket API server
- **Agent** — Python AI engine (LangGraph + gRPC)
- **PostgreSQL** — Database with pgvector for semantic search
- **MinIO** — S3-compatible file storage

---

## Getting Started

1. [Install](install) the `starnion` CLI
2. Run `starnion setup` — interactive configuration wizard
3. Run `starnion dev` (native) or `starnion docker up` (Docker)

---

## Community & Support

- **Issues**: [github.com/jikime/starnion/issues](https://github.com/jikime/starnion/issues)
- **Releases**: [github.com/jikime/starnion/releases](https://github.com/jikime/starnion/releases)
