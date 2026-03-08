---
title: Architecture Overview
nav_order: 1
parent: Architecture
---

# Architecture Overview

Starnion is a fully self-hostable AI personal assistant. All data is stored on the user's own server, and the system is composed of five core services.

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
│   :3000       │──▶│              :8080                 │
│               │   │                                    │
│  - Chat UI    │   │  ┌──────────┐  ┌────────────────┐  │
│  - Dashboard  │   │  │ REST API │  │ Telegram Bot   │  │
│  - Settings   │   │  │ /api/v1/ │  │   Manager      │  │
│  - Search bar │   │  └────┬─────┘  └───────┬────────┘  │
└───────────────┘   │       │                │            │
                    │  ┌────┴────────────────┘            │
                    │  │  WebSocket Hub (/ws/chat)        │
                    │  └────────────────┬─────────────────┘
                    │                   │ gRPC
                    └───────────────────┼────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │          Agent (Python)               │
                    │             :50051                    │
                    │                                       │
                    │  ┌─────────────────────────────────┐  │
                    │  │      LangGraph Agent            │  │
                    │  │                                 │  │
                    │  │  Skills: finance, weather,      │  │
                    │  │  diary, memo, image, ...        │  │
                    │  └──────────────┬──────────────────┘  │
                    │                 │                      │
                    │  ┌──────────────┴──────────────────┐  │
                    │  │      4-Layer RAG Memory          │  │
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
         │  Gemini / OpenAI / Claude / Ollama (local)     │
         └────────────────────────────────────────────────┘
```

---

## Five Core Services

### 1. UI (Next.js) — Port 3000

The web front end. This is the interface users interact with directly in the browser.

- **Chat interface:** Real-time streaming responses, file attachments, conversation history
- **Dashboard:** Expense summary, goal status, recent activity
- **Settings:** Skill management, channel (Telegram) configuration, provider configuration
- **Search bar:** Fast local search via the top search bar

Next.js API Routes act as a proxy, forwarding requests to the Gateway's REST API.

### 2. Gateway (Go) — Port 8080

The hub for all traffic. It acts as an intermediary between the UI and the AI agent.

- **REST API (`/api/v1/`):** Chat, file upload, settings, skill management, channel configuration, and more
- **WebSocket (`/ws/chat`):** Real-time streaming chat connections
- **Telegram BotManager:** Dynamically starts and stops Telegram bot instances per user
- **gRPC client:** Communicates with the Python Agent
- **Scheduler:** Runs periodic tasks such as reminders and reports
- **MinIO integration:** Stores uploaded files in object storage

Go's high concurrency capability ensures stable operation even when many users are connected simultaneously.

### 3. Agent (Python) — Port 50051 (gRPC)

The AI brain. A LangGraph-based agent analyzes messages and executes skills.

- **LangGraph Agent:** Message routing, skill selection, response generation
- **Skill system:** 34 independent skill modules (weather, finance, diary, etc.)
- **4-Layer RAG memory:** References past records via vector search
- **Multi-LLM support:** Can switch among multiple providers — Gemini, OpenAI, Claude, Ollama, etc.
- **Embedding service:** Converts text to vectors and stores them in PostgreSQL (pgvector)

### 4. PostgreSQL (pgvector)

The primary data store. The pgvector extension also stores vector embeddings alongside regular data.

Stored data: conversation history, expense records, diary entries, memos, goals, D-Days, document indices, embedding vectors, channel settings, skill settings

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

4. Agent: LangGraph processing
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

Gateway (Go) and Agent (Python) communicate via gRPC.

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

The Web UI and Telegram connect to the **same** Python Agent.

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

The Agent supports multiple LLM providers and can be switched by the user or administrator in Settings.

| Provider | Example Models | Notes |
|----------|---------------|-------|
| Google Gemini | gemini-2.0-flash | Fast response, multimodal |
| OpenAI | gpt-4o, gpt-4o-mini | High-quality responses |
| Anthropic Claude | claude-3-5-sonnet | Long context handling |
| Ollama | llama3, mistral | Fully local (no internet required) |

Change the provider setting under **Settings > Models**.

---

## Security Considerations

### Self-hosted Design

Starnion is designed from the ground up for self-hosting.

- All personal data (conversations, expenses, diary entries) is stored only on the user's server
- Message content is sent to external servers only during LLM API calls, and only to the selected LLM provider
- Using Ollama enables fully offline operation

### JWT Authentication

Web UI login is JWT (JSON Web Token) based.

- The server issues a JWT upon login
- All subsequent API requests include the token
- Re-login is required when the token expires

### PostgreSQL Advisory Locks

PostgreSQL session-level advisory locks are used to prevent duplicate Telegram bot execution. This prevents the same bot token from being polled simultaneously by two Gateway instances.

### Data Isolation

Each user's data is completely isolated by the `user_id` foreign key. One user cannot access another user's data.
