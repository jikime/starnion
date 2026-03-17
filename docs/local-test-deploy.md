---
layout: default
title: Local Test & Deploy
nav_order: 6
---

# Local Test & Deploy
{: .no_toc }

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## Overview

This guide covers the complete workflow from local testing through first production deployment.

```
Local Test → GitHub Setup → Pages Activation → First Release → End-to-End Verification
```

---

## Phase 1: Local Testing

### Build the CLI

```bash
cd gateway
make starnion        # binary output: ../starnion (project root)
cd ..
./starnion version   # outputs "dev"
```

### GoReleaser Dry Run

Test the release build without publishing anything:

```bash
cd gateway
make release-dry
```

This creates binaries in `dist/` for all target platforms (darwin/linux × amd64/arm64). Verify they exist before proceeding.

### Docker Stack Test

```bash
# Generate docker/.env
cd gateway
make docker-setup

# Start the full stack
make docker-up

# Verify all services are healthy
cd ..
./starnion doctor

# Tear down
cd gateway
make docker-down
```

### install.sh Local Test

```bash
STARNION_VERSION=1.0.0 bash docs/install.sh
```

---

## Phase 2: GitHub Repository Setup

### Push Code

```bash
git add -A
git commit -m "feat: complete distribution system"
git push origin main
```

### Configure GitHub Settings

Two settings are required before the workflows can run correctly.

**GitHub Pages source:**

1. Go to **Settings → Pages**
2. Set Source to **GitHub Actions**

{: .warning }
> Do NOT use "Deploy from branch" — it conflicts with the `pages.yml` workflow.

**Workflow permissions:**

1. Go to **Settings → Actions → General**
2. Under "Workflow permissions", select **Read and write permissions**
3. Click Save

---

## Phase 3: GitHub Pages Activation

Pushing to `main` automatically triggers the `pages.yml` workflow.

Check the **Actions** tab and wait for the `GitHub Pages` workflow to complete (green checkmark).

Then verify the site and install script are accessible:

```bash
# Documentation site
curl -I https://jikime.github.io/starnion/

# Install script
curl -fsSL https://jikime.github.io/starnion/install.sh | head -5
```

---

## Phase 4: First Release

### Tag and Publish

```bash
cd gateway
make release VERSION=1.0.0
```

This command:
1. Creates and pushes `git tag v1.0.0`
2. Triggers the `release.yml` workflow which:
   - Builds 4 platform binaries via GoReleaser
   - Creates a GitHub Release with the binaries attached
   - Auto-updates `STARNION_VERSION` in `docs/install.sh` and commits back to `main`

Monitor progress in the **Actions** tab. The workflow takes approximately 3–5 minutes.

### Verify the Release

Once the workflow completes:

- Check [github.com/jikime/starnion/releases](https://github.com/jikime/starnion/releases) for the release and attached binaries
- Confirm `docs/install.sh` has `STARNION_VERSION="1.0.0"` (committed by the workflow)

---

## Phase 5: End-to-End Verification

### Install via Script

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
starnion version   # should output "1.0.0"
```

### Check for Updates

```bash
starnion update --check
```

### Full Update Flow (when a newer version exists)

```bash
starnion update
```

`starnion update` performs the following automatically:
1. Downloads the latest release tarball (binary + UI + agent + scripts)
2. Installs the new `starnion` and `starnion-gateway` binaries
3. Extracts and copies the Next.js standalone UI to `~/.starnion/ui/`
4. On Linux: copies updated systemd service files and patches the node binary path

---

## Checklist

```
Phase 1: Local
  [ ] make starnion — CLI builds cleanly
  [ ] make release-dry — GoReleaser dry run succeeds
  [ ] make docker-up — all services healthy
  [ ] bash docs/install.sh — local install script works

Phase 2: GitHub Setup
  [ ] git push origin main
  [ ] Settings → Pages → Source: GitHub Actions
  [ ] Settings → Actions → Workflow permissions: Read and write

Phase 3: Pages
  [ ] "GitHub Pages" Actions workflow succeeds
  [ ] https://jikime.github.io/starnion/ is accessible
  [ ] install.sh is reachable via curl

Phase 4: Release
  [ ] make release VERSION=1.0.0
  [ ] "Release" Actions workflow succeeds
  [ ] GitHub Releases page shows v1.0.0 with binaries
  [ ] docs/install.sh updated to STARNION_VERSION="1.0.0"

Phase 5: Verification
  [ ] curl install.sh | bash — installs successfully
  [ ] starnion version — outputs "1.0.0"
  [ ] starnion update --check — responds correctly
```

---

## Subsequent Releases

For all future releases, only Phase 4 and Phase 5 are needed:

```bash
cd gateway
make release VERSION=x.y.z
# wait for Actions to complete
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
starnion version
```
