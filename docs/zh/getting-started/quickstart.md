---
layout: default
title: 快速开始
nav_order: 2
parent: 快速入门
---

# 快速开始（5 分钟）
{: .no_toc }

只需 Docker，即可在 5 分钟内启动 Starnion。
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
| Git | 2.x | `git --version` |

> **如果您使用 Docker Desktop**，Docker Engine 和 Docker Compose 已包含在内。

### 验证安装

```bash
docker --version
# Docker version 24.0.0, build ...

docker compose version
# Docker Compose version v2.x.x

git --version
# git version 2.x.x
```

---

## 五步快速开始

### 第 1 步：克隆仓库

```bash
git clone https://github.com/jikime/starnion.git
cd starnion
```

### 第 2 步：配置环境文件

```bash
cd docker
cp .env.example .env
```

打开 `.env` 文件，至少修改以下 4 个密钥值：

```bash
# 编辑 .env 文件
nano .env   # 或使用 vim、code 等您喜欢的编辑器
```

必须修改的关键值：

```dotenv
# 必须修改这些值！
POSTGRES_PASSWORD=your_secure_password_here
MINIO_SECRET_KEY=your_secure_key_here
JWT_SECRET=random_string_of_at_least_32_characters_here
AUTH_SECRET=random_string_of_at_least_32_characters_here
```

> **生成安全随机字符串：**
> ```bash
> # macOS / Linux
> openssl rand -base64 32
> ```

### 第 3 步：启动服务

```bash
# 在 docker 目录下运行
docker compose up -d
```

首次运行时需要几分钟来构建 Docker 镜像，之后的启动将会很快。

监控启动进度：

```bash
docker compose logs -f
```

所有服务达到 `healthy` 状态后即可使用：

```bash
docker compose ps
```

预期输出：

```
NAME                 STATUS
starnion-postgres    Up (healthy)
starnion-minio       Up (healthy)
starnion-agent       Up
starnion-gateway     Up
starnion-ui          Up
```

### 第 4 步：运行初始设置向导

在另一个终端中，安装 Starnion CLI 并运行初始设置：

```bash
# 安装 CLI（可选——不安装也可以直接使用 Docker）
curl -fsSL https://jikime.github.io/starnion/install.sh | bash

# 运行初始设置向导
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

> **不使用 CLI 时：**
> ```bash
> cd docker && bash setup.sh
> ```

### 第 5 步：在浏览器中打开

打开浏览器并访问：

```
http://localhost:3000
```

使用第 3 步创建的管理员邮箱和密码登录。

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
docker compose up -d

# 停止服务
docker compose down

# 查看日志（实时）
docker compose logs -f

# 查看特定服务的日志
docker compose logs -f gateway
docker compose logs -f agent

# 检查服务状态
docker compose ps

# 重启所有服务
docker compose restart

# 重新构建镜像并启动
docker compose up -d --build
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
