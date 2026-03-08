---
title: Agent（Python）
nav_order: 3
parent: 架构
---

# Agent（Python）

## 角色

Agent 是 Starnion 的 AI 大脑。用 Python 编写，运行在 LangGraph ReAct 架构上。它接收来自 Gateway 的 gRPC 请求，执行 AI 推理和技能执行以及记忆检索，并返回最终响应。

**核心职责：**
- 分析用户消息以理解意图
- 选择并执行合适的技能（Tool）
- 在四层记忆系统中搜索相关信息
- 多 LLM 路由（根据用户设置选择模型）
- 通过 gRPC 流式传输实时响应

---

## LangGraph ReAct 架构

Agent 使用 [LangGraph](https://github.com/langchain-ai/langgraph) 的 ReAct（推理 + 行动）模式。

```
用户消息
      │
      ▼
┌─────────────────────────────────────────┐
│           ReAct 循环                    │
│                                         │
│  ┌──────────┐    思考                   │
│  │  LLM     │──────────────────────┐   │
│  │（推理）  │                      │   │
│  └──────────┘                      ▼   │
│       ▲              ┌─────────────────┐│
│       │ 观察         │   技能选择      ││
│       │              │（工具选择）     ││
│  ┌────┴───────┐      └────────┬────────┘│
│  │ 技能       │               │ 执行    │
│  │ 结果       │◄──────────────┘         │
│  │（工具结果）│                         │
│  └────────────┘                         │
│                                         │
│  [重复：如需要更多技能则继续]            │
└─────────────────────────────────────────┘
      │ 决定最终响应
      ▼
   gRPC 流式响应
```

### 操作流程摘要

1. **接收输入**：接收来自 Gateway 的 gRPC 请求（用户消息 + 对话 ID + 用户 ID）
2. **加载上下文**：加载对话历史、用户资料和当前角色
3. **记忆搜索**：在四层记忆中搜索相关信息（pgvector 相似度搜索）
4. **LLM 推理**：将系统提示 + 对话历史 + 记忆上下文传递给 LLM
5. **技能执行**：当 LLM 选择所需技能时，执行相应函数
6. **循环**：如果基于技能结果需要额外推理，则重复循环
7. **流式响应**：将最终答案以 gRPC 流的形式实时发送
8. **保存记忆**：将对话内容记录到日常日志

---

## 消息处理流程

```
用户输入："我这个月在餐饮上花了多少？"
      │
      ▼
[识别意图]
  → 检测到"消费查询"意图
      │
      ▼
[记忆搜索]
  → 搜索相关消费数据（第四层：SQL）
  → 搜索记忆中的类似历史问题（第一层：pgvector）
      │
      ▼
[技能选择]
  → 调用 get_finance_summary(category="food", period="this_month")
      │
      ▼
[技能执行]
  → 从数据库聚合本月餐饮交易
  → 结果：{"total": 234500, "transactions": [...]}
      │
      ▼
[LLM 最终响应生成]
  → "您本月餐饮支出为 234,500 韩元。比上月（198,000 韩元）增加了 18%。"
      │
      ▼
[gRPC 流式]
  → 实时将响应词语流式传输给 Gateway
      │
      ▼
[保存记忆]
  → 将此对话记录到日常日志
```

---

## 多 LLM 路由

Agent 根据每个用户注册的 LLM 提供商和当前选定的角色（Persona）来决定调用哪个模型。

### 模型选择优先级

```
1. 当前对话中明确选择的模型
      ↓（如无）
2. 当前角色关联的模型
      ↓（如无）
3. 用户默认提供商的第一个活跃模型
      ↓（如无）
4. 系统默认（Gemini Flash）
```

### 支持的提供商

| 提供商 | 实现 |
|--------|------|
| Gemini | `google-generativeai` SDK |
| OpenAI | `openai` SDK（ChatCompletion API） |
| Anthropic | `anthropic` SDK（Messages API） |
| Z.AI | 兼容 OpenAI 的端点 |
| 自定义 | 兼容 OpenAI 的 Base URL |

---

## 四层记忆系统

Agent 通过由四层组成的记忆系统管理用户上下文。

```
┌─────────────────────────────────────────────────────┐
│                 四层记忆                             │
│                                                     │
│  第一层：日常日志                                    │
│  ┌──────────────────────────────┐                   │
│  │ pgvector，768维嵌入          │                   │
│  │ 对话记录、                   │                   │
│  │ 情绪、关键词                 │                   │
│  └──────────────────────────────┘                   │
│                 ↑ 相似度搜索                        │
│  第二层：知识库                                      │
│  ┌──────────────────────────────┐                   │
│  │ pgvector，768维嵌入          │                   │
│  │ 用户偏好、                   │                   │
│  │ 学习到的规律                 │                   │
│  └──────────────────────────────┘                   │
│                 ↑ 相似度搜索                        │
│  第三层：文档章节                                    │
│  ┌──────────────────────────────┐                   │
│  │ pgvector，768维嵌入          │                   │
│  │ 上传文档的分块               │                   │
│  └──────────────────────────────┘                   │
│                 ↑ SQL 查询                          │
│  第四层：近期财务                                    │
│  ┌──────────────────────────────┐                   │
│  │ PostgreSQL SQL               │                   │
│  │ 最近30天的交易               │                   │
│  └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### 第一层：日常日志

- **存储**：PostgreSQL + pgvector 扩展
- **嵌入维度**：768（Gemini `text-embedding-004`）
- **内容**：对话内容、情绪状态、关键词、摘要
- **搜索方法**：基于余弦相似度的语义搜索
- **使用场景**：回忆历史对话——"我上次说了什么？"

### 第二层：知识库

- **存储**：PostgreSQL + pgvector
- **嵌入维度**：768
- **内容**：用户偏好、重复规律、学习到的个性化数据
- **使用场景**："用户喜欢咖啡"或"每月25号发工资"等个性化上下文

### 第三层：文档章节

- **存储**：PostgreSQL + pgvector
- **嵌入维度**：768
- **内容**：用户上传的 PDF、Word 文档等的分块
- **分块方法**：分割为语义单元（默认 512 个 token）
- **使用场景**："查找我上传合同中的违约条款"

### 第四层：近期财务

- **存储**：PostgreSQL（纯 SQL，无向量）
- **内容**：最近30天的交易
- **搜索方法**：SQL 聚合查询
- **使用场景**："我这个月餐饮花了多少？"、"昨天有咖啡厅消费吗？"

---

## 嵌入

所有向量嵌入使用 Google 的 `text-embedding-004` 模型。

| 项目 | 值 |
|------|-----|
| 模型 | `text-embedding-004` |
| 维度 | 768 |
| 相似度函数 | 余弦相似度（`<=>` 运算符） |
| 语言 | 多语言，包括中文和韩文 |

嵌入生成流程：
```
文本输入
    │
    ▼
调用 Gemini Embedding API
    │
    ▼
返回 768 维浮点向量
    │
    ▼
存储到 PostgreSQL pgvector 列
（例如 VECTOR(768)）
```

---

## gRPC 接口

Agent 作为 gRPC 服务器运行，默认端口 `50051`。

### 服务定义（protobuf）

```protobuf
service AgentService {
  // 单次聊天请求/响应
  rpc Chat(ChatRequest) returns (ChatResponse);

  // 服务器流式：实时发送响应词语
  rpc ChatStream(ChatRequest) returns (stream ChatStreamResponse);
}
```

### 通信流程

```
Gateway（Go）                    Agent（Python）
    │                               │
    │── ChatRequest ──────────────►│
    │   （message、user_id、        │
    │    conversation_id、          │  执行 ReAct 循环
    │    context、files）           │  技能执行
    │                               │
    │◄── ChatStreamResponse ────────│（逐词流式传输）
    │◄── ChatStreamResponse ────────│
    │◄── ChatStreamResponse ────────│
    │         ...                   │
    │◄── [流结束] ──────────────────│
```

Gateway 接收流式响应并通过 WebSocket 或 SSE（服务器发送事件）将其传递给客户端。

---

## 技能执行机制

技能作为 LangChain Tools 实现。当 LLM 以 JSON 格式决定调用哪个技能及其参数时，Agent 执行相应的 Python 函数。

### 技能分类

| 类别 | 示例技能 |
|------|---------|
| 财务 | 添加/查看交易、检查预算、统计 |
| 日程 | Google 日历集成 |
| 备忘录 | 创建/查看/删除备忘录 |
| 日记 | 写日记/查看日记 |
| 目标 | 设置目标/打卡/评估 |
| 倒计时 | 注册/查看倒计时 |
| 文档 | 文档搜索、PDF 摘要 |
| 网络搜索 | Tavily、Naver Search API |
| 天气 | 当前天气查询 |
| 计算器 | 表达式计算 |
| 翻译 | 多语言翻译 |

### 技能激活

技能可以按用户启用/禁用。禁用的技能不包含在 LLM 的 Tool 列表中，因此根本无法被调用。

通过 设置 → 技能 下的开关或 API `POST /api/v1/skills/:id/toggle` 进行控制。

---

## Docker 配置

Agent 使用 `docker/Dockerfile.agent`，在 `docker-compose.yml` 中定义如下。

```yaml
agent:
  build:
    context: ../agent
    dockerfile: ../docker/Dockerfile.agent
  container_name: starnion-agent
  ports:
    - "${GRPC_PORT:-50051}:50051"  # gRPC 服务器
  environment:
    DATABASE_URL: postgres://...   # PostgreSQL 连接
    GRPC_PORT: 50051
  depends_on:
    postgres:
      condition: service_healthy
```

Agent 在 PostgreSQL 就绪后启动。Gateway 在 Agent 启动后尝试连接。

---

## 技术栈摘要

| 项目 | 选择 | 版本 |
|------|------|------|
| 语言 | Python | 3.13+ |
| AI 编排 | LangGraph | 0.4+ |
| LLM 客户端 | langchain-google-genai、langchain-anthropic、langchain-openai | 最新 |
| 对话状态存储 | langgraph-checkpoint-postgres | 2.0+ |
| 数据库驱动 | psycopg（psycopg3）+ psycopg-pool | 3.2+ |
| gRPC 服务器 | grpcio | 1.70+ |
| 图像生成/分析 | google-genai（Gemini） | 1.0+ |
| 文档解析 | pypdf、python-docx、openpyxl、python-pptx | 最新 |
| 网络搜索 | tavily-python | 0.5+ |
| 浏览器自动化 | playwright | 1.40+ |
| 二维码 | qrcode[pil] | 8.0+ |
| PDF 生成 | reportlab | 4.4+ |

---

## 技能架构

每个技能作为独立的 Python 包实现。

```
agent/src/starnion_agent/skills/
├── finance/          # 消费追踪器
│   ├── __init__.py   # 技能注册
│   ├── tools.py      # LangChain Tool 函数定义
│   └── SKILL.md      # 技能说明（注入 LLM 系统提示）
├── weather/
│   ├── __init__.py
│   ├── tools.py
│   └── SKILL.md
├── loader.py         # 动态技能加载
├── guard.py          # 技能访问权限检查
└── registry.py       # 完整技能注册表
```

### SKILL.md 的作用

每个技能目录中的 `SKILL.md` 文件直接注入 LLM 系统提示。这让 LLM 确切知道何时以及如何使用每个技能。

```
系统提示 = 基础角色 + 活跃技能的 SKILL.md 内容
```

### 技能守卫

用户禁用的技能在 `guard.py` 中被阻止。非活跃技能的工具不暴露给 LLM，使其根本无法被调用。

---

## 日志和 HTTP 服务器

除 gRPC 端口（50051）外，Agent 还运行一个 HTTP 服务器（端口 8082）。

| 端口 | 用途 |
|------|------|
| `50051` | gRPC 服务器（与 Gateway 通信） |
| `8082` | HTTP 服务器（日志流、文档索引、搜索嵌入） |

Gateway 的 `/api/v1/logs/agent` 端点代理到 Agent 的 8082 端口，以提供实时 Agent 日志。
