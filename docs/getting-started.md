---
layout: default
title: Getting Started
nav_order: 3
---

# Getting Started
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 1. Install the CLI

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

Verify:

```bash
starnion version
```

---

## 2. Start PostgreSQL and MinIO

StarNion requires PostgreSQL (with pgvector) and MinIO before running setup.

### Using Docker (recommended for local setup)

```bash
# Start only infra services
cd path/to/starnion/docker
docker compose up -d postgres minio
```

### Already running?

If you have PostgreSQL and MinIO running locally, make sure:
- PostgreSQL has the `pgvector` extension available
- MinIO is accessible at its endpoint

Check connectivity:

```bash
starnion doctor
```

---

## 3. Run Setup Wizard

```bash
starnion setup
```

The interactive wizard guides you through 5 steps:

| Step | What it configures |
|------|-------------------|
| **System Check** | Verifies PostgreSQL and MinIO are reachable |
| **Database** | Connection details, runs migrations |
| **Admin Account** | Creates the first admin user |
| **File Storage** | MinIO endpoint, credentials, bucket |
| **Service URLs** | Gateway URL for the web UI |

Config is saved to `~/.config/starnion/config.yaml`.

---

## 4. Launch Services

### Option A — Native (development)

Runs gateway (Go), agent (Python), and UI (Next.js) as local processes with colored log output:

```bash
starnion dev
```

Or start services individually:

```bash
starnion gateway   # Go API server      :8080
starnion agent     # Python AI engine   :50051
starnion ui        # Next.js interface  :3000
```

### Option B — Docker

```bash
starnion docker up --build
```

Or with Docker Compose directly:

```bash
cd docker && bash setup.sh
```

---

## 5. Open the Web UI

Navigate to [http://localhost:3000](http://localhost:3000) and log in with the admin email and password you set in step 3.

---

## Quick Reference

```bash
starnion setup          # Run configuration wizard
starnion dev            # Start all services (native)
starnion docker up      # Start all services (Docker)
starnion docker logs -f # Stream Docker logs
starnion doctor         # Check system health
starnion update         # Update to latest version
```

---

## Next Steps

- [Deployment](deploy) — production and Docker deployment
- [Update](update) — keeping StarNion up to date
