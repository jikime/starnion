---
layout: default
title: 配置说明
nav_order: 4
parent: 快速入门
grand_parent: 🇨🇳 中文
---

# 配置说明
{: .no_toc }

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 概述

Starnion 的配置通过以下两种方式进行管理：

1. **设置向导**（`starnion setup`）— 交互式初始设置
2. **环境文件**（`docker/.env`）— 直接编辑

---

## 设置向导

`starnion setup` 命令是一个交互式向导，引导您完成核心配置：

```bash
starnion setup
```

向导步骤：

| 步骤 | 配置项 | 保存位置 |
|------|--------|----------|
| 1. 系统检查 | PostgreSQL、MinIO 连接测试 | - |
| 2. 数据库 | DB URL、执行迁移 | `~/.config/starnion/config.yaml` |
| 3. 管理员账号 | 邮箱、密码创建 | PostgreSQL |
| 4. 文件存储 | MinIO 端点、凭据、存储桶 | `~/.config/starnion/config.yaml` |
| 5. 服务 URL | Gateway 公开 URL | `~/.config/starnion/config.yaml` |

向导完成后，设置将保存至 `~/.config/starnion/config.yaml`。

---

## 环境变量完整参考

本节介绍 `docker/.env` 文件中的所有环境变量。

### 必须修改的密钥

请勿在生产环境中使用默认值。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `POSTGRES_PASSWORD` | `change-me-in-production` | PostgreSQL 数据库密码 |
| `MINIO_SECRET_KEY` | `change-me-in-production` | MinIO 对象存储密钥 |
| `JWT_SECRET` | `change-me-min-32-chars-in-production` | JWT 令牌签名密钥（最少 32 个字符） |
| `AUTH_SECRET` | `change-me-min-32-chars-in-production` | NextAuth 会话加密密钥（最少 32 个字符） |

生成安全随机值：

```bash
# 生成 JWT_SECRET 或 AUTH_SECRET
openssl rand -base64 32

# 示例输出：
# K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gH=
```

在 `.env` 文件中设置：

```dotenv
POSTGRES_PASSWORD=MySecurePassword123!
MINIO_SECRET_KEY=AnotherSecureKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9
```

### PostgreSQL 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `POSTGRES_DB` | `starnion` | 数据库名称 |
| `POSTGRES_USER` | `starnion` | 数据库用户名 |
| `POSTGRES_PASSWORD` | _（必填）_ | 数据库密码 |
| `POSTGRES_PORT` | `5432` | PostgreSQL 端口 |

完整数据库 URL 格式：

```
postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB]?sslmode=disable
```

示例：

```dotenv
# Docker 容器间通信（主机名：postgres）
DATABASE_URL=postgres://starnion:MyPassword@postgres:5432/starnion?sslmode=disable

# 外部 PostgreSQL 服务器
DATABASE_URL=postgres://starnion:MyPassword@db.example.com:5432/starnion?sslmode=require
```

### MinIO（文件存储）配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MINIO_ACCESS_KEY` | `starnion` | MinIO 访问密钥（用户名） |
| `MINIO_SECRET_KEY` | _（必填）_ | MinIO 密钥（密码） |
| `MINIO_BUCKET` | `starnion-files` | 文件存储桶名称 |
| `MINIO_PORT` | `9000` | MinIO API 端口 |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO Web 控制台端口 |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | 文件访问公开 URL |

> **MinIO 控制台：** 您可以通过 `http://localhost:9001` 访问 MinIO Web 管理控制台。
> 使用 `MINIO_ACCESS_KEY` 和 `MINIO_SECRET_KEY` 登录。

### Gateway（API 服务器）配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GATEWAY_PORT` | `8080` | Gateway REST API 端口 |
| `GATEWAY_PUBLIC_URL` | `http://localhost:8080` | Gateway 公开 URL（用于 Google OAuth 回调） |
| `GRPC_PORT` | `50051` | Agent gRPC 通信端口 |

### UI（Web 界面）配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `UI_PORT` | `3000` | Next.js Web 服务器端口 |
| `NEXTAUTH_URL` | `http://localhost:3000` | NextAuth 回调基础 URL |
| `AUTH_SECRET` | _（必填）_ | NextAuth 会话加密密钥 |
| `JWT_SECRET` | _（必填）_ | JWT 令牌验证密钥（须与 Gateway 一致） |

### AI 服务商 API 密钥

使用 AI 功能至少需要配置一个 AI 服务商的 API 密钥。API 密钥也可以在 Web UI 的设置页面按用户单独输入。

| 变量 | 说明 | API 密钥获取地址 |
|------|------|-----------------|
| `GEMINI_API_KEY` | Google Gemini API 密钥 | [aistudio.google.com](https://aistudio.google.com) |
| `OPENAI_API_KEY` | OpenAI GPT API 密钥 | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API 密钥 | [console.anthropic.com](https://console.anthropic.com) |

### Google OAuth 配置（可选）

启用 Google 账号登录：

| 变量 | 说明 |
|------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 客户端密钥 |
| `GOOGLE_REDIRECT_URI` | OAuth 回调 URL（自动设置） |

### Telegram 机器人配置（可选）

通过 Telegram 访问 AI：

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram 机器人令牌 |

---

## 如何获取 API 密钥

### Google Gemini API 密钥

1. 前往 [Google AI Studio](https://aistudio.google.com)
2. 使用 Google 账号登录
3. 点击右上角的 **"Get API key"**
4. 点击 **"Create API key"**
5. 选择项目或创建新项目
6. 复制生成的 API 密钥

```dotenv
GEMINI_API_KEY=AIzaSy...your-key-here
```

> **免费套餐：** Gemini API 在一定限额内可免费使用，足以满足个人使用需求。

### OpenAI API 密钥

1. 前往 [OpenAI Platform](https://platform.openai.com)
2. 创建账号或登录
3. 进入 **API Keys** 菜单
4. 点击 **"+ Create new secret key"**
5. 输入密钥名称并创建
6. **立即复制密钥** — 之后将无法再次查看

```dotenv
OPENAI_API_KEY=sk-proj-...your-key-here
```

> **注意：** OpenAI API 是付费服务，使用将产生费用。

### Anthropic Claude API 密钥

1. 前往 [Anthropic Console](https://console.anthropic.com)
2. 创建账号或登录
3. 进入 **API Keys** 部分
4. 点击 **"Create Key"**
5. 输入密钥名称并创建
6. 复制生成的密钥

```dotenv
ANTHROPIC_API_KEY=sk-ant-...your-key-here
```

### Telegram 机器人令牌

1. 在 Telegram 中搜索 **@BotFather**
2. 发送 `/newbot` 命令
3. 输入机器人名称（例如："My Starnion Bot"）
4. 输入机器人用户名——必须以 `_bot` 结尾（例如："my_starnion_bot"）
5. BotFather 将发放一个**令牌**

```dotenv
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

设置 Telegram 机器人后，在 Gateway 中激活：

```bash
# 设置机器人 Webhook（可选——也支持轮询模式）
starnion telegram setup
```

### Google OAuth 客户端（可选）

用于 Google 账号登录：

1. 前往 [Google Cloud Console](https://console.cloud.google.com)
2. 创建或选择项目
3. 进入 **APIs & Services → Credentials**
4. 点击 **"+ CREATE CREDENTIALS" → "OAuth 2.0 Client IDs"**
5. 应用类型：选择 **Web application**
6. 添加**已授权的重定向 URI**：
   ```
   http://localhost:8080/auth/google/callback
   ```
7. 创建后，复制 **Client ID** 和 **Client Secret**

```dotenv
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...your-secret
```

---

## 完整 .env 文件示例

```dotenv
# ============================================================
# Starnion Docker 环境配置
# ============================================================

# ---- 必须修改的密钥 ----
POSTGRES_PASSWORD=MySecureDBPassword123!
MINIO_SECRET_KEY=MySecureMinIOKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0p2
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9j1

# ---- PostgreSQL ----
POSTGRES_DB=starnion
POSTGRES_USER=starnion
POSTGRES_PORT=5432

# ---- MinIO ----
MINIO_ACCESS_KEY=starnion
MINIO_BUCKET=starnion-files
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_PUBLIC_URL=http://localhost:9000

# ---- Gateway ----
GATEWAY_PORT=8080
GATEWAY_PUBLIC_URL=http://localhost:8080
GRPC_PORT=50051

# ---- UI ----
UI_PORT=3000
NEXTAUTH_URL=http://localhost:3000

# ---- AI 服务商（至少需要一个）----
GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# ---- 可选 ----
# TELEGRAM_BOT_TOKEN=1234567890:ABC...
# GOOGLE_CLIENT_ID=123...apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## 生产环境部署配置

### 域名与 HTTPS 设置

部署至可外部访问的服务器时：

```dotenv
# 替换为您的实际域名
GATEWAY_PUBLIC_URL=https://api.yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
MINIO_PUBLIC_URL=https://storage.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/google/callback
```

### 强化安全配置

```dotenv
# 使用更强的密钥（推荐 64 个字符以上）
JWT_SECRET=$(openssl rand -base64 64)
AUTH_SECRET=$(openssl rand -base64 64)

# 强密码
POSTGRES_PASSWORD=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)
```

### 使用外部 PostgreSQL 服务器

```dotenv
# 外部数据库服务器（例如 AWS RDS、Supabase、Neon）
DATABASE_URL=postgres://user:password@db.example.com:5432/starnion?sslmode=require
```

---

## 安全建议

### 密钥管理

- 切勿将 `.env` 文件提交至 Git
  ```bash
  # 确保 .gitignore 中包含此项
  echo ".env" >> .gitignore
  ```
- Git 中只包含 `.env.example`，排除实际值
- 在生产环境中，考虑使用密钥管理服务（AWS Secrets Manager、Vault 等）

### 网络安全

- 在生产环境中，不要对外暴露 `POSTGRES_PORT` 和 `MINIO_PORT`
- 使用 Nginx 或 Caddy 作为反向代理以强制 HTTPS
- 防火墙中只开放必要的端口：
  - 80（HTTP → HTTPS 重定向）
  - 443（HTTPS）
  - 其他所有端口仅允许内部网络访问

### 定期轮换密码

```bash
# 生成新的 JWT 密钥
NEW_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET=$NEW_SECRET"

# 更新 .env 文件并重启服务
docker compose restart gateway ui
```

---

## 修改配置后重启服务

修改 `.env` 文件后，需要重启服务以使更改生效：

```bash
# 完全重启（应用配置更改）
docker compose down && docker compose up -d

# 仅重启特定服务
docker compose restart gateway
docker compose restart ui
docker compose restart agent
```

---

## 下一步

- [快速开始](quickstart) — 设置完成后开始您的第一次对话
- [安装指南](installation) — 安装故障排除
- [什么是 Starnion？](introduction) — 了解功能与架构
