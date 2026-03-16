---
layout: default
title: Production Deployment (nginx + systemd)
nav_order: 5
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Production Deployment (nginx + systemd)
{: .no_toc }

This guide covers running Starnion as **systemd services** on Rocky Linux / RHEL
and exposing it via an **nginx reverse proxy** with a custom domain and SSL.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Prerequisites

| Item | Details |
|------|---------|
| OS | Rocky Linux 8/9 (or RHEL 8/9, AlmaLinux 8/9) |
| Run-as user | `starnion` (dedicated system account recommended) |
| Install path | `~/.starnion/` (already set up via `starnion setup`) |
| nginx | `sudo dnf install nginx` |
| Node.js / pnpm | `pnpm build` completed inside `~/.starnion/ui/` |

### Create the starnion system account

```bash
sudo useradd -m -s /bin/bash starnion
sudo passwd starnion
```

---

## Step 1: Install systemd service files

Starnion runs as three independent services plus a target that groups them.

| File | Role |
|------|------|
| `starnion-gateway.service` | Go API server (:8080) |
| `starnion-agent.service` | Python AI engine (:50051 gRPC) |
| `starnion-ui.service` | Next.js web UI (:3893) |
| `starnion.target` | Groups all three services (≡ `starnion dev`) |

### Copy the files

```bash
sudo cp ~/.starnion/scripts/starnion-gateway.service \
        ~/.starnion/scripts/starnion-agent.service \
        ~/.starnion/scripts/starnion-ui.service \
        ~/.starnion/scripts/starnion.target \
        /etc/systemd/system/

sudo systemctl daemon-reload
```

> **💡** The service files are also available in the `scripts/` folder of the GitHub repository.

---

## Step 2: Verify Node.js / pnpm paths

`starnion-ui.service` uses `/usr/bin/pnpm` by default.
If you installed Node.js via nvm or fnm the path will differ.

```bash
# Check the actual paths under the starnion account
sudo -u starnion which node
sudo -u starnion which pnpm
```

If the path differs, edit the service file:

```bash
sudo nano /etc/systemd/system/starnion-ui.service
```

```ini
# Example: installed via fnm
ExecStart=/home/starnion/.local/share/fnm/node-versions/v22.x.x/installation/bin/pnpm start
```

Reload after any edit:

```bash
sudo systemctl daemon-reload
```

---

## Step 3: Build the UI

A production build must exist before starting the service.

```bash
sudo -u starnion bash -c "cd ~/.starnion/ui && pnpm install && pnpm build"
```

A successful build creates `~/.starnion/ui/.next/`.

---

## Step 4: SELinux configuration (Rocky Linux)

Executables inside a home directory may be blocked by SELinux.
Run these commands once to grant execution context:

```bash
# Gateway binary
sudo chcon -R -t bin_t /home/starnion/.starnion/bin/

# Python venv bin
sudo chcon -R -t bin_t /home/starnion/.starnion/agent/.venv/bin/
```

Alternatively, enable the SELinux boolean:

```bash
sudo setsebool -P allow_user_exec_content 1
```

---

## Step 5: Enable and start services

```bash
# Enable all services at boot
sudo systemctl enable starnion.target

# Start now (all three services start together)
sudo systemctl start starnion.target

# Verify
systemctl status starnion.target
systemctl status starnion-gateway starnion-agent starnion-ui
```

### Expected status output

```
● starnion-gateway.service - Starnion Gateway (Go API server)
     Loaded: loaded (/etc/systemd/system/starnion-gateway.service; enabled)
     Active: active (running) since ...

● starnion-agent.service - Starnion Agent (LangGraph gRPC server)
     Active: active (running) ...

● starnion-ui.service - Starnion UI (Next.js)
     Active: active (running) ...
```

---

## Step 6: Configure nginx reverse proxy

### Install nginx

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### Deploy the nginx config

```bash
# Copy the provided config and replace the domain
sudo cp ~/.starnion/scripts/nginx-lets-ai-kr.conf \
        /etc/nginx/conf.d/your-domain.com.conf

sudo sed -i 's/lets\.ai\.kr/your-domain.com/g' \
        /etc/nginx/conf.d/your-domain.com.conf

# Validate
sudo nginx -t

# Apply
sudo systemctl reload nginx
```

### Key nginx config sections explained

```nginx
# ── Correct WebSocket Connection header ─────────────────────────────────────
# Using map prevents non-WS requests from getting "Connection: upgrade"
map $http_upgrade $connection_upgrade {
    default  upgrade;
    ''       "";
}

upstream starnion_ui {
    server 127.0.0.1:3893;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # ── SSE (streaming chat) ─────────────────────────────────────────────────
    # MUST disable buffering and gzip; extend read timeout for long AI calls
    location = /api/chat {
        proxy_pass         http://starnion_ui;
        proxy_buffering    off;      # flush SSE events immediately
        proxy_read_timeout 300s;     # AI calls can take > 60 s
        gzip               off;      # gzip + streaming = events arrive in batches
        # Security headers must be re-declared when add_header is used in a
        # location block — nginx silently drops parent-level add_header directives
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Frame-Options           "SAMEORIGIN"                          always;
        add_header X-Content-Type-Options    "nosniff"                             always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin"     always;
    }

    # ── WebSocket ────────────────────────────────────────────────────────────
    location = /api/ws {
        proxy_pass         http://starnion_ui;
        proxy_buffering    off;
        proxy_read_timeout 3600s;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
    }

    # ── Static assets (long-lived cache) ────────────────────────────────────
    location /_next/static/ {
        proxy_pass http://starnion_ui;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # ── Regular requests ─────────────────────────────────────────────────────
    location / {
        proxy_pass http://starnion_ui;
    }
}
```

---

## Step 7: SSL certificate with Let's Encrypt

```bash
# Install certbot
sudo dnf install -y certbot python3-certbot-nginx

# Issue a certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Verify auto-renewal
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

Certbot automatically adds the SSL configuration to your nginx site file.

---

## Operations reference

### Service management

```bash
# Start / stop / restart the entire stack
sudo systemctl start   starnion.target
sudo systemctl stop    starnion.target
sudo systemctl restart starnion.target

# Restart individual services
sudo systemctl restart starnion-gateway
sudo systemctl restart starnion-agent
sudo systemctl restart starnion-ui
```

### Log inspection

```bash
# Follow all services simultaneously
journalctl -u starnion-gateway -u starnion-agent -u starnion-ui -f

# Last 100 lines from a single service
journalctl -u starnion-gateway -n 100

# Today's logs only
journalctl -u starnion-agent --since today

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### nginx management

```bash
sudo nginx -t                # Syntax check
sudo systemctl reload nginx  # Zero-downtime config reload
sudo systemctl restart nginx # Full restart
```

---

## Troubleshooting

### Service fails to start

```bash
journalctl -u starnion-gateway -n 50
journalctl -u starnion-agent -n 50
journalctl -u starnion-ui -n 50
```

**Common causes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `exec format error` | Wrong binary architecture | Re-download the correct platform binary |
| `Permission denied` | SELinux blocking | Run `chcon -t bin_t` on the binary |
| `No such file or directory` | Wrong install path | Check files under `~/.starnion/` |
| `pnpm: not found` | Wrong pnpm path in service file | Update `ExecStart` in `starnion-ui.service` |
| `Address already in use` | Port conflict | `lsof -i :<port>` to find the process |

### 502 Bad Gateway from nginx

```bash
# Check if the UI service is running
systemctl status starnion-ui

# Verify the build exists
ls ~/.starnion/ui/.next/

# Check the port is listening
ss -tlnp | grep 3893
```

### Chat responses stop mid-stream

Verify that SSE buffering is disabled in your nginx config:

```bash
sudo grep -A5 "location = /api/chat" /etc/nginx/conf.d/your-domain.com.conf
# Must contain:  proxy_buffering off;
# Must contain:  proxy_read_timeout 300s;
```

### SELinux denial check

```bash
# Show recent AVC denials
sudo ausearch -m avc -ts recent | grep starnion

# Temporarily set permissive mode to isolate the issue
sudo setenforce 0   # test
sudo setenforce 1   # re-enable after testing
```

---

## Next steps

- [Configuration](configuration) — AI API keys and environment variables
- [Telegram channel](../channels/telegram) — Connect a Telegram bot
