---
layout: default
title: Starnion 简介
nav_order: 1
parent: 快速入门
grand_parent: 🇨🇳 中文
---

# 什么是 Starnion？
{: .no_toc }

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 概述

**Starnion** 是一个完全自托管的个人 AI 助手平台。所有数据和 AI 交互均在您自己的基础设施上运行，数据绝不会发送至外部服务器。

它旨在让您在享受云端 AI 服务便利的同时，对个人信息和数据主权拥有完全的掌控权。

---

## 核心概念

### 个人 AI 代理

Starnion 的 AI 代理不仅仅是一个简单的聊天机器人。它是一个智能代理，通过基于 LangGraph 的图工作流逐步处理复杂任务。

- 支持多 AI 服务商（Anthropic Claude、OpenAI GPT、Google Gemini、Z.AI）
- 通过技能系统进行功能扩展
- 长期记忆与上下文管理
- 通过工具调用集成外部服务

### 隐私优先

```
您的数据 = 仅存储在您的基础设施上
```

- 所有对话历史均存储在您自己的 PostgreSQL 数据库中
- 调用 AI API 时仅发送最必要的信息
- 文件、图片和文档保存在您自己的 MinIO 存储中
- 无第三方分析服务或追踪代码

### 自托管

```
运行在您的服务器上 = 完全掌控
```

- 整个技术栈可通过单条 Docker Compose 命令启动
- 可在任何地方运行——云服务器、本地服务器或家庭服务器
- 未来支持在无网络环境下使用本地 AI 模型
- 您可以直接控制数据备份与迁移

---

## 主要功能

| 功能 | 说明 |
|------|------|
| **多 AI 服务商** | 同时支持 Anthropic、OpenAI、Google Gemini、Z.AI |
| **多频道** | 通过 Web UI、Telegram 和 Discord 访问 |
| **技能系统** | 30+ 内置技能，包括天气、翻译、搜索和日程管理 |
| **文档处理** | 上传 PDF 和 DOCX 并进行语义搜索（pgvector） |
| **图像分析** | 上传图片并进行 AI 分析 |
| **音频处理** | 上传语音备忘录并进行转录 |
| **网页搜索** | 实时网页搜索集成 |
| **人设** | 用户自定义 AI 个性与提示词 |
| **Docker 支持** | 一键部署 |
| **实时流式传输** | 基于 WebSocket 的实时响应流 |

---

## 架构

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

频道集成：
  Telegram Bot ──▶ Gateway
  Discord Bot  ──▶ Gateway
  Web Browser  ──▶ UI ──▶ Gateway
```

### 组件说明

| 组件 | 角色 | 技术栈 |
|------|------|--------|
| **UI** | Web 界面 | Next.js 15、React 19、TypeScript |
| **Gateway** | REST API 服务器 / WebSocket | Go 1.22+、Gin |
| **Agent** | AI 引擎 / gRPC 服务器 | Python 3.13+、LangGraph、gRPC |
| **PostgreSQL** | 主数据库 / 向量搜索 | PostgreSQL 16 + pgvector |
| **MinIO** | 文件存储 | MinIO（S3 兼容） |

### 数据流

```
用户消息
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
     ├──▶ 技能执行（天气、搜索、翻译……）
     ├──▶ PostgreSQL（对话存储 / 向量搜索）
     └──▶ MinIO（文件访问）
     │
     ▼
  流式响应 → Gateway → UI
```

---

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Go | 1.22+ | Gateway API 服务器 |
| Python | 3.13+ | AI 代理引擎 |
| LangGraph | 最新版 | AI 工作流图 |
| gRPC | - | Gateway ↔ Agent 通信 |
| PostgreSQL | 16+ | 数据库 |
| pgvector | - | 向量嵌入 / 语义搜索 |
| MinIO | 最新版 | S3 兼容文件存储 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 15 | Web 框架 |
| React | 19 | UI 库 |
| TypeScript | 5+ | 类型安全 |
| NextAuth | v5 | 身份认证 |
| Tailwind CSS | - | 样式 |

### 基础设施

| 技术 | 版本 | 用途 |
|------|------|------|
| Docker | 24+ | 容器化 |
| Docker Compose | v2 | 编排 |
| uv | 最新版 | Python 包管理 |
| pnpm | 最新版 | Node.js 包管理 |

---

## 适用人群

Starnion 适合以下用户：

### 个人用户

- 不想将 AI 对话托管给云服务、希望完全掌控数据的用户
- 希望与 AI 一起管理个人日记、备忘录和目标的用户
- 希望随时随地通过 Telegram 访问个人 AI 助手的用户

### 开发者 / 技术用户

- 希望构建自己的 AI 平台的开发者
- 希望通过技能系统添加自定义功能的用户
- 希望研究 AI 代理架构的用户

### 小型团队

- 希望运行内部 AI 助手的团队
- 不希望将客户数据发送至外部服务的企业
- 需要通过多个频道（Web、Telegram、Discord）访问 AI 的团队

### 不适合的情况

- 希望使用无需服务器管理的即用云服务 → 推荐使用 ChatGPT、Claude.ai 等
- 需要处理数百名以上并发用户的场景 → 需要额外的扩展工作

---

## 下一步

- [快速开始（5 分钟）](quickstart) — 立即运行 Starnion
- [安装指南](installation) — 详细安装说明
- [配置说明](configuration) — 环境变量与 API 密钥设置
