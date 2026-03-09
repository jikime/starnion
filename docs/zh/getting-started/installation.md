---
layout: default
title: 安装指南
nav_order: 3
parent: 快速入门
grand_parent: 🇨🇳 中文
---

# 安装指南
{: .no_toc }

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 系统要求

### 操作系统

| 操作系统 | 版本 | 备注 |
|----------|------|------|
| macOS | 13 (Ventura) 或更高版本 | 同时支持 Apple Silicon（M1/M2/M3）和 Intel |
| Linux | Ubuntu 22.04 / Debian 11 或更高版本 | 支持 amd64 和 arm64 架构 |
| Windows | 通过 WSL2 | 推荐 Windows 11 |

### 硬件（推荐配置）

| 规格 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核或以上 |
| 内存 | 4 GB | 8 GB 或以上 |
| 磁盘 | 20 GB | 50 GB 或以上（考虑数据增长） |
| 网络 | 互联网连接 | AI API 调用时需要 |

### 软件要求

#### 使用 Docker 运行（推荐）

| 软件 | 最低版本 | 安装链接 |
|------|----------|----------|
| Docker Engine | 24+ | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose | v2 | 随 Docker Engine 一起安装 |

#### 原生运行（适用于开发）

| 软件 | 最低版本 | 安装链接 |
|------|----------|----------|
| Go | 1.22+ | [go.dev](https://go.dev/dl/) |
| Python | 3.13+ | [python.org](https://www.python.org/downloads/) |
| uv | 最新版 | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org/) |
| pnpm | 最新版 | [pnpm.io](https://pnpm.io/installation) |
| PostgreSQL | 16+（含 pgvector） | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| MinIO | 最新版 | [min.io](https://min.io/download) |

---

## 安装方式一：CLI 安装（推荐）

先安装 Starnion CLI，可以让初始设置、服务管理和更新更加便捷。

### 快速安装（脚本）

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

安装脚本会自动执行以下操作：
1. 检测操作系统和架构
2. 从 [GitHub Releases](https://github.com/jikime/starnion/releases) 下载最新二进制文件
3. 验证 SHA-256 校验和
4. 安装到 `/usr/local/bin` 或 `~/.local/bin`

### 安装指定版本

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### 安装到用户目录

```bash
STARNION_DIR=~/.local/bin curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### CI / 自动化环境（非交互式）

```bash
NO_PROMPT=1 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### 验证安装

```bash
starnion version
# ★ StarNion v1.x.x
```

---

## 安装方式二：手动下载二进制文件

如果不想使用脚本，可以直接下载二进制文件：

### 下载适合您平台的文件

从 [GitHub Releases 页面](https://github.com/jikime/starnion/releases/latest) 下载适合您平台的文件：

| 平台 | 文件名 |
|------|--------|
| macOS Apple Silicon（M1/M2/M3） | `starnion_darwin_arm64.tar.gz` |
| macOS Intel | `starnion_darwin_amd64.tar.gz` |
| Linux x86-64 | `starnion_linux_amd64.tar.gz` |
| Linux ARM64 | `starnion_linux_arm64.tar.gz` |

### 验证校验和

```bash
# 下载校验和文件
curl -fsSL https://github.com/jikime/starnion/releases/latest/download/checksums.txt -o checksums.txt

# 验证（macOS）
shasum -a 256 --check --ignore-missing checksums.txt

# 验证（Linux）
sha256sum --check --ignore-missing checksums.txt
```

### 解压并安装

```bash
# 以 macOS Apple Silicon 为例
tar -xzf starnion_darwin_arm64.tar.gz
chmod +x starnion
sudo mv starnion /usr/local/bin/

# 验证安装
starnion version
```

---

## 安装方式三：从源码构建

需要 Go 1.22+ 和 `make`。

```bash
git clone https://github.com/jikime/starnion.git
cd starnion/gateway
make starnion
# 二进制文件生成于 ../starnion
sudo mv ../starnion /usr/local/bin/
```

---

## CLI 安装后：启动服务

### 使用 Docker 运行（推荐）

从 v1.0.2 起，只需 CLI 即可运行 Docker，无需 `git clone`。

```bash
# 1. 初始设置向导（数据库、MinIO、API 密钥等）
starnion setup

# 2. 启动 Docker 服务（包含镜像构建）
starnion docker up --build

# 3. 后续启动
starnion docker up -d
```

#### 生产模式

```bash
# 启用资源限制、日志轮转和端口限制
starnion docker up --prod -d
```

#### 常用 Docker 命令

```bash
starnion docker up -d          # 后台启动
starnion docker down           # 停止服务
starnion docker logs -f        # 实时查看日志
starnion docker ps             # 查看容器状态
starnion docker restart        # 重启所有服务
starnion docker migrate        # 单独执行 DB 迁移
starnion docker backup         # 备份 DB + 文件
starnion docker restore --from <路径>  # 从备份恢复
```

### 原生运行（开发者专用）

如果 PostgreSQL 和 MinIO 已在本地运行：

```bash
# 1. 仅通过 Docker 启动基础服务
starnion docker up -d postgres minio

# 2. 运行设置向导
starnion setup

# 3. 原生运行所有服务（网关 + 代理 + UI）
starnion dev
```

或单独运行各服务：

```bash
starnion gateway   # Go API 服务器      :8080
starnion agent     # Python AI 引擎     :50051
starnion ui        # Next.js 界面       :3000
```

---

## 验证安装

### 基本健康检查

```bash
# 检查 CLI 版本
starnion version

# 诊断系统状态
starnion doctor
```

`starnion doctor` 的预期输出：

```
✓ PostgreSQL connection verified
✓ MinIO connection verified
✓ Gateway response verified
✓ Agent gRPC connection verified
```

### 验证 Web UI 访问

在浏览器中访问以下地址：

```
http://localhost:3000
```

如果显示登录页面，则安装完成。

### 各服务健康检查

```bash
# Gateway API 健康检查
curl http://localhost:8080/health
# {"status":"ok"}

# MinIO 健康检查
curl http://localhost:9000/minio/health/live
# 200 OK

# PostgreSQL 连接检查（Docker 环境）
docker exec starnion-postgres pg_isready -U starnion
# /var/run/postgresql:5432 - accepting connections
```

---

## 更新

```bash
# 更新到最新版本（自动更新 CLI + Docker 镜像 + DB 迁移）
starnion update

# 仅检查版本
starnion update --check

# 仅更新 CLI（跳过 Docker 镜像拉取）
starnion update --skip-docker
```

---

## 卸载

### 移除 CLI

```bash
rm $(which starnion)
rm -rf ~/.config/starnion   # 移除配置文件（可选）
```

### 移除 Docker 服务和数据

```bash
cd starnion/docker

# 仅停止服务（保留数据）
docker compose down

# 移除服务 + 数据卷（数据）
docker compose down -v

# 移除所有内容，包括镜像
docker compose down -v --rmi all
```

> **警告：** `docker compose down -v` 命令会**永久删除所有数据**，包括 PostgreSQL 数据库和 MinIO 文件。请提前备份重要数据。

---

## 故障排除

### Docker 权限错误

```
permission denied while trying to connect to the Docker daemon socket
```

解决方法：

```bash
# 将当前用户添加至 docker 组
sudo usermod -aG docker $USER

# 重新登录，或执行：
newgrp docker
```

### 端口冲突

```
Error: bind: address already in use
```

解决方法：

```bash
# 检查哪个进程正在使用该端口
lsof -i :5432   # PostgreSQL
lsof -i :9000   # MinIO
lsof -i :8080   # Gateway
lsof -i :3000   # UI

# 在 .env 中修改端口
POSTGRES_PORT=5433
MINIO_PORT=9001
GATEWAY_PORT=8081
UI_PORT=3001
```

### 镜像构建失败

```bash
# 清除 Docker 缓存并重新构建
docker compose build --no-cache
docker compose up -d
```

### Agent 无法启动

```bash
# 查看 Agent 日志
docker compose logs agent

# 如果是 Python 依赖问题，重新构建镜像
docker compose build --no-cache agent
docker compose up -d agent
```

### PostgreSQL 连接失败

```bash
# 检查 PostgreSQL 容器状态
docker compose ps postgres
docker compose logs postgres

# 等待 PostgreSQL 健康后重试
docker compose restart gateway agent
```

### "pgvector extension not found" 错误

```bash
# 确认使用的是 pgvector 镜像
# 在 docker-compose.yml 中：
# image: pgvector/pgvector:pg16  ← 这是正确的
# image: postgres:16             ← 这不包含 pgvector

# 使用正确的镜像重新启动
docker compose down -v
docker compose up -d
```

### macOS Apple Silicon 问题

```bash
# 明确指定平台
docker compose --platform linux/arm64 up -d
```

### 无法访问 MinIO

如果无法访问 MinIO 控制台（`http://localhost:9001`）：

```bash
# 检查 MinIO 容器状态
docker compose logs minio

# 检查 .env 中的 MINIO_CONSOLE_PORT
echo $MINIO_CONSOLE_PORT
```

---

## 下一步

安装完成后：

- [配置说明](configuration) — AI API 密钥与环境变量设置
- [快速开始](quickstart) — 开始您的第一次对话
