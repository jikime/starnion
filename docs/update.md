---
layout: default
title: Update
nav_order: 5
---

# Update
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Update the CLI

### Automatic update

The simplest way — checks GitHub Releases, downloads and replaces the binary:

```bash
starnion update
```

Sample output:

```
  ─────────────────────────────────────
  [0/0]  UPDATE                      ✦
  ─────────────────────────────────────
  ·  최신 버전 확인 중...
  ·  현재 버전: v1.0.0
  ·  최신 버전: v1.1.0
  ✓  StarNion v1.1.0 설치 완료
```

### Check version only

```bash
starnion update --check
```

Prints whether a new version is available without installing anything.

### Manual update

Re-run the installer — it handles upgrades automatically:

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### Update to a specific version

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

---

## Update Docker Images

When a new version is released, rebuild your Docker images:

```bash
starnion docker down
starnion docker up --build
```

Or with Compose directly:

```bash
cd docker
docker compose build
docker compose up -d
```

{: .warning }
> **Data safety**: `starnion docker down` without `--volumes` preserves your PostgreSQL and MinIO data. Only `down --volumes` deletes data.

---

## Update Configuration

If a new release changes required environment variables:

```bash
# Regenerate docker/.env from your saved config
starnion docker setup --env-only

# Re-run the full setup wizard
starnion setup
```

---

## Version Information

```bash
starnion version     # current CLI version
starnion doctor      # system health + dependency check
```

---

## Changelog

All release notes are available at:

[github.com/jikime/starnion/releases](https://github.com/jikime/starnion/releases)

---

## Downgrade

To roll back to a previous version:

```bash
STARNION_VERSION=1.0.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```
