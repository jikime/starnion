---
layout: default
title: Quick Start (3 steps)
nav_order: 2
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Quick Start (3 steps)
{: .no_toc }

With just the CLI, you can have Starnion running in 3 steps.
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Prerequisites

Before you begin, you only need these two things installed:

| Requirement | Minimum Version | How to Check |
|-------------|-----------------|--------------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

> **If you are using Docker Desktop**, Docker Engine and Docker Compose are already included.

### Verify Installation

```bash
docker --version
# Docker version 24.0.0, build ...

docker compose version
# Docker Compose version v2.x.x
```

---

## 3-Step Quick Start

### Step 1: Install the CLI

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

The installation script automatically:
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- Python agent → `~/.starnion/agent/`
- Next.js UI → `~/.starnion/ui/`
- Docker configuration files → `~/.starnion/docker/`

### Step 2: Run the Initial Setup Wizard

```bash
starnion setup
```

The setup wizard guides you through:

| Step | Configuration Item |
|------|--------------------|
| 1 | Verify system connections (PostgreSQL, MinIO) |
| 2 | Database connection and migration execution |
| 3 | Create admin account (email + password) |
| 4 | File storage setup (MinIO bucket) |
| 5 | Service URL configuration |

### Step 3: Start the Services

```bash
starnion docker up --build
```

The first run will take a few minutes to build the Docker images. Subsequent starts are immediate.

Monitor progress:

```bash
starnion docker logs -f
```

Once all services reach a `healthy` state, you are ready:

```bash
starnion docker ps
```

Expected output:

```
NAME                 STATUS
starnion-postgres    Up (healthy)
starnion-minio       Up (healthy)
starnion-agent       Up (healthy)
starnion-gateway     Up
starnion-ui          Up
```

---

## Your First Conversation

After logging in, try the following:

### Basic Conversation

Type a message in the chat input:

```
Hello! Please introduce yourself.
```

### Configure an AI Provider

Set up an AI API key for better responses:

1. User menu in the top right → **Settings**
2. Select the **AI Providers** tab
3. Enter your Google Gemini, OpenAI, or Anthropic API key

> **Start for free:** You can get a Gemini API key for free from Google AI Studio.
> 👉 [https://aistudio.google.com](https://aistudio.google.com)

### Try Out Skills

Test the built-in skills:

```
What's the weather like in Seoul today?
```

```
Translate "Hello, World!" into French.
```

```
What is 1 + 1?
```

---

## Quick Reference Commands

```bash
# Start services
starnion docker up -d

# Stop services
starnion docker down

# View logs (real-time)
starnion docker logs -f

# Logs for a specific service
starnion docker logs -f gateway
starnion docker logs -f agent

# Check service status
starnion docker ps

# Restart everything
starnion docker restart

# Rebuild images and start
starnion docker up --build

# Update to latest version
starnion update

# Backup / Restore
starnion docker backup
starnion docker restore --from ~/.starnion/backups/<timestamp>
```

---

## Running into Problems?

### Port Already in Use

```bash
# Check which process is using a port
lsof -i :3000
lsof -i :8080
lsof -i :5432
```

You can change ports in the `.env` file:

```dotenv
GATEWAY_PORT=8081
UI_PORT=3001
POSTGRES_PORT=5433
```

### A Service Won't Start

```bash
# Check error logs
docker compose logs gateway
docker compose logs agent

# Stop everything and restart
docker compose down && docker compose up -d
```

### Need More Help?

- [Installation Guide](installation) — More detailed installation instructions
- [Configuration](configuration) — Full explanation of environment variables
- [GitHub Issues](https://github.com/jikime/starnion/issues) — Bug reports and questions

---

## Next Steps

Once you have completed the quick start, check out:

- [Configuration](configuration) — AI API key setup, Telegram bot integration
- [Installation Guide](installation) — CLI installation and native execution
- [What is Starnion?](introduction) — Detailed architecture and feature descriptions
