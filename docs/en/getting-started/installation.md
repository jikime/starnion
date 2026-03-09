---
layout: default
title: Installation Guide
nav_order: 3
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Installation Guide
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## System Requirements

### Operating System

| OS | Version | Notes |
|----|---------|-------|
| macOS | 13 (Ventura) or later | Supports both Apple Silicon (M1/M2/M3) and Intel |
| Linux | Ubuntu 22.04 / Debian 11 or later | Supports amd64 and arm64 architectures |
| Windows | via WSL2 | Windows 11 recommended |

### Hardware (Recommended)

| Spec | Minimum | Recommended |
|------|---------|-------------|
| CPU | 2 cores | 4 cores or more |
| RAM | 4 GB | 8 GB or more |
| Disk | 20 GB | 50 GB or more (accounting for data growth) |
| Network | Internet connection | Required for AI API calls |

### Software Requirements

#### Running with Docker (Recommended)

| Software | Minimum Version | Installation Link |
|----------|-----------------|-------------------|
| Docker Engine | 24+ | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose | v2 | Included with Docker Engine |

#### Running Natively (For Development)

| Software | Minimum Version | Installation Link |
|----------|-----------------|-------------------|
| Go | 1.22+ | [go.dev](https://go.dev/dl/) |
| Python | 3.13+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | [pnpm.io](https://pnpm.io/installation) |
| PostgreSQL | 16+ (with pgvector) | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| MinIO | latest | [min.io](https://min.io/download) |

---

## Installation Method 1: CLI Installation (Recommended)

Installing the Starnion CLI first makes initial setup, service management, and updates much more convenient.

### Quick Install (Script)

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

The installation script automatically performs the following:
1. Detects operating system and architecture
2. Downloads the latest binary from [GitHub Releases](https://github.com/jikime/starnion/releases)
3. Verifies the SHA-256 checksum
4. Installs to `/usr/local/bin` or `~/.local/bin`

### Install a Specific Version

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### Install to a User Directory

```bash
STARNION_DIR=~/.local/bin curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### CI / Automation Environments (Non-interactive)

```bash
NO_PROMPT=1 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### Verify Installation

```bash
starnion version
# ★ StarNion v1.x.x
```

---

## Installation Method 2: Manual Binary Installation

To download the binary directly without a script:

### Download the File for Your Platform

Download the file for your platform from the [GitHub Releases page](https://github.com/jikime/starnion/releases/latest):

| Platform | Filename |
|----------|----------|
| macOS Apple Silicon (M1/M2/M3) | `starnion_darwin_arm64.tar.gz` |
| macOS Intel | `starnion_darwin_amd64.tar.gz` |
| Linux x86-64 | `starnion_linux_amd64.tar.gz` |
| Linux ARM64 | `starnion_linux_arm64.tar.gz` |

### Verify the Checksum

```bash
# Download the checksum file
curl -fsSL https://github.com/jikime/starnion/releases/latest/download/checksums.txt -o checksums.txt

# Verify (macOS)
shasum -a 256 --check --ignore-missing checksums.txt

# Verify (Linux)
sha256sum --check --ignore-missing checksums.txt
```

### Extract and Install

```bash
# Example for macOS Apple Silicon
tar -xzf starnion_darwin_arm64.tar.gz
chmod +x starnion
sudo mv starnion /usr/local/bin/

# Verify installation
starnion version
```

---

## Installation Method 3: Build from Source

Requires Go 1.22+ and `make`.

```bash
git clone https://github.com/jikime/starnion.git
cd starnion/gateway
make starnion
# The binary is created at ../starnion
sudo mv ../starnion /usr/local/bin/
```

---

## After CLI Installation: Running Services

### Run with Docker (Recommended)

Since v1.0.2, you can run with Docker using only the CLI — no `git clone` required.

```bash
# 1. Initial setup wizard (DB, MinIO, API keys, etc.)
starnion setup

# 2. Start Docker services (includes image build)
starnion docker up --build

# 3. Subsequent starts
starnion docker up -d
```

#### Production Mode

```bash
# Applies resource limits, log rotation, and port restrictions
starnion docker up --prod -d
```

#### Key Docker Commands

```bash
starnion docker up -d          # Start in background
starnion docker down           # Stop services
starnion docker logs -f        # Live logs
starnion docker ps             # Container status
starnion docker restart        # Restart all
starnion docker migrate        # Run DB migrations standalone
starnion docker backup         # Backup DB + files
starnion docker restore --from <path>  # Restore from backup
```

### Run Natively (For Developers)

If PostgreSQL and MinIO are already running locally:

```bash
# 1. Start infrastructure services via Docker only
starnion docker up -d postgres minio

# 2. Run setup wizard
starnion setup

# 3. Start all services natively (gateway + agent + UI)
starnion dev
```

Or run individual services:

```bash
starnion gateway   # Go API server     :8080
starnion agent     # Python AI engine  :50051
starnion ui        # Next.js UI        :3000
```

---

## Verifying the Installation

### Basic Health Check

```bash
# Check CLI version
starnion version

# Diagnose system status
starnion doctor
```

Expected output from `starnion doctor`:

```
✓ PostgreSQL connection verified
✓ MinIO connection verified
✓ Gateway response verified
✓ Agent gRPC connection verified
```

### Verify Web UI Access

Navigate to the following address in your browser:

```
http://localhost:3000
```

If the login page is displayed, installation is complete.

### Per-Service Health Checks

```bash
# Gateway API health check
curl http://localhost:8080/health
# {"status":"ok"}

# MinIO health check
curl http://localhost:9000/minio/health/live
# 200 OK

# PostgreSQL connection check (Docker environment)
docker exec starnion-postgres pg_isready -U starnion
# /var/run/postgresql:5432 - accepting connections
```

---

## Update

```bash
# Update to latest version (CLI + Docker images + DB migrations automatically)
starnion update

# Check version only
starnion update --check

# Update CLI only (skip Docker image pull)
starnion update --skip-docker

# Update to a specific version
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

---

## Uninstalling

### Remove the CLI

```bash
rm $(which starnion)
rm -rf ~/.config/starnion   # Remove config files (optional)
```

### Remove Docker Services and Data

```bash
cd starnion/docker

# Stop services only (preserve data)
docker compose down

# Remove services + volumes (data)
docker compose down -v

# Remove everything including images
docker compose down -v --rmi all
```

> **Warning:** The `docker compose down -v` command **permanently deletes all data**, including the PostgreSQL database and MinIO files. Back up any important data beforehand.

---

## Troubleshooting

### Docker Permission Error

```
permission denied while trying to connect to the Docker daemon socket
```

Solution:

```bash
# Add the current user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in, or:
newgrp docker
```

### Port Conflict

```
Error: bind: address already in use
```

Solution:

```bash
# Check which process is using the port
lsof -i :5432   # PostgreSQL
lsof -i :9000   # MinIO
lsof -i :8080   # Gateway
lsof -i :3000   # UI

# Change the port in .env
POSTGRES_PORT=5433
MINIO_PORT=9001
GATEWAY_PORT=8081
UI_PORT=3001
```

### Image Build Failure

```bash
# Clear Docker cache and rebuild
docker compose build --no-cache
docker compose up -d
```

### Agent Won't Start

```bash
# Check Agent logs
docker compose logs agent

# If it's a Python dependency issue, rebuild the image
docker compose build --no-cache agent
docker compose up -d agent
```

### PostgreSQL Connection Failure

```bash
# Check PostgreSQL container status
docker compose ps postgres
docker compose logs postgres

# Wait until PostgreSQL is healthy, then retry
docker compose restart gateway agent
```

### "pgvector extension not found" Error

```bash
# Verify you are using the pgvector image
# In docker-compose.yml:
# image: pgvector/pgvector:pg16  ← this is correct
# image: postgres:16             ← this does not include pgvector

# Restart with the correct image
docker compose down -v
docker compose up -d
```

### Apple Silicon Issues on macOS

```bash
# Explicitly specify the platform
docker compose --platform linux/arm64 up -d
```

### Cannot Access MinIO

If you cannot reach the MinIO console (`http://localhost:9001`):

```bash
# Check MinIO container status
docker compose logs minio

# Check MINIO_CONSOLE_PORT in .env
echo $MINIO_CONSOLE_PORT
```

---

## Next Steps

Once installation is complete:

- [Configuration](configuration) — AI API keys and environment variable setup
- [Quick Start](quickstart) — Start your first conversation
