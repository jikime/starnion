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
curl -fsSL https://jikime.github.io/starpion/install.sh | bash
```

Verify:

```bash
starpion version
```

---

## 2. Start PostgreSQL and MinIO

StarPion requires PostgreSQL (with pgvector) and MinIO before running setup.

### Using Docker (recommended for local setup)

```bash
# Start only infra services
cd path/to/starpion/docker
docker compose up -d postgres minio
```

### Already running?

If you have PostgreSQL and MinIO running locally, make sure:
- PostgreSQL has the `pgvector` extension available
- MinIO is accessible at its endpoint

Check connectivity:

```bash
starpion doctor
```

---

## 3. Run Setup Wizard

```bash
starpion setup
```

The interactive wizard guides you through 5 steps:

| Step | What it configures |
|------|-------------------|
| **System Check** | Verifies PostgreSQL and MinIO are reachable |
| **Database** | Connection details, runs migrations |
| **Admin Account** | Creates the first admin user |
| **File Storage** | MinIO endpoint, credentials, bucket |
| **Service URLs** | Gateway URL for the web UI |

Config is saved to `~/.config/starpion/config.yaml`.

---

## 4. Launch Services

### Option A — Native (development)

Runs gateway (Go), agent (Python), and UI (Next.js) as local processes with colored log output:

```bash
starpion dev
```

Or start services individually:

```bash
starpion gateway   # Go API server      :8080
starpion agent     # Python AI engine   :50051
starpion ui        # Next.js interface  :3000
```

### Option B — Docker

```bash
starpion docker up --build
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
starpion setup          # Run configuration wizard
starpion dev            # Start all services (native)
starpion docker up      # Start all services (Docker)
starpion docker logs -f # Stream Docker logs
starpion doctor         # Check system health
starpion update         # Update to latest version
```

---

## Next Steps

- [Deployment](deploy) — production and Docker deployment
- [Update](update) — keeping StarPion up to date
