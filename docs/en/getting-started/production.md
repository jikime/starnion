---
layout: default
title: Production Deployment (nginx + systemd)
nav_order: 5
parent: Getting Started
grand_parent: 🇺🇸 English
---

# Production Deployment (nginx + systemd)
{: .no_toc }

This guide covers running StarNion as a **systemd service** on Rocky Linux / RHEL
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
| Install path | `~/.starnion/` (set up via `starnion setup`) |
| nginx | `sudo dnf install nginx` |
| Node.js | 20+ (nvm recommended) |
| uv | Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/)) |

---

## Step 1: Install the systemd service

StarNion runs as a **single service** that manages all three components (gateway, agent, web) via `starnion start`.

```bash
sudo cp ~/.starnion/scripts/starnion.service /etc/systemd/system/
sudo systemctl daemon-reload
```

The service file uses `bash -lc` to load your shell profile (nvm, PATH, etc.):

```ini
[Service]
Type=simple
Environment=HOME=/root
ExecStart=/bin/bash -lc "export HOME=/root && starnion start"
```

> **Non-root user**: Replace `/root` with your home directory (e.g. `/home/starnion`).
> `starnion update` auto-replaces the HOME path when installing the service file.

---

## Step 2: SELinux configuration (Rocky Linux)

Executables inside home directories carry the `admin_home_t` SELinux context,
which prevents systemd from executing them.

### Apply bin_t context

```bash
# Gateway binary
sudo chcon -t bin_t ~/.starnion/bin/starnion-gateway

# Node.js binary (nvm)
sudo chcon -t bin_t $(which node)

# Python venv binary (uv)
sudo chcon -t bin_t $(readlink -f ~/.starnion/venv/bin/python3)
```

### Persist across reboots

```bash
sudo semanage fcontext -a -t bin_t "$HOME/.starnion/bin(/.*)?"
sudo restorecon -Rv ~/.starnion/bin/
```

Or allow all user-home executables:

```bash
sudo setsebool -P allow_user_exec_content 1
```

---

## Step 3: Enable and start

```bash
# Enable at boot + start now
sudo systemctl enable --now starnion

# Verify
sudo systemctl status starnion
```

### Expected output

```
● starnion.service - StarNion - Personal AI Assistant
     Active: active (running) since ...
   Main PID: 12345 (bash)
```

All three components (gateway :8080, agent :50051, web :3893) are managed by this single service.

---

## Step 4: Configure nginx reverse proxy

### Install nginx

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### Deploy the nginx config

```bash
# Copy the example config
sudo cp ~/.starnion/scripts/nginx-starnion.conf \
        /etc/nginx/conf.d/your-domain.com.conf

# Replace the domain name
sudo sed -i 's/lets\.ai\.kr/your-domain.com/g' \
        /etc/nginx/conf.d/your-domain.com.conf

sudo nginx -t
sudo systemctl reload nginx
```

### Key nginx config sections

```nginx
upstream starnion_web {
    server 127.0.0.1:3893;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSE (streaming chat) — disable buffering and gzip
    location = /api/chat {
        proxy_pass         http://starnion_web;
        proxy_buffering    off;
        proxy_read_timeout 300s;
        gzip               off;
    }

    # WebSocket
    location = /api/ws {
        proxy_pass         http://starnion_web;
        proxy_buffering    off;
        proxy_read_timeout 3600s;
    }

    # Static assets (long-lived cache)
    location /_next/static/ {
        proxy_pass http://starnion_web;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        proxy_pass http://starnion_web;
    }
}
```

---

## Step 5: SSL certificate with Let's Encrypt

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo certbot renew --dry-run
```

---

## Operations reference

### Service management

```bash
sudo systemctl start   starnion
sudo systemctl stop    starnion
sudo systemctl restart starnion
sudo systemctl status  starnion
```

### Log inspection

```bash
# Follow logs in real time
journalctl -u starnion -f

# Last 100 lines
journalctl -u starnion -n 100 --no-pager

# Today's logs only
journalctl -u starnion --since today --no-pager

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Update

```bash
starnion update
sudo systemctl restart starnion
```

---

## Troubleshooting

### Service fails to start

```bash
journalctl -u starnion -n 50 --no-pager
```

**Common causes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `status=203/EXEC` | SELinux blocking | `chcon -t bin_t <binary>` — see Step 2 |
| `node: not found` | PATH missing nvm | `bash -lc` should load it; check `.bashrc` |
| `.starnion/bin/starnion-gateway 없음` | HOME not set | Check `Environment=HOME=...` in service file |
| `Address already in use` | Port conflict | `lsof -i :<port>` to find the process |

### SELinux denial check

```bash
sudo ausearch -m avc -ts recent --no-pager
```

### 502 Bad Gateway from nginx

```bash
sudo systemctl status starnion
ss -tlnp | grep 3893
```

### Chat responses stop mid-stream

Ensure nginx config has:
```nginx
proxy_buffering off;
proxy_read_timeout 300s;
```

---

## Next steps

- [Configuration](configuration) — Environment variables and settings
- [Telegram channel](../channels/telegram) — Connect a Telegram bot
