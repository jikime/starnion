---
layout: default
title: Starnion 简介
nav_order: 1
parent: 快速入门
grand_parent: 🇨🇳 中文
---

# 什么是 StarNion？
{: .no_toc }

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 概述

**StarNion** 是一个完全自托管的个人 AI 助手平台。所有数据和 AI 交互都在您自己的基础设施上运行，不会向外部服务器发送任何数据。

它的设计旨在让您完全控制个人信息和数据主权，同时保持云端 AI 服务的便利性。

---

## 核心概念

### 个人 AI 代理

StarNion 的 AI 代理不仅仅是简单的聊天机器人。它基于 **Vercel AI SDK v5**，使用多 LLM 后端逐步处理复杂任务的智能代理。

- **多 LLM 支持**: Anthropic Claude · Google Gemini · OpenAI · GLM (Z.AI) · Ollama
- **技能系统**: 24+ 内置技能 — 记账、日记、目标、健康、搜索等
- 基于 RAG 的记忆进行对话上下文管理
- **角色设定**: 可按上下文配置 AI 个性

### 隐私优先

```
您的数据 = 仅存储在您的基础设施上
```

- 所有对话历史存储在您自己的 PostgreSQL 数据库中
- LLM API 调用时仅发送最少量的必要信息
- 文件、图片和音频保存在您自己的 MinIO 存储中
- 无第三方分析或跟踪代码

### 自托管

```
在您的服务器上运行 = 完全控制
```

- 一条 `starnion dev` 命令即可启动整个技术栈
- 可在云端、本地或家庭服务器上运行
- 通过 Ollama 支持本地 AI 模型（无需互联网）
- 完全控制数据备份和迁移

---

## 主要功能

| 功能 | 说明 |
|------|------|
| **多 LLM** | Anthropic Claude · Gemini · OpenAI · GLM · Ollama |
| **Web UI** | 基于 Next.js 16 的 24+ 功能页面 |
| **Telegram** | 通过 Telegram 机器人进行 AI 聊天 |
| **多语言 UI** | 4 种语言（韩语 · 英语 · 日语 · 中文） |
| **记账** | 用自然语言记录和查询收支 |
| **预算管理** | 月度预算设置 + 超额提醒 |
| **日记** | AI 辅助日记写作 + 情绪追踪 |
| **目标管理** | 设置和跟踪个人目标 |
| **倒计时** | 重要日期倒计时 |
| **备忘录** | 支持标签筛选的快速笔记 |
| **数据花园** | 活动数据可视化花园 |
| **心灵花园** | 情绪/健康状态检查 |
| **报告/统计** | 自动定期汇总和图表 |
| **角色设定** | 按上下文配置 AI 个性 |
| **网络搜索** | AI 驱动的实时网络搜索 |
| **AI 记忆** | 跨所有数据的语义（RAG）记忆 |
| **通知中心** | 用户级定时任务（预算提醒、每日总结等） |

---

## 架构

```
┌──────────────────────┐   ┌──────────────────────┐
│   Web UI (Next.js)   │   │   Telegram Bot        │
│   localhost:3893     │   │   (polling)           │
└──────────┬───────────┘   └──────────┬────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────────────────────────────────┐
│              Go Gateway  :8080                    │
│  REST API  ·  WebSocket  ·  定时调度器            │
│                  │ gRPC（流式传输）               │
└──────────────────┼───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│           TypeScript Agent  :50051                │
│  AI SDK v5  ·  多 LLM  ·  技能  ·  RAG 记忆      │
└──────────────────┬───────────────────────────────┘
                   ▼
         PostgreSQL 16 + pgvector
                   │
                   ▼
              MinIO (S3)
```

### 组件说明

| 组件 | 角色 | 技术栈 |
|------|------|-------|
| **Web UI** | Web 界面 + 认证 | Next.js 16 · React 19 · TypeScript · NextAuth v5 |
| **Gateway** | REST API · WebSocket · Telegram · 定时任务 | Go 1.22+ · Echo v4 |
| **Agent** | AI 引擎 · gRPC 服务器 · 技能执行 | TypeScript · AI SDK v5 · gRPC |
| **PostgreSQL** | 主数据库 · 向量搜索 | PostgreSQL 16 + pgvector |
| **MinIO** | 文件存储 | MinIO（S3 兼容） |
| **CLI** | 服务管理 · 初始化向导 | Go |

---

## 下一步

- [快速开始](quickstart) — 立即运行 StarNion
- [安装指南](installation) — 详细安装说明
- [环境配置](configuration) — API 密钥和环境变量设置
