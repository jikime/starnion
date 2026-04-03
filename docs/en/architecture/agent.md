---
title: Agent (TypeScript)
nav_order: 3
parent: Architecture
grand_parent: 🇺🇸 English
---

# Agent (TypeScript)

## Role

The Agent is the AI brain of Starnion. Written in TypeScript/Node.js, it operates using the Anthropic AI SDK v6. It receives gRPC requests from the Gateway, performs AI reasoning and skill execution, and returns the final response.

**Core roles:**
- Analyze user messages to understand intent
- Select and execute the appropriate skill (diary, finance, goals, image)
- Generate responses using Anthropic Claude models
- Deliver real-time responses via gRPC streaming

---

## LangGraph ReAct Architecture

The Agent uses [LangGraph](https://github.com/langchain-ai/langgraph)'s ReAct (Reasoning + Acting) pattern.

```
User message
      │
      ▼
┌─────────────────────────────────────────┐
│           ReAct Loop                    │
│                                         │
│  ┌──────────┐    Think                  │
│  │  LLM     │──────────────────────┐   │
│  │(Reasoning)│                     │   │
│  └──────────┘                      ▼   │
│       ▲              ┌─────────────────┐│
│       │ Observe      │ Skill Selection  ││
│       │              │ (Tool Selection) ││
│  ┌────┴───────┐      └────────┬────────┘│
│  │ Skill      │               │ Execute  │
│  │ Result     │◄──────────────┘         │
│  │ (Tool Res) │                         │
│  └────────────┘                         │
│                                         │
│  [Repeat: continue if more skills needed]│
└─────────────────────────────────────────┘
      │ Final response decided
      ▼
   gRPC streaming response
```

### Operation Flow Summary

1. **Receive input**: Receive gRPC request from Gateway (user message + conversation ID + user ID)
2. **Load context**: Load conversation history, user profile, and current persona
3. **Memory search**: Search 4-Layer memory for relevant information (pgvector similarity search)
4. **LLM reasoning**: Pass system prompt + conversation history + memory context to LLM
5. **Skill execution**: When LLM selects a needed skill, execute the corresponding function
6. **Loop**: Repeat the loop if additional reasoning is needed based on skill results
7. **Stream response**: Send the final answer as a gRPC stream in real time
8. **Save memory**: Record the conversation content in the daily log

---

## Message Processing Flow

```
User input: "How much did I spend on food this month?"
      │
      ▼
[Identify intent]
  → Detect "expense query" intent
      │
      ▼
[Memory search]
  → Search for relevant expense data (Layer 4: SQL)
  → Search memory for previous similar questions (Layer 1: pgvector)
      │
      ▼
[Skill selection]
  → Call get_finance_summary(category="food", period="this_month")
      │
      ▼
[Skill execution]
  → Aggregate this month's food transactions from DB
  → Result: {"total": 234500, "transactions": [...]}
      │
      ▼
[LLM final response generation]
  → "Your food spending this month is 234,500 won. That's up 18% from last month (198,000 won)."
      │
      ▼
[gRPC streaming]
  → Stream response tokens to Gateway in real time
      │
      ▼
[Save memory]
  → Record this conversation in the daily log
```

---

## Multi-LLM Routing

The Agent determines which model to call based on the LLM provider registered per user and the currently selected Persona.

### Model Selection Priority

```
1. Model explicitly selected in the current conversation
      ↓ (if none)
2. Model linked to the current persona
      ↓ (if none)
3. First active model of the user's default provider
      ↓ (if none)
4. System default (Gemini Flash)
```

### Supported Providers

| Provider | Implementation |
|----------|---------------|
| Gemini | `google-generativeai` SDK |
| OpenAI | `openai` SDK (ChatCompletion API) |
| Anthropic | `anthropic` SDK (Messages API) |
| Z.AI | OpenAI-compatible endpoint |
| Custom | OpenAI-compatible base URL |

---

## 4-Layer Memory System

The Agent manages user context through a memory system composed of four layers.

```
┌─────────────────────────────────────────────────────┐
│                 4-Layer Memory                      │
│                                                     │
│  Layer 1: Daily Logs                                │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768-dim embeddings │                   │
│  │ Conversation records,        │                   │
│  │ emotions, keywords           │                   │
│  └──────────────────────────────┘                   │
│                 ↑ similarity search                 │
│  Layer 2: Knowledge Base                            │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768-dim embeddings │                   │
│  │ User preferences,            │                   │
│  │ learned patterns             │                   │
│  └──────────────────────────────┘                   │
│                 ↑ similarity search                 │
│  Layer 3: Document Sections                         │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768-dim embeddings │                   │
│  │ Chunks of uploaded documents │                   │
│  └──────────────────────────────┘                   │
│                 ↑ SQL query                         │
│  Layer 4: Recent Finance                            │
│  ┌──────────────────────────────┐                   │
│  │ PostgreSQL SQL               │                   │
│  │ Last 30 days of transactions │                   │
│  └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### Layer 1: Daily Logs

- **Store**: PostgreSQL + pgvector extension
- **Embedding dimensions**: 768 (Gemini `text-embedding-004`)
- **Content**: Conversation content, emotional state, key keywords, summaries
- **Search method**: Cosine-similarity-based semantic search
- **Use case**: Recalling past conversations — "What did I say last time?"

### Layer 2: Knowledge Base

- **Store**: PostgreSQL + pgvector
- **Embedding dimensions**: 768
- **Content**: User preferences, recurring patterns, learned personalization data
- **Use case**: Personalization context such as "the user likes coffee" or "salary arrives on the 25th of every month"

### Layer 3: Document Sections

- **Store**: PostgreSQL + pgvector
- **Embedding dimensions**: 768
- **Content**: Chunks of PDFs, Word docs, etc. uploaded by the user
- **Chunking method**: Split into semantic units (default 512 tokens)
- **Use case**: "Find the penalty clause in the contract I uploaded"

### Layer 4: Recent Finance

- **Store**: PostgreSQL (plain SQL, no vectors)
- **Content**: Transactions from the last 30 days
- **Search method**: SQL aggregate queries
- **Use case**: "How much did I spend on food this month?", "Were there any café expenses yesterday?"

---

## Embeddings

All vector embeddings use Google's `text-embedding-004` model.

| Item | Value |
|------|-------|
| Model | `text-embedding-004` |
| Dimensions | 768 |
| Similarity function | Cosine similarity (`<=>` operator) |
| Language | Multilingual including Korean |

Embedding generation flow:
```
Text input
    │
    ▼
Call Gemini Embedding API
    │
    ▼
Returns 768-dimensional float vector
    │
    ▼
Store in PostgreSQL pgvector column
(e.g., VECTOR(768))
```

---

## gRPC Interface

The Agent operates as a gRPC server using the default port `50051`.

### Service Definition (protobuf)

```protobuf
service AgentService {
  // Unary chat request/response
  rpc Chat(ChatRequest) returns (ChatResponse);

  // Server streaming: send response tokens in real time
  rpc ChatStream(ChatRequest) returns (stream ChatStreamResponse);
}
```

### Communication Flow

```
Gateway (Go)                    Agent (Python)
    │                               │
    │── ChatRequest ──────────────►│
    │   (message, user_id,          │
    │    conversation_id,           │  ReAct loop executes
    │    context, files)            │  Skill execution
    │                               │
    │◄── ChatStreamResponse ────────│ (token-by-token streaming)
    │◄── ChatStreamResponse ────────│
    │◄── ChatStreamResponse ────────│
    │         ...                   │
    │◄── [stream end] ──────────────│
```

The Gateway receives the streaming response and delivers it to the client via WebSocket or SSE (Server-Sent Events).

---

## Skill Execution Mechanism

Skills are implemented as LangChain Tools. When the LLM determines which skill to call and with what parameters in JSON format, the Agent executes the corresponding Python function.

### Skill Categories

| Category | Example Skills |
|----------|---------------|
| Finance | Add/view transactions, check budget, statistics |
| Schedule | Google Calendar integration |
| Memo | Create/view/delete memos |
| Diary | Write/view diary entries |
| Goals | Set goals/check in/evaluate |
| D-Day | Register/view D-Days |
| Documents | Document search, PDF summary |
| Web search | Tavily, Naver Search API |
| Weather | Current weather lookup |
| Calculator | Expression calculation |
| Translation | Multi-language translation |

### Skill Activation

Skills can be enabled/disabled per user. Disabled skills are not included in the LLM's Tool list, so they cannot be called at all.

Control with the toggle under Settings → Skills or via the API `POST /api/v1/skills/:id/toggle`.

---

## Docker Configuration

The Agent uses `docker/Dockerfile.agent` and is defined in `docker-compose.yml` as follows.

```yaml
agent:
  build:
    context: ../agent
    dockerfile: ../docker/Dockerfile.agent
  container_name: starnion-agent
  ports:
    - "${GRPC_PORT:-50051}:50051"  # gRPC server
  environment:
    DATABASE_URL: postgres://...   # PostgreSQL connection
    GRPC_PORT: 50051
  depends_on:
    postgres:
      condition: service_healthy
```

The Agent starts after PostgreSQL is ready. The Gateway attempts to connect after the Agent starts.

---

## Technology Stack Summary

| Item | Choice | Version |
|------|--------|---------|
| Language | Python | 3.13+ |
| AI orchestration | LangGraph | 0.4+ |
| LLM clients | langchain-google-genai, langchain-anthropic, langchain-openai | latest |
| Conversation state storage | langgraph-checkpoint-postgres | 2.0+ |
| DB driver | psycopg (psycopg3) + psycopg-pool | 3.2+ |
| gRPC server | grpcio | 1.70+ |
| Image generation/analysis | google-genai (Gemini) | 1.0+ |
| Document parsing | pypdf, python-docx, openpyxl, python-pptx | latest |
| Web search | tavily-python | 0.5+ |
| Browser automation | playwright | 1.40+ |
| QR code | qrcode[pil] | 8.0+ |
| PDF generation | reportlab | 4.4+ |

---

## Skill Architecture

Each skill is implemented as an independent Python package.

```
agent/src/starnion_agent/skills/
├── finance/          # Expense tracker
│   ├── __init__.py   # Skill registration
│   ├── tools.py      # LangChain Tool function definitions
│   └── SKILL.md      # Skill description (injected into LLM system prompt)
├── weather/
│   ├── __init__.py
│   ├── tools.py
│   └── SKILL.md
├── loader.py         # Dynamic skill loading
├── guard.py          # Skill access permission check
└── registry.py       # Full skill registry
```

### Role of SKILL.md

The `SKILL.md` file in each skill directory is injected directly into the LLM system prompt. This lets the LLM know exactly when and how to use each skill.

```
System prompt = base persona + SKILL.md content from active skills
```

### Skill Guard

Skills disabled by the user are blocked in `guard.py`. The tools of inactive skills are not exposed to the LLM, making it impossible for them to be called at all.

---

## Logs and HTTP Server

In addition to the gRPC port (50051), the Agent also runs an HTTP server (port 8082).

| Port | Purpose |
|------|---------|
| `50051` | gRPC server (communication with Gateway) |
| `8082` | HTTP server (log streaming, document indexing, search embedding) |

The Gateway's `/api/v1/logs/agent` endpoint proxies to the Agent's port 8082 to provide real-time Agent logs.
