---
title: 架构概述
nav_order: 1
parent: 架构
grand_parent: 🇨🇳 中文
---

# 架构概述

StarNion 是一个完全可自托管的 AI 个人助手。所有数据存储在用户自己的服务器上，系统由五个核心服务组成。

---

## 整体系统结构

```
┌─────────────────────────────────────────────────────────┐
│                      用户访问                            │
│                                                         │
│   Web 浏览器          Telegram 应用                      │
│       │                    │                            │
└───────┼────────────────────┼────────────────────────────┘
        │                    │
        ▼                    ▼
┌───────────────┐   ┌────────────────────────────────────┐
│  UI (Next.js) │   │         Gateway (Go)               │
│   :3893       │──▶│              :8080                 │
│               │   │                                    │
│  - 聊天界面   │   │  ┌──────────┐  ┌────────────────┐  │
│  - 仪表板     │   │  │ REST API │  │ Telegram 机器人│  │
│  - 24+ 页面   │   │  │ /api/v1/ │  │    管理器      │  │
│  - 设置       │   │  └────┬─────┘  └───────┬────────┘  │
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
                    │  │  24+ 技能：finance、diary、      │  │
                    │  │  goals、search、wellness 等      │  │
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
         │  (pgvector)      │    │  （对象存储）         │    │
         │                  │    │                       │    │
         │  - 对话记录      │    │  - 图片               │    │
         │  - 财务数据      │    │  - 音频               │    │
         │  - 日记/备忘录   │    │  - 文档文件           │    │
         │  - 嵌入向量      │    │  - 生成的文件         │    │
         └──────────────────┘    └──────────────────────┘    │
                                                              │
         ┌────────────────────────────────────────────────┐  │
         │              LLM 提供商                        │──┘
         │  Gemini / OpenAI / Claude / GLM / Ollama       │
         └────────────────────────────────────────────────┘
```

---

## 五个核心服务

### 1. UI（Next.js）— 端口 3893

Web 前端。这是用户在浏览器中直接交互的界面。

- **聊天界面：** 实时流式响应、文件附件、对话历史
- **仪表板：** 消费摘要、目标状态、倒计时、日记、备忘录、文档、图片
- **24+ 功能页面：** 财务、预算、消费分析、日记、健康、花园、目标、倒计时、备忘录、记忆、报告、统计、搜索、技能、人设、模型、频道、日志、用量、文件等
- **设置：** 提供商与模型管理、Telegram 频道配置、通知中心（定时任务）
- **国际化：** 通过 next-intl 支持 4 种语言（韩语、英语、日语、中文）

Next.js API Routes 作为代理，将请求转发到 Gateway 的 REST API。

### 2. Gateway（Go）— 端口 8080

所有流量的枢纽。它作为 UI 与 AI 智能体之间的中介。

- **REST API（`/api/v1/`）：** 聊天、文件上传、设置、技能管理、频道配置等
- **WebSocket（`/ws/chat`）：** 实时流式聊天连接
- **Telegram BotManager：** 动态按用户启动和停止 Telegram 机器人实例
- **gRPC 客户端：** 与 TypeScript Agent 通信
- **定时调度器：** 按用户可开关的通知任务（每周报告、预算警告、每日摘要等）
- **MinIO 集成：** 将上传的文件存储到对象存储

Go 的高并发能力确保即使同时有多个用户连接也能稳定运行。

### 3. Agent（TypeScript/Node.js）— 端口 50051（gRPC）

AI 大脑。基于 Vercel AI SDK v5 的智能体分析消息并在多个 LLM 提供商之间执行技能。

- **AI SDK v5 Agent：** 消息处理、技能选择、响应生成
- **多 LLM：** Anthropic Claude、Google Gemini、OpenAI、GLM（Z.AI）、Ollama
- **技能系统：** 24+ 内置技能——财务、日记、目标、健康、搜索、备忘录、文档、图片、音频等
- **SSE Streaming：** 基于 AI SDK 标准流式格式的实时响应
- **嵌入服务：** 将文本转换为向量并存储到 PostgreSQL（pgvector）
- **RAG 记忆：** 跨所有用户数据的四层语义记忆

### 4. PostgreSQL（pgvector）

主数据存储。pgvector 扩展除了存储常规数据外，还存储向量嵌入。

存储的数据：对话历史、消费记录、日记条目、备忘录、目标、倒计时、文档索引、嵌入向量、频道设置、技能设置、人设、定时任务、使用日志

### 5. MinIO（对象存储）

文件存储。提供兼容 S3 的 API，因此可以用 AWS S3 替换。

存储的文件：上传的图片、音频、文档；AI 生成的文件（二维码、生成的图片等）

---

## 数据流：消息处理

以下是用户输入"今天午餐花了12,000韩元"时的处理流程。

```
1. 用户 → UI（Next.js）
   "今天午餐花了12,000韩元"

2. UI → Gateway（HTTP POST /api/v1/chat 或 WebSocket）
   { message: "今天午餐花了12,000韩元", user_id: "...", thread_id: "..." }

3. Gateway → Agent（gRPC Chat RPC）
   使用服务器流式调用

4. Agent：AI SDK v5 处理
   4-1. 消息分析："识别为餐饮消费12,000韩元"
   4-2. 技能选择：finance 技能
   4-3. 数据库查询：检查本月餐饮总计
   4-4. 记录消费：INSERT INTO finance_entries
   4-5. 生成响应："已记录午餐12,000韩元。本月餐饮总计：87,500韩元"

5. Agent → Gateway（gRPC 流式）
   逐词流式传输响应

6. Gateway → UI（WebSocket 或 SSE）
   实时流式传输

7. UI → 用户
   在屏幕上显示响应
```

---

## gRPC 通信

Gateway（Go）与 Agent（TypeScript）通过 gRPC 通信。

```protobuf
// proto/starnion/v1/agent.proto（摘要）
service AgentService {
  // 普通聊天（服务器流式）
  rpc Chat(ChatRequest) returns (stream ChatResponse);

  // 健康检查
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

选择 gRPC 的原因：
- **服务器流式：** 实时逐词传输 LLM 响应
- **类型安全：** 通过 Protobuf 模式保证接口
- **高效：** 基于 HTTP/2，低延迟

---

## WebSocket：实时聊天

Web UI 聊天通过 WebSocket 实现。Gateway 的 WebSocket Hub 管理连接。

```
浏览器 ──WebSocket── Gateway Hub ──gRPC 流── Agent
  │              /ws/chat           服务器流式  │
  │◀─────────────────────────────────────────│
        实时逐词流式传输
```

连接流程：
1. 浏览器建立到 `/ws/chat?user_id=...` 的 WebSocket 连接
2. 用户输入消息 → 发送 JSON
3. Gateway 向 Agent 发送 gRPC 流式请求
4. Agent 响应词语立即通过 WebSocket 中继
5. 字符在浏览器屏幕上实时显示

---

## 多频道：单一智能体

Web UI 和 Telegram 连接到**同一个** TypeScript Agent。

```
Telegram 用户 ──▶ Telegram 机器人 ──▶ Gateway ──▶ Agent ──▶ 同一数据库
Web 用户      ──▶ WebSocket       ──▶ Gateway ──▶ Agent ──▶ 同一数据库
```

由于在任何频道中记录的内容都存储在同一个 PostgreSQL 数据库中，在 Web 上写的备忘录可以在 Telegram 上检索，反之亦然。

每个频道消息通过 `platform` 字段标识：`web`、`telegram`。

---

## 四层 RAG 记忆系统

Agent 引用历史记录时使用的四层记忆结构。

```
查询："我上周吃了什么？"

第一层：日常日志（日常日志向量）
  ├─ 对过去7天对话进行向量搜索
  └─ 提取与餐饮消费相关的条目

第二层：知识库（知识库向量）
  ├─ 消费模式分析结果
  └─ 常去餐厅的规律

第三层：文档章节（文档章节向量）
  └─ 上传的收据和文档中的索引内容

第四层：近期财务（近期消费记录）
  └─ 直接 DB 查询近期消费条目
```

通过从每一层获取相关上下文并与 LLM 一起传递，可以实现"我上周吃了烤五花肉，对吧？"这样自然的记忆引用。

---

## 多提供商 LLM

Agent 支持多个 LLM 提供商。用户可以在 Web UI 的**设置 > 模型**中切换提供商和模型。

| 提供商 | 示例模型 | 备注 |
|--------|---------|------|
| Anthropic Claude | claude-sonnet-4-5、claude-haiku | 长上下文处理 |
| Google Gemini | gemini-2.0-flash、gemini-2.5-pro | 快速响应，多模态 |
| OpenAI | gpt-4o、gpt-4o-mini | 高质量响应 |
| GLM（Z.AI） | glm-4-flash、glm-4-plus | 中文语言优势 |
| Ollama | llama3、mistral、qwen | 完全本地（无需网络） |

可以通过 Web UI 或 CLI 按用户管理模型和提供商：`starnion config models`。

---

## 安全注意事项

### 自托管设计

StarNion 从一开始就为自托管而设计。

- 所有个人数据（对话、消费、日记条目）仅存储在用户的服务器上
- 消息内容仅在 LLM API 调用期间发送到外部服务器，且仅发送给所选的 LLM 提供商
- 使用 Ollama 可以实现完全离线操作

### JWT 认证

Web UI 登录基于 NextAuth v5 的 JWT（JSON Web Token）认证。

- 服务器在登录时颁发 JWT
- 所有后续 API 请求都包含该令牌
- 令牌过期时需要重新登录
- Gateway 令牌验证确保 API 级安全

### PostgreSQL 咨询锁

使用 PostgreSQL 会话级咨询锁来防止 Telegram 机器人重复执行。这防止了两个 Gateway 实例同时轮询相同的机器人令牌。

### 数据隔离

每个用户的数据通过 `user_id` 外键完全隔离。一个用户无法访问另一个用户的数据。
