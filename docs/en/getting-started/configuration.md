---
layout: default
title: Configuration
nav_order: 4
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Configuration
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Overview

Starnion configuration is managed in two ways:

1. **Setup Wizard** (`starnion setup`) — Interactive initial setup
2. **Environment File** (`docker/.env`) — Direct editing

---

## Setup Wizard

The `starnion setup` command is an interactive wizard that guides you through core configuration:

```bash
starnion setup
```

Wizard steps:

| Step | Configuration | Saved To |
|------|---------------|----------|
| 1. System Check | PostgreSQL, MinIO connection test | - |
| 2. Database | DB URL, migration execution | `~/.config/starnion/config.yaml` |
| 3. Admin Account | Email, password creation | PostgreSQL |
| 4. File Storage | MinIO endpoint, credentials, bucket | `~/.config/starnion/config.yaml` |
| 5. Service URL | Gateway public URL | `~/.config/starnion/config.yaml` |

After the wizard completes, settings are saved to `~/.config/starnion/config.yaml`.

---

## Full Environment Variable Reference

This section describes all environment variables in the `docker/.env` file.

### Required Secrets (Must Be Changed)

Never use the default values in a production environment.

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `change-me-in-production` | PostgreSQL database password |
| `MINIO_SECRET_KEY` | `change-me-in-production` | MinIO object storage secret key |
| `JWT_SECRET` | `change-me-min-32-chars-in-production` | JWT token signing key (minimum 32 characters) |
| `AUTH_SECRET` | `change-me-min-32-chars-in-production` | NextAuth session encryption key (minimum 32 characters) |

Generate a secure random value:

```bash
# Generate a JWT_SECRET or AUTH_SECRET
openssl rand -base64 32

# Example output:
# K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gH=
```

Set in the `.env` file:

```dotenv
POSTGRES_PASSWORD=MySecurePassword123!
MINIO_SECRET_KEY=AnotherSecureKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9
```

### PostgreSQL Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | `starnion` | Database name |
| `POSTGRES_USER` | `starnion` | Database username |
| `POSTGRES_PASSWORD` | _(required)_ | Database password |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |

Full database URL format:

```
postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB]?sslmode=disable
```

Examples:

```dotenv
# Communication between Docker containers (hostname: postgres)
DATABASE_URL=postgres://starnion:MyPassword@postgres:5432/starnion?sslmode=disable

# External PostgreSQL server
DATABASE_URL=postgres://starnion:MyPassword@db.example.com:5432/starnion?sslmode=require
```

### MinIO (File Storage) Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ACCESS_KEY` | `starnion` | MinIO access key (username) |
| `MINIO_SECRET_KEY` | _(required)_ | MinIO secret key (password) |
| `MINIO_BUCKET` | `starnion-files` | File storage bucket name |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO web console port |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Public URL for file access |

> **MinIO Console:** You can access the MinIO web admin console at `http://localhost:9001`.
> Log in with `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`.

### Gateway (API Server) Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `8080` | Gateway REST API port |
| `GATEWAY_PUBLIC_URL` | `http://localhost:8080` | Gateway public URL (used for Google OAuth callback) |
| `GRPC_PORT` | `50051` | Agent gRPC communication port |

### UI (Web Interface) Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `UI_PORT` | `3000` | Next.js web server port |
| `NEXTAUTH_URL` | `http://localhost:3893` | NextAuth callback base URL |
| `AUTH_SECRET` | _(required)_ | NextAuth session encryption key |
| `JWT_SECRET` | _(required)_ | JWT token validation key (must match Gateway) |

### AI Provider API Keys

At least one AI provider API key is required to use AI features. API keys can also be entered per user on the Settings page in the web UI.

| Variable | Description | API Key URL |
|----------|-------------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key | [aistudio.google.com](https://aistudio.google.com) |
| `OPENAI_API_KEY` | OpenAI GPT API key | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | [console.anthropic.com](https://console.anthropic.com) |

### Google OAuth Configuration (Optional)

To enable login with a Google account:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (set automatically) |

### Telegram Bot Configuration (Optional)

To access AI via Telegram:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |

---

## How to Get API Keys

### Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Log in with your Google account
3. Click **"Get API key"** in the top right
4. Click **"Create API key"**
5. Select a project or create a new one
6. Copy the generated API key

```dotenv
GEMINI_API_KEY=AIzaSy...your-key-here
```

> **Free tier:** The Gemini API can be used for free within certain limits, which is sufficient for personal use.

### OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create an account or log in
3. Navigate to the **API Keys** menu
4. Click **"+ Create new secret key"**
5. Enter a key name and create it
6. **Copy the key immediately** — you cannot view it again

```dotenv
OPENAI_API_KEY=sk-proj-...your-key-here
```

> **Note:** The OpenAI API is a paid service. Usage will be billed.

### Anthropic Claude API Key

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an account or log in
3. Navigate to the **API Keys** section
4. Click **"Create Key"**
5. Enter a key name and create it
6. Copy the generated key

```dotenv
ANTHROPIC_API_KEY=sk-ant-...your-key-here
```

### Telegram Bot Token

1. Search for **@BotFather** on Telegram
2. Send the `/newbot` command
3. Enter a bot name (e.g., "My Starnion Bot")
4. Enter a bot username — must end with `_bot` (e.g., "my_starnion_bot")
5. BotFather will issue a **token**

```dotenv
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

After setting up the Telegram bot, activate it in the Gateway:

```bash
# Set up bot webhook (optional — polling mode is also supported)
starnion telegram setup
```

### Google OAuth Client (Optional)

For login with a Google account:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Navigate to **APIs & Services → Credentials**
4. Click **"+ CREATE CREDENTIALS" → "OAuth 2.0 Client IDs"**
5. Application type: select **Web application**
6. Add an **Authorized redirect URI**:
   ```
   http://localhost:8080/auth/google/callback
   ```
7. After creation, copy the **Client ID** and **Client Secret**

```dotenv
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...your-secret
```

---

## Complete .env File Example

```dotenv
# ============================================================
# Starnion Docker Environment Configuration
# ============================================================

# ---- Required Secrets (must be changed!) ----
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
NEXTAUTH_URL=http://localhost:3893

# ---- AI Providers (at least one required) ----
GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# ---- Optional ----
# TELEGRAM_BOT_TOKEN=1234567890:ABC...
# GOOGLE_CLIENT_ID=123...apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## Configuration for Production Deployment

### Domain and HTTPS Setup

When deploying to an externally accessible server:

```dotenv
# Replace with your actual domain
GATEWAY_PUBLIC_URL=https://api.yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
MINIO_PUBLIC_URL=https://storage.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/google/callback
```

### Hardened Security Configuration

```dotenv
# Use stronger secrets (64+ characters recommended)
JWT_SECRET=$(openssl rand -base64 64)
AUTH_SECRET=$(openssl rand -base64 64)

# Strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)
```

### Using an External PostgreSQL Server

```dotenv
# External DB server (e.g., AWS RDS, Supabase, Neon)
DATABASE_URL=postgres://user:password@db.example.com:5432/starnion?sslmode=require
```

---

## Security Recommendations

### Secret Management

- Never commit the `.env` file to Git
  ```bash
  # Make sure this is in .gitignore
  echo ".env" >> .gitignore
  ```
- Only include `.env.example` in Git, with the actual values excluded
- In production, consider a secrets management service (AWS Secrets Manager, Vault, etc.)

### Network Security

- In production, do not expose `POSTGRES_PORT` and `MINIO_PORT` externally
- Use Nginx or Caddy as a reverse proxy to enforce HTTPS
- Allow only the necessary ports in your firewall:
  - 80 (HTTP → HTTPS redirect)
  - 443 (HTTPS)
  - All other ports should only be accessible from the internal network

### Regular Password Rotation

```bash
# Generate a new JWT secret
NEW_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET=$NEW_SECRET"

# Update the .env file and restart services
docker compose restart gateway ui
```

---

## Restarting Services After Configuration Changes

After modifying the `.env` file, you need to restart the services:

```bash
# Full restart (apply configuration changes)
docker compose down && docker compose up -d

# Restart a specific service only
docker compose restart gateway
docker compose restart ui
docker compose restart agent
```

---

## Next Steps

- [Quick Start](quickstart) — Start your first conversation after setup
- [Installation Guide](installation) — Installation troubleshooting
- [What is Starnion?](introduction) — Understanding features and architecture
