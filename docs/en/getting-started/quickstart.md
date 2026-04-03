---
layout: default
title: Quick Start (3 steps)
nav_order: 2
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Quick Start (3 steps)
{: .no_toc }

With just the CLI, you can have StarNion running in 3 steps.
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Prerequisites

| Requirement | Minimum Version | How to Check |
|-------------|-----------------|--------------|
| Node.js | 20+ | `node --version` |
| pnpm | latest | `pnpm --version` |
| uv | latest | `uv --version` |
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

```bash
# Install prerequisites if missing
npm install -g pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> **Docker Desktop** includes Docker Engine and Docker Compose.

---

## 3-Step Quick Start

### Step 1: Install the CLI

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

The installation script automatically installs:
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- TypeScript agent → `~/.starnion/agent/`
- Next.js web UI → `~/.starnion/web/`
- Docker files → `~/.starnion/docker/`

### Step 2: Run the Initial Setup Wizard

```bash
starnion setup
```

The setup wizard guides you through 7 steps:

| Step | Configuration Item |
|------|--------------------|
| 1 | Language selection |
| 2 | System dependency check (Node.js, pnpm) |
| 3 | Database connection and migration |
| 4 | Create admin account (email + password) |
| 5 | File storage setup (MinIO) |
| 6 | Service configuration (ports, public URL) |
| 7 | AI provider detection (Claude Code auto-detect) |

### Step 3: Start the Services

Choose one of the following:

**Option A — Binary mode (recommended):**
```bash
starnion start
```

**Option B — Docker mode:**
```bash
starnion docker up -d
```

**Option C — systemd (Linux production):**
```bash
sudo cp ~/.starnion/scripts/starnion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now starnion
```

---

## AI Provider Setup

### Claude Code Subscription (Recommended)

```bash
claude        # Start Claude Code CLI
/login        # Authenticate via browser
```

Credentials are saved to `~/.claude/.credentials.json` and auto-detected on service start.

### Other Providers

Configure Gemini, OpenAI, Ollama, and other providers in the web UI at **Settings → Models** after logging in.

> **Start for free:** You can get a Gemini API key for free from Google AI Studio.
> [https://aistudio.google.com](https://aistudio.google.com)

---

## Your First Conversation

Open the web UI in your browser:

```
http://localhost:3893
```

Log in with the admin account you created during setup, then try:

```
Hello! Please introduce yourself.
```

---

## Quick Reference Commands

```bash
# Start services
starnion start              # Binary mode (foreground)
starnion docker up -d       # Docker mode (background)

# Stop services
starnion docker down        # Docker mode
# Ctrl+C                    # Binary mode

# View logs
journalctl -u starnion -f   # systemd
starnion docker logs -f      # Docker

# Check status
starnion doctor              # System health check

# Update to latest version
starnion update
```

---

## Next Steps

- [Installation Guide](installation) — Detailed installation options and troubleshooting
- [Configuration](configuration) — Environment variables and advanced settings
