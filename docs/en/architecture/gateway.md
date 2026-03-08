---
title: Gateway (Go)
nav_order: 2
parent: Architecture
---

# Gateway (Go)

## Role

The Gateway is the **traffic hub** of Starnion. Written in Go, it performs the following roles:

- **REST API server**: Provides API endpoints for the UI and external clients
- **WebSocket server**: Operates the real-time web chat hub
- **Telegram bot manager**: Manages multiple Telegram bot instances per user
- **Cron scheduler**: Automatically runs periodic notifications, reports, and budget warnings
- **gRPC client**: Communicates with the Python Agent to request AI responses

---

## System Diagram

```
Clients (Browser/App)
        │
        ├── HTTP REST ──────────────────────────────────┐
        ├── WebSocket (wss://) ─────────────────────── │
        └── Telegram Bot API ─────────────────────────│
                                                        ▼
                                            ┌─────────────────────┐
                                            │   Gateway (Go)      │
                                            │                     │
                                            │  Echo Router        │
                                            │  BotManager         │
                                            │  Scheduler (Cron)   │
                                            │  WebSocket Hub      │
                                            └──────┬──────────────┘
                                                   │ gRPC
                                                   ▼
                                            ┌─────────────────────┐
                                            │   Agent (Python)    │
                                            │   gRPC :50051       │
                                            └─────────────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  PostgreSQL  │
                                            │   pgvector   │
                                            └─────────────┘
```

---

## Key Components

### Echo Router

Uses [labstack/echo](https://echo.labstack.com/) v4. All HTTP routes are registered in `main.go`.

### BotManager

Manages Telegram bots per user. When a user registers their Telegram Bot Token, BotManager creates that bot instance and begins polling for updates. On server restart, it automatically reloads all bot tokens stored in the DB (`ReloadAll()`).

### WebSocket Hub

A real-time connection hub for web chat. It accepts connections via JWT authentication and relays the Agent's gRPC streaming responses to clients in real time.

### Cron Scheduler

Uses [robfig/cron](https://github.com/robfig/cron) v3 and runs on KST (UTC+9). See the [Cron Schedule](#cron-schedule) section below for details.

### gRPC Client

Calls the `AgentService` defined in protobuf. Communicates via two modes: unary request (Chat) and server streaming (ChatStream).

---

## Authentication

All API requests use JWT-based authentication.

```
Authorization: Bearer <jwt_token>
```

Tokens are issued at the `/auth/token` endpoint. Web users obtain tokens automatically via NextAuth sessions. Telegram users have tokens managed based on platform ID.

---

## Middleware

The following middleware executes in order before a request reaches a route handler.

| Middleware | Function |
|------------|----------|
| RequestID | Assigns a unique ID to every request (`X-Request-ID`) |
| Recover | Safely recovers handler panics as 500 responses |
| CORS | Filters allowed origins, methods, and headers |
| RequestLogger | Request/response logging based on zerolog |

---

## Full API Endpoint List

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Email/password registration |
| POST | `/auth/login` | Email/password login |
| POST | `/auth/token` | Issue anonymous JWT token |
| POST | `/auth/link` | Link web account with Telegram account |
| GET | `/auth/google/callback` | Handle Google OAuth2 callback |
| GET | `/auth/google/telegram` | Start Google OAuth from Telegram bot |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/chat` | Unary chat request |
| POST | `/api/v1/chat/stream` | SSE streaming chat (AI SDK compatible) |
| GET | `/ws` | WebSocket real-time chat connection |

### Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/conversations` | List conversations |
| POST | `/api/v1/conversations` | Create new conversation |
| PATCH | `/api/v1/conversations/:id` | Update conversation title |
| GET | `/api/v1/conversations/:id/messages` | List conversation messages |

### Finance

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/finance/summary` | Income/expense summary |
| GET | `/api/v1/finance/transactions` | List transactions |
| POST | `/api/v1/finance/transactions` | Add new transaction |
| PUT | `/api/v1/finance/transactions/:id` | Edit transaction |
| DELETE | `/api/v1/finance/transactions/:id` | Delete transaction |
| GET | `/api/v1/budget` | View budget |
| PUT | `/api/v1/budget` | Set budget |
| GET | `/api/v1/statistics` | Spending statistics |
| GET | `/api/v1/statistics/insights` | Spending insights |

### Personal Data

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/v1/diary/entries` | Diary list/create |
| GET/PUT/DELETE | `/api/v1/diary/entries/:id` | Diary detail/edit/delete |
| GET/POST | `/api/v1/goals` | Goal list/create |
| POST | `/api/v1/goals/:id/checkin` | Goal check-in |
| GET/POST | `/api/v1/memos` | Memo list/create |
| PUT/DELETE | `/api/v1/memos/:id` | Memo edit/delete |
| GET/POST | `/api/v1/ddays` | D-Day list/create |

### Settings and Models

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/v1/profile` | View/update profile |
| GET/POST | `/api/v1/providers` | LLM provider list/register |
| POST | `/api/v1/providers/validate` | Validate API key |
| DELETE | `/api/v1/providers/:provider` | Delete provider |
| GET/POST | `/api/v1/personas` | Persona list/create |
| PUT/DELETE | `/api/v1/personas/:id` | Persona edit/delete |

### Integrations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/integrations/status` | View integration status |
| GET | `/api/v1/integrations/google/auth-url` | Generate Google OAuth URL |
| DELETE | `/api/v1/integrations/google` | Disconnect Google |
| PUT | `/api/v1/integrations/notion` | Connect Notion |
| PUT | `/api/v1/integrations/tavily` | Connect Tavily web search |
| PUT | `/api/v1/integrations/naver_search` | Connect Naver search |

### Files and Media

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/upload` | File upload (MinIO) |
| GET/POST/DELETE | `/api/v1/documents` | Document management |
| GET/DELETE | `/api/v1/images` | Image gallery |
| GET/POST/DELETE | `/api/v1/audios` | Audio gallery |

### Analytics and Monitoring

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/analytics` | Conversation analytics statistics |
| GET | `/api/v1/usage` | LLM token usage |
| GET | `/api/v1/logs` | Gateway log list |
| GET | `/api/v1/logs/stream` | Real-time log streaming (SSE) |
| GET | `/api/v1/logs/agent` | Python Agent log proxy |

---

## Cron Schedule

The scheduler operates on KST (UTC+9).

| Schedule | Job | Description |
|----------|-----|-------------|
| Every Monday at 09:00 | weekly_report | Send weekly expense report |
| Every hour | budget_warning | Check for budget overruns |
| Every day at 21:00 | daily_summary | Send daily summary |
| Every day at 20:00 | inactive_reminder | Notify inactive users |
| Days 28–31 at 21:00 | monthly_closing | Month-end closing notification |
| Every day at 06:00 | pattern_analysis | Analyze spending patterns |
| Every 3 hours | spending_anomaly | Detect anomalous spending |
| Every day at 14:00 | pattern_insight | Send pattern-based insights |
| Every 10 minutes | conversation_analysis | Conversation analysis (idle detection) |
| Every day at 07:00 | goal_evaluation | Evaluate goal completion |
| Every Wednesday at 12:00 | goal_status | Goal status notification |
| Every day at 08:00 | dday_notification | D-Day notification |
| Every 15 minutes | user_schedules | Execute user-defined schedules |
| Every Monday at 05:00 | memory_compaction | Memory compaction (AI log cleanup) |

---

## Viewing Logs

Gateway logs are recorded as zerolog-based structured JSON logs.

### Viewing in the Web UI

You can view the real-time log stream under Settings > Logs. New logs are updated in real time via the `GET /api/v1/logs/stream` SSE endpoint.

### Docker Logs

```bash
docker compose logs -f gateway
docker compose logs -f agent
```

### Log Level

Adjustable via the `LOG_LEVEL` environment variable: `debug`, `info`, `warn`, `error`.

---

## Technology Stack Summary

| Item | Choice | Version |
|------|--------|---------|
| Language | Go | 1.25 |
| Web framework | labstack/echo | v4.15 |
| gRPC | google.golang.org/grpc | v1.79 |
| WebSocket | gorilla/websocket | v1.5 |
| Database driver | lib/pq | v1.11 |
| Scheduler | robfig/cron | v3 |
| Object storage | minio/minio-go | v7 |
| JWT | golang-jwt/jwt | v5 |
| Logger | rs/zerolog | v1.34 |
| CLI | spf13/cobra | v1.10 |

---

## Identity Service: Multi-Platform User Unification

When the same user uses both web and Telegram, they are tied together under the same `user_id`.

```
Telegram chat_id: 12345  ──▶ platform_identities ──▶ user_id: "abc-uuid"
Web session_id: "xxx"    ──▶ platform_identities ──▶ user_id: "abc-uuid"
```

Account linking flow:

1. Enter `/link` command on Telegram
2. A 10-minute valid link code `NION-XXXXXX` is issued
3. Call `POST /auth/link { "code": "NION-XXXXXX" }` from the web
4. Both platforms are unified under the same `user_id`
