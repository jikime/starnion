---
title: Architecture Overview
nav_order: 1
parent: Architecture
grand_parent: 🇺🇸 English
---

# Architecture Overview

StarNion is a fully self-hostable AI personal assistant. All data is stored on the user's own server, and the system is composed of five core services.

---

## Overall System Structure

```
┌─────────────────────────────────────────────────────────┐
│                      User Access                         │
│                                                         │
│   Web Browser          Telegram App                      │
│       │                    │                            │
└───────┼────────────────────┼────────────────────────────┘
        │                    │
        ▼                    ▼
┌───────────────┐   ┌────────────────────────────────────┐
│  UI (Next.js) │   │         Gateway (Go)               │
│   :3893       │──▶│              :8080                 │
│               │   │                                    │
│  - Chat UI    │   │  ┌──────────┐  ┌────────────────┐  │
│  - Dashboard  │   │  │ REST API │  │ Telegram Bot   │  │
│  - 24+ Pages  │   │  │ /api/v1/ │  │   Manager      │  │
│  - Settings   │   │  └────┬─────┘  └───────┬────────┘  │
└───────────────┘   │       │                │            │
                    │  ┌────┴────────────────┘            │
                    │  │  WebSocket Hub (/ws/chat)        │
                    │  └────────────────┬─────────────────┘
                    │                   │ gRPC
                    └───────────────────┼────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │          Agent (TypeScript)            │
                    │             :50051                     │
                    │                                       │
                    │  ┌─────────────────────────────────┐  │
                    │  │     AI SDK v5 · Multi-LLM       │  │
                    │  │                                 │  │
                    │  │  24+ Skills: finance, diary,    │  │
                    │  │  goals, search, wellness, ...   │  │
                    │  └──────────────┬──────────────────┘  │
                    │                 │                      │
                    │  ┌──────────────┴──────────────────┐  │
                    │  │      SSE Streaming               │  │
                    │  └──────────────┬──────────────────┘  │
                    └─────────────────┼──────────────────────┘
                                      │
                    ┌─────────────────┴──────────────────────┐
                    │                                         │
                    ▼                         ▼               │
         ┌──────────────────┐    ┌──────────────────────┐    │
         │  PostgreSQL      │    │       MinIO           │    │
         │  (pgvector)      │    │  (Object Storage)     │    │
         │                  │    │                       │    │
         │  - Conversations │    │  - Images             │    │
         │  - Finances      │    │  - Audio              │    │
         │  - Diary/Memos   │    │  - Document files     │    │
         │  - Embeddings    │    │  - Generated files    │    │
         └──────────────────┘    └──────────────────────┘    │
                                                              │
         ┌────────────────────────────────────────────────┐  │
         │              LLM Providers                     │──┘
         │  Gemini / OpenAI / Claude / GLM / Ollama       │
         └────────────────────────────────────────────────┘
```

---

## Five Core Services

### 1. UI (Next.js) — Port 3893

The web front end. This is the interface users interact with directly in the browser.

- **Chat interface:** Real-time streaming responses, file attachments, conversation history
- **Dashboard:** Finance summary, goal status, D-Day, diary, memos, documents, images
- **24+ Feature pages:** Finance, budget, analytics, diary, wellness, garden, goals, D-Day, memos, memory, reports, statistics, search, skills, personas, models, channels, logs, usage, files, and more
- **Settings:** Provider & model management, Telegram channel config, notification center (cron)
- **i18n:** 4-language support (Korean, English, Japanese, Chinese) via next-intl

Next.js API Routes act as a proxy, forwarding requests to the Gateway's REST API.

### 2. Gateway (Go) — Port 8080

The hub for all traffic. It acts as an intermediary between the UI and the AI agent.

- **REST API (`/api/v1/`):** Chat, file upload, settings, skill management, channel configuration, and more
- **WebSocket (`/ws/chat`):** Real-time streaming chat connections
- **Telegram BotManager:** Dynamically starts and stops Telegram bot instances per user
- **gRPC client:** Communicates with the TypeScript Agent
- **Cron Scheduler:** Per-user toggleable notification jobs (weekly report, budget warning, daily summary, etc.)
- **MinIO integration:** Stores uploaded files in object storage

Go's high concurrency capability ensures stable operation even when many users are connected simultaneously.

### 3. Agent (TypeScript/Node.js) — Port 50051 (gRPC)

The AI brain. A Vercel AI SDK v5-based agent analyzes messages and executes skills across multiple LLM providers.

- **AI SDK v5 Agent:** Message processing, skill selection, response generation
- **Multi-LLM:** Anthropic Claude, Google Gemini, OpenAI, GLM (Z.AI), Ollama
- **Skill system:** 24+ built-in skills — finance, diary, goals, wellness, search, memo, documents, image, audio, and more
- **SSE Streaming:** Real-time responses via AI SDK standard streaming format
- **Embedding service:** Converts text to vectors and stores them in PostgreSQL (pgvector)
- **RAG Memory:** 4-layer semantic memory across all user data

### 4. PostgreSQL (pgvector)

The primary data store. The pgvector extension also stores vector embeddings alongside regular data.

Stored data: conversation history, expense records, diary entries, memos, goals, D-Days, document indices, embedding vectors, channel settings, skill settings, personas, cron schedules, usage logs

### 5. MinIO (Object Storage)

The file store. It provides an S3-compatible API, so it can be replaced with AWS S3.

Stored files: uploaded images, audio, documents; AI-generated files (QR codes, generated images, etc.)

---

## Data Flow: Message Processing

Here is the processing flow when a user types "lunch 12,000 won today."

```
1. User → UI (Next.js)
   "lunch 12,000 won today"

2. UI → Gateway (HTTP POST /api/v1/chat or WebSocket)
   { message: "lunch 12,000 won today", user_id: "...", thread_id: "..." }

3. Gateway → Agent (gRPC Chat RPC)
   Called with server streaming

4. Agent: AI SDK v5 processing
   4-1. Message analysis: "recognized as food expense 12,000 won"
   4-2. Skill selection: finance skill
   4-3. DB query: check current month's food total
   4-4. Record expense: INSERT INTO finance_entries
   4-5. Generate response: "Recorded lunch 12,000 won. This month's food total: 87,500 won"

5. Agent → Gateway (gRPC streaming)
   Stream response token by token

6. Gateway → UI (WebSocket or SSE)
   Deliver real-time streaming

7. UI → User
   Display response on screen
```

---

## gRPC Communication

Gateway (Go) and Agent (TypeScript) communicate via gRPC.

```protobuf
// proto/starnion/v1/agent.proto (summary)
service AgentService {
  // Regular chat (server streaming)
  rpc Chat(ChatRequest) returns (stream ChatResponse);

  // Health check
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

Reasons for choosing gRPC:
- **Server streaming:** Delivers LLM responses in real time, token by token
- **Type safety:** Interface guaranteed via Protobuf schema
- **Efficiency:** HTTP/2-based with low latency

---

## WebSocket: Real-time Chat

Web UI chat is implemented with WebSocket. The Gateway's WebSocket Hub manages connections.

```
Browser ──WebSocket── Gateway Hub ──gRPC Stream── Agent
  │              /ws/chat           server streaming  │
  │◀─────────────────────────────────────────────────│
        real-time token-by-token streaming
```

Connection flow:
1. Browser establishes WebSocket connection to `/ws/chat?user_id=...`
2. User types a message → JSON is sent
3. Gateway sends a gRPC streaming request to Agent
4. Agent response tokens are immediately relayed over WebSocket
5. Characters appear on the browser screen in real time

---

## Multi-Channel: Single Agent

The Web UI and Telegram connect to the **same** TypeScript Agent.

```
Telegram user ──▶ Telegram Bot ──▶ Gateway ──▶ Agent ──▶ same DB
Web user      ──▶ WebSocket    ──▶ Gateway ──▶ Agent ──▶ same DB
```

Since anything recorded in either channel is stored in the same PostgreSQL database, a memo written on the web can be retrieved on Telegram and vice versa.

Each channel message is identified by the `platform` field: `web`, `telegram`.

---

## 4-Layer RAG Memory System

The four-layer memory structure the Agent uses when referencing past records.

```
Query: "What did I eat last week?"

Layer 1: Daily Logs (daily log vectors)
  ├─ Vector search over conversations from the past 7 days
  └─ Extract food-expense-related entries

Layer 2: Knowledge Base (knowledge base vectors)
  ├─ Spending pattern analysis results
  └─ Frequently visited restaurant patterns

Layer 3: Document Sections (document section vectors)
  └─ Indexed content from uploaded receipts and documents

Layer 4: Recent Finance (recent expense records)
  └─ Direct DB query of recent expense entries
```

By fetching relevant context from each layer and passing it to the LLM together, natural memory references like "I had samgyeopsal last week, right?" are possible.

---

## Multi-Provider LLM

The Agent supports multiple LLM providers. Users can switch providers and models in **Settings > Models** on the Web UI.

| Provider | Example Models | Notes |
|----------|---------------|-------|
| Anthropic Claude | claude-sonnet-4-5, claude-haiku | Long context handling |
| Google Gemini | gemini-2.0-flash, gemini-2.5-pro | Fast response, multimodal |
| OpenAI | gpt-4o, gpt-4o-mini | High-quality responses |
| GLM (Z.AI) | glm-4-flash, glm-4-plus | Chinese language strength |
| Ollama | llama3, mistral, qwen | Fully local (no internet required) |

Models and providers can be managed per-user via the Web UI or CLI: `starnion config models`.

---

## Security Considerations

### Self-hosted Design

StarNion is designed from the ground up for self-hosting.

- All personal data (conversations, expenses, diary entries) is stored only on the user's server
- Message content is sent to external servers only during LLM API calls, and only to the selected LLM provider
- Using Ollama enables fully offline operation

### JWT Authentication

Web UI login is JWT (JSON Web Token) based via NextAuth v5.

- The server issues a JWT upon login
- All subsequent API requests include the token
- Re-login is required when the token expires
- Gateway token validation ensures API-level security

### PostgreSQL Advisory Locks

PostgreSQL session-level advisory locks are used to prevent duplicate Telegram bot execution. This prevents the same bot token from being polled simultaneously by two Gateway instances.

### Data Isolation

Each user's data is completely isolated by the `user_id` foreign key. One user cannot access another user's data.
