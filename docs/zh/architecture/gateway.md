---
title: Gateway（Go）
nav_order: 2
parent: 架构
grand_parent: 🇨🇳 中文
---

# Gateway（Go）

## 角色

Gateway 是 Starnion 的**流量枢纽**。用 Go 编写，承担以下职责：

- **REST API 服务器**：为 UI 和外部客户端提供 API 端点
- **WebSocket 服务器**：运营实时网页聊天枢纽
- **Telegram 机器人管理器**：按用户管理多个 Telegram 机器人实例
- **Cron 调度器**：自动运行定期通知、报告和预算警告
- **gRPC 客户端**：与 Python Agent 通信，请求 AI 响应

---

## 系统图

```
客户端（浏览器/应用）
        │
        ├── HTTP REST ──────────────────────────────────┐
        ├── WebSocket (wss://) ─────────────────────── │
        └── Telegram Bot API ─────────────────────────│
                                                        ▼
                                            ┌─────────────────────┐
                                            │   Gateway（Go）     │
                                            │                     │
                                            │  Echo Router        │
                                            │  BotManager         │
                                            │  Scheduler（Cron）  │
                                            │  WebSocket Hub      │
                                            └──────┬──────────────┘
                                                   │ gRPC
                                                   ▼
                                            ┌─────────────────────┐
                                            │   Agent（Python）   │
                                            │   gRPC :50051       │
                                            └─────────────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  PostgreSQL  │
                                            │   pgvector   │
                                            └─────────────┘
```

---

## 主要组件

### Echo Router

使用 [labstack/echo](https://echo.labstack.com/) v4。所有 HTTP 路由在 `main.go` 中注册。

### BotManager

按用户管理 Telegram 机器人。当用户注册其 Telegram Bot Token 时，BotManager 创建该机器人实例并开始轮询更新。服务器重启时，它会自动重新加载数据库中存储的所有机器人令牌（`ReloadAll()`）。

### WebSocket Hub

网页聊天的实时连接枢纽。通过 JWT 认证接受连接，并将 Agent 的 gRPC 流式响应实时中继给客户端。

### Cron 调度器

使用 [robfig/cron](https://github.com/robfig/cron) v3，以 KST（UTC+9）运行。详情见下方[计划任务](#计划任务)部分。

### gRPC 客户端

调用 protobuf 中定义的 `AgentService`。通过两种模式通信：单请求（Chat）和服务器流式（ChatStream）。

---

## 认证

所有 API 请求使用基于 JWT 的认证。

```
Authorization: Bearer <jwt_token>
```

令牌在 `/auth/token` 端点颁发。Web 用户通过 NextAuth 会话自动获取令牌。Telegram 用户的令牌基于平台 ID 进行管理。

---

## 中间件

以下中间件在请求到达路由处理器之前按顺序执行。

| 中间件 | 功能 |
|--------|------|
| RequestID | 为每个请求分配唯一 ID（`X-Request-ID`） |
| Recover | 安全地将处理器 panic 恢复为 500 响应 |
| CORS | 过滤允许的来源、方法和请求头 |
| RequestLogger | 基于 zerolog 的请求/响应日志记录 |

---

## 完整 API 端点列表

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 电子邮件/密码注册 |
| POST | `/auth/login` | 电子邮件/密码登录 |
| POST | `/auth/token` | 颁发匿名 JWT 令牌 |
| POST | `/auth/link` | 将 Web 账户与 Telegram 账户关联 |
| GET | `/auth/google/callback` | 处理 Google OAuth2 回调 |
| GET | `/auth/google/telegram` | 从 Telegram 机器人启动 Google OAuth |

### 聊天

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/chat` | 单次聊天请求 |
| POST | `/api/v1/chat/stream` | SSE 流式聊天（兼容 AI SDK） |
| GET | `/ws` | WebSocket 实时聊天连接 |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/conversations` | 对话列表 |
| POST | `/api/v1/conversations` | 创建新对话 |
| PATCH | `/api/v1/conversations/:id` | 更新对话标题 |
| GET | `/api/v1/conversations/:id/messages` | 对话消息列表 |

### 财务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/finance/summary` | 收入/支出摘要 |
| GET | `/api/v1/finance/transactions` | 交易列表 |
| POST | `/api/v1/finance/transactions` | 添加新交易 |
| PUT | `/api/v1/finance/transactions/:id` | 编辑交易 |
| DELETE | `/api/v1/finance/transactions/:id` | 删除交易 |
| GET | `/api/v1/budget` | 查看预算 |
| PUT | `/api/v1/budget` | 设置预算 |
| GET | `/api/v1/statistics` | 消费统计 |
| GET | `/api/v1/statistics/insights` | 消费洞察 |

### 个人数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/v1/diary/entries` | 日记列表/创建 |
| GET/PUT/DELETE | `/api/v1/diary/entries/:id` | 日记详情/编辑/删除 |
| GET/POST | `/api/v1/goals` | 目标列表/创建 |
| POST | `/api/v1/goals/:id/checkin` | 目标打卡 |
| GET/POST | `/api/v1/memos` | 备忘录列表/创建 |
| PUT/DELETE | `/api/v1/memos/:id` | 备忘录编辑/删除 |
| GET/POST | `/api/v1/ddays` | 倒计时列表/创建 |

### 设置和模型

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PATCH | `/api/v1/profile` | 查看/更新个人资料 |
| GET/POST | `/api/v1/providers` | LLM 提供商列表/注册 |
| POST | `/api/v1/providers/validate` | 验证 API 密钥 |
| DELETE | `/api/v1/providers/:provider` | 删除提供商 |
| GET/POST | `/api/v1/personas` | 角色列表/创建 |
| PUT/DELETE | `/api/v1/personas/:id` | 角色编辑/删除 |

### 集成

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/integrations/status` | 查看集成状态 |
| GET | `/api/v1/integrations/google/auth-url` | 生成 Google OAuth URL |
| DELETE | `/api/v1/integrations/google` | 断开 Google 连接 |
| PUT | `/api/v1/integrations/notion` | 连接 Notion |
| PUT | `/api/v1/integrations/tavily` | 连接 Tavily 网络搜索 |
| PUT | `/api/v1/integrations/naver_search` | 连接 Naver 搜索 |

### 文件和媒体

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/upload` | 文件上传（MinIO） |
| GET/POST/DELETE | `/api/v1/documents` | 文档管理 |
| GET/DELETE | `/api/v1/images` | 图片画廊 |
| GET/POST/DELETE | `/api/v1/audios` | 音频画廊 |

### 分析和监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/analytics` | 对话分析统计 |
| GET | `/api/v1/usage` | LLM token 使用量 |
| GET | `/api/v1/logs` | Gateway 日志列表 |
| GET | `/api/v1/logs/stream` | 实时日志流（SSE） |
| GET | `/api/v1/logs/agent` | Python Agent 日志代理 |

---

## 计划任务

调度器以 KST（UTC+9）运行。

| 计划 | 任务 | 说明 |
|------|------|------|
| 每周一 09:00 | weekly_report | 发送每周消费报告 |
| 每小时 | budget_warning | 检查预算超支 |
| 每天 21:00 | daily_summary | 发送每日摘要 |
| 每天 20:00 | inactive_reminder | 通知不活跃用户 |
| 每月28-31日 21:00 | monthly_closing | 月末结算通知 |
| 每天 06:00 | pattern_analysis | 分析消费模式 |
| 每3小时 | spending_anomaly | 检测异常消费 |
| 每天 14:00 | pattern_insight | 发送基于模式的洞察 |
| 每10分钟 | conversation_analysis | 对话分析（空闲检测） |
| 每天 07:00 | goal_evaluation | 评估目标完成情况 |
| 每周三 12:00 | goal_status | 目标状态通知 |
| 每天 08:00 | dday_notification | 倒计时通知 |
| 每15分钟 | user_schedules | 执行用户自定义计划 |
| 每周一 05:00 | memory_compaction | 记忆压缩（AI 日志清理） |

---

## 查看日志

Gateway 日志以基于 zerolog 的结构化 JSON 日志记录。

### 在网页界面中查看

您可以在 设置 > 日志 下查看实时日志流。新日志通过 `GET /api/v1/logs/stream` SSE 端点实时更新。

### Docker 日志

```bash
docker compose logs -f gateway
docker compose logs -f agent
```

### 日志级别

通过 `LOG_LEVEL` 环境变量调整：`debug`、`info`、`warn`、`error`。

---

## 技术栈摘要

| 项目 | 选择 | 版本 |
|------|------|------|
| 语言 | Go | 1.25 |
| Web 框架 | labstack/echo | v4.15 |
| gRPC | google.golang.org/grpc | v1.79 |
| WebSocket | gorilla/websocket | v1.5 |
| 数据库驱动 | lib/pq | v1.11 |
| 调度器 | robfig/cron | v3 |
| 对象存储 | minio/minio-go | v7 |
| JWT | golang-jwt/jwt | v5 |
| 日志 | rs/zerolog | v1.34 |
| CLI | spf13/cobra | v1.10 |

---

## 身份服务：多平台用户统一

当同一用户同时使用 Web 和 Telegram 时，他们通过同一个 `user_id` 关联。

```
Telegram chat_id: 12345  ──▶ platform_identities ──▶ user_id: "abc-uuid"
Web session_id: "xxx"    ──▶ platform_identities ──▶ user_id: "abc-uuid"
```

账户关联流程：

1. 在 Telegram 上输入 `/link` 命令
2. 颁发有效期10分钟的关联码 `NION-XXXXXX`
3. 从 Web 调用 `POST /auth/link { "code": "NION-XXXXXX" }`
4. 两个平台统一到同一个 `user_id` 下
