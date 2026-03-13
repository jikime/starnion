---
description: "Generate WORKFLOW.md for jikime serve Harness Engineering automation"
argument-hint: "[--basic] [--port N] [--label LABEL] [--output PATH]"
allowed-tools: Bash, Read, Write
type: workflow
---

# /jikime:harness — Harness Engineering Setup

## Core Principle: Zero-Config Workflow Generation

Analyze the current project and generate a tailored `WORKFLOW.md` for autonomous
issue-to-PR automation via `jikime serve`.

```
START: Analyze project
  ↓
DETECT: git remote → repo slug
DETECT: .claude/ → JiKiME-ADK mode or Basic mode
DETECT: tech stack → specialist agent selection
  ↓
GENERATE: WORKFLOW.md (optimized for this project)
  ↓
GUIDE: GitHub label creation commands
GUIDE: jikime serve startup command
  ↓
<jikime>DONE</jikime>
```

## Arguments: $ARGUMENTS

| Flag | Default | Description |
|------|---------|-------------|
| `--basic` | off | Force basic mode (ignore .claude/) |
| `--port N` | 8888 | HTTP status API port (0 = disabled) |
| `--label LABEL` | jikime-todo | Active label name |
| `--output PATH` | WORKFLOW.md | Output file path |

## Execution Steps

### Step 1: Detect Project Context

Run the following in parallel:

```bash
# Detect git remote
git remote get-url origin 2>/dev/null || echo ""

# Detect JiKiME-ADK installation
ls .claude/ 2>/dev/null && echo "jikime-adk" || echo "basic"

# Detect tech stack
ls package.json go.mod requirements.txt Cargo.toml pom.xml 2>/dev/null | head -5

# Check existing WORKFLOW.md
ls WORKFLOW.md 2>/dev/null && echo "exists" || echo "new"
```

Parse git remote URL to extract `owner/repo` slug:
- SSH format: `git@github.com:owner/repo.git` → `owner/repo`
- HTTPS format: `https://github.com/owner/repo.git` → `owner/repo`

### Step 2: Determine Mode and Agent

| Condition | Mode | Prompt Template |
|-----------|------|-----------------|
| `.claude/` exists AND `--basic` not set | **JiKiME-ADK** | Uses `jarvis` sub-agent |
| No `.claude/` OR `--basic` flag | **Basic** | Standard git/PR workflow |

**Tech stack → specialist agent mapping** (JiKiME-ADK mode only):

| Detected file | Specialist agent hint |
|---------------|-----------------------|
| `package.json` with Next.js | `specialist-nextjs` |
| `package.json` with React | `frontend` + `backend` |
| `go.mod` | `specialist-go` |
| `requirements.txt` / `pyproject.toml` | `specialist-python` |
| `pom.xml` | `specialist-java` |
| Generic | `jarvis` (auto-selects) |

### Step 3: Generate WORKFLOW.md

Parse arguments from `$ARGUMENTS`:
- `--basic`: force basic mode
- `--port N`: extract port number
- `--label LABEL`: extract label name
- `--output PATH`: extract output path

Generate WORKFLOW.md with these values (fill in detected/default values):

**YAML Frontmatter** (both modes):
```yaml
---
tracker:
  kind: github
  # api_key: $GITHUB_TOKEN   # omit → uses gh auth token automatically
  project_slug: <detected-slug>
  active_states:
    - <label>
  terminal_states:
    - jikime-done
    - Done

polling:
  interval_ms: 15000

workspace:
  root: /tmp/jikime-<repo-name>

hooks:
  after_create: |
    git clone https://github.com/<slug>.git .
    echo "[after_create] cloned repo to $(pwd)"

  before_run: |
    git fetch origin
    git checkout main
    git reset --hard origin/main

  after_run: |
    echo "[after_run] done"
    if [ -d "<local-project-path>/.git" ]; then
      cd "<local-project-path>" && git pull --ff-only 2>&1 \
        && echo "[after_run] local repo synced at $(git rev-parse --short HEAD)" \
        || echo "[after_run] git pull skipped (local changes or diverged branch)"
    fi

  timeout_ms: 60000

agent:
  max_concurrent_agents: 1
  max_turns: <5 for basic, 10 for jikime-adk>
  max_retry_backoff_ms: 300000

claude:
  command: claude
  turn_timeout_ms: 3600000
  stall_timeout_ms: <180000 for basic, 300000 for jikime-adk>

server:
  port: <port>
---
```

**Prompt Template — Basic Mode**:
```
You are an autonomous software engineer working on a GitHub issue.

Repository: https://github.com/<slug>

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Instructions

1. Read the issue carefully and implement what is requested.
2. Create a feature branch: `git checkout -b fix/issue-{{ issue.id }}`
3. Make your changes.
4. Commit: `git add -A && git commit -m "fix: {{ issue.identifier }} - {{ issue.title }}"`
5. Push: `git push origin fix/issue-{{ issue.id }}`
6. Create PR: `gh pr create --title "fix: {{ issue.title }}" --body "Closes #{{ issue.id }}" --base main --head fix/issue-{{ issue.id }}`
7. Merge: `gh pr merge --squash --delete-branch --admin`
```

**Prompt Template — JiKiME-ADK Mode**:
```
You are an autonomous software engineer working on a GitHub issue.
This repository has JiKiME-ADK installed (.claude/ directory is present).
CLAUDE.md is automatically loaded — the full J.A.R.V.I.S. agent stack is available.

Repository: https://github.com/<slug>

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Instructions

Use the `jarvis` sub-agent (or `<detected-specialist>` if appropriate) to implement this issue.

Invoke with this prompt:
"Implement GitHub issue on branch fix/issue-{{ issue.id }}:
Title: {{ issue.title }}
{{ issue.description }}

After implementation:
  gh pr create --title 'fix: {{ issue.title }}' --body 'Closes #{{ issue.id }}' --base main --head fix/issue-{{ issue.id }}
  gh pr merge --squash --delete-branch --admin"
```

### Step 4: Write File and Guide

Write the generated content to the output file (default: `WORKFLOW.md`).

If `WORKFLOW.md` already exists, confirm before overwriting:
```
WORKFLOW.md already exists. Overwrite? (y/N)
```

After writing, output the next steps:

```
✓ WORKFLOW.md created

Configuration:
  Repo:    <slug>
  Label:   <label>
  Mode:    <Basic | JiKiME-ADK>
  Port:    <port>

Next steps:
  1. Create GitHub labels:
     gh label create "<label>" --repo <slug> --description "Ready for AI agent" --color "0e8a16"
     gh label create "jikime-done" --repo <slug> --description "Completed by AI" --color "6f42c1"

  2. Start the service:
     jikime serve WORKFLOW.md
```

Output completion marker: `<jikime>DONE</jikime>`
