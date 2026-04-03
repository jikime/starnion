---
layout: default
title: 快速开始（3步）
nav_order: 2
parent: 快速入门
grand_parent: 🇨🇳 中文
---

# 快速开始（3 步）
{: .no_toc }

只需 CLI，3 步即可启动 Starnion。
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 前置条件

开始前，您只需安装以下两项工具：

| 要求 | 最低版本 | 检查方法 |
|------|----------|----------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

> **如果您使用 Docker Desktop**，Docker Engine 和 Docker Compose 已包含在内。

### 验证安装

```bash
docker --version
# Docker version 24.0.0, build ...

docker compose version
# Docker Compose version v2.x.x
```

---

## 三步快速开始

### 第 1 步：安装 CLI

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

安装脚本自动执行以下操作：
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- Python agent → `~/.starnion/agent/`
- Next.js UI → `~/.starnion/ui/`
- Docker 配置文件 → `~/.starnion/docker/`

### 第 2 步：运行初始设置向导

```bash
starnion setup
```

设置向导将按顺序引导您完成以下步骤：

| 步骤 | 配置项 |
|------|--------|
| 1 | 验证系统连接（PostgreSQL、MinIO） |
| 2 | 数据库连接及迁移执行 |
| 3 | 创建管理员账号（邮箱 + 密码） |
| 4 | 文件存储设置（MinIO 存储桶） |
| 5 | 服务 URL 配置 |

### 第 3 步：启动服务

```bash
starnion docker up --build
```

首次运行时需要几分钟来构建 Docker 镜像，之后的启动将会很快。

监控启动进度：

```bash
starnion docker logs -f
```

所有服务达到 `healthy` 状态后即可使用：

```bash
starnion docker ps
```

预期输出：

```
NAME                 STATUS
starnion-postgres    Up (healthy)
starnion-minio       Up (healthy)
starnion-agent       Up (healthy)
starnion-gateway     Up
starnion-ui          Up
```

---

## 第一次对话

登录后，可以尝试以下操作：

### 基本对话

在聊天输入框中输入消息：

```
你好！请介绍一下你自己。
```

### 配置 AI 服务商

设置 AI API 密钥以获得更好的响应：

1. 右上角用户菜单 → **设置**
2. 选择 **AI 服务商** 标签
3. 输入您的 Google Gemini、OpenAI 或 Anthropic API 密钥

> **免费开始：** 您可以从 Google AI Studio 免费获取 Gemini API 密钥。
> 👉 [https://aistudio.google.com](https://aistudio.google.com)

### 体验技能

测试内置技能：

```
今天首尔的天气怎么样？
```

```
把"Hello, World!"翻译成法语。
```

```
1 + 1 等于多少？
```

---

## 常用命令参考

```bash
# 启动服务
starnion docker up -d

# 停止服务
starnion docker down

# 查看日志（实时）
starnion docker logs -f

# 查看特定服务的日志
starnion docker logs -f gateway
starnion docker logs -f agent

# 检查服务状态
starnion docker ps

# 重启所有服务
starnion docker restart

# 重新构建镜像并启动
starnion docker up --build

# 更新到最新版本
starnion update

# 备份 / 恢复
starnion docker backup
starnion docker restore --from ~/.starnion/backups/<timestamp>
```

---

## 遇到问题？

### 端口被占用

```bash
# 检查哪个进程正在使用某端口
lsof -i :3000
lsof -i :8080
lsof -i :5432
```

您可以在 `.env` 文件中修改端口：

```dotenv
GATEWAY_PORT=8081
UI_PORT=3001
POSTGRES_PORT=5433
```

### 服务无法启动

```bash
# 查看错误日志
docker compose logs gateway
docker compose logs agent

# 停止所有服务后重新启动
docker compose down && docker compose up -d
```

### 需要更多帮助？

- [安装指南](installation) — 更详细的安装说明
- [配置说明](configuration) — 环境变量的完整说明
- [GitHub Issues](https://github.com/jikime/starnion/issues) — 问题报告与提问

---

## 下一步

完成快速开始后，您可以继续了解：

- [配置说明](configuration) — AI API 密钥设置、Telegram 机器人集成
- [安装指南](installation) — CLI 安装与原生运行
- [什么是 Starnion？](introduction) — 详细的架构与功能介绍
