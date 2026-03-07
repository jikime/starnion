---
layout: default
title: Installation
nav_order: 2
---

# Installation
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| OS | macOS 13+ / Linux | Windows via WSL2 |
| Architecture | amd64 or arm64 | Apple Silicon supported |
| PostgreSQL | 16+ with pgvector | Required for database |
| MinIO | Latest | Required for file storage |

For running individual services:

| Service | Requirement |
|---------|------------|
| Gateway (native) | Go 1.22+ |
| Agent (native) | Python 3.13+, uv |
| UI (native) | Node.js 22+, pnpm |
| All (Docker) | Docker Engine 24+, Compose v2 |

---

## Quick Install

The fastest way to install StarNion CLI:

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

The installer automatically:
1. Detects your OS and architecture
2. Downloads the latest binary from [GitHub Releases](https://github.com/jikime/starnion/releases)
3. Verifies the SHA-256 checksum
4. Installs to `/usr/local/bin` (or `~/.local/bin` if no write permission)

### Install a specific version

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### Install to a custom directory

```bash
STARNION_DIR=~/.local/bin curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### Non-interactive install (CI/scripts)

```bash
NO_PROMPT=1 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

---

## Manual Install

If you prefer to install manually:

### 1. Download the binary

Go to [Releases](https://github.com/jikime/starnion/releases/latest) and download the archive for your platform:

| Platform | File |
|----------|------|
| macOS Apple Silicon | `starnion_darwin_arm64.tar.gz` |
| macOS Intel | `starnion_darwin_amd64.tar.gz` |
| Linux x86-64 | `starnion_linux_amd64.tar.gz` |
| Linux ARM64 | `starnion_linux_arm64.tar.gz` |

### 2. Verify checksum

```bash
# Download checksums
curl -fsSL https://github.com/jikime/starnion/releases/latest/download/checksums.txt -o checksums.txt

# Verify (macOS)
shasum -a 256 --check --ignore-missing checksums.txt

# Verify (Linux)
sha256sum --check --ignore-missing checksums.txt
```

### 3. Extract and install

```bash
tar -xzf starnion_darwin_arm64.tar.gz
chmod +x starnion
sudo mv starnion /usr/local/bin/
```

---

## Build from Source

Requires Go 1.22+ and `make`.

```bash
git clone https://github.com/jikime/starnion.git
cd starnion/gateway
make starnion
# Binary is output to ../starnion
sudo mv ../starnion /usr/local/bin/
```

---

## Verify Installation

```bash
starnion version
# ★ StarNion v1.0.0
```

---

## Uninstall

```bash
rm $(which starnion)
rm -rf ~/.config/starnion   # optional: remove config
```

---

## Next Steps

- [Getting Started](getting-started) — run `starnion setup` and launch services
- [Deployment](deploy) — Docker and production deployment options
