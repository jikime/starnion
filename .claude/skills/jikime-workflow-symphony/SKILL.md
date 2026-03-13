---
name: jikime-workflow-symphony
description: >
  Autonomous agent orchestration service for Claude Code.
  Use when setting up jikime serve, configuring WORKFLOW.md,
  connecting to GitHub Issues, or debugging agent orchestration.
  Provides setup guide, config reference, and troubleshooting.
license: Apache-2.0
compatibility: Designed for Claude Code
allowed-tools: Read Grep Glob Bash
user-invocable: false
metadata:
  version: "1.0.0"
  category: "workflow"
  status: "active"
  updated: "2026-03-09"
  tags: "workflow, orchestration, automation, github-issues, autonomous, daemon, serve"

progressive_disclosure:
  enabled: true
  level1_tokens: 100
  level2_tokens: 5000

triggers:
  keywords: ["jikime serve", "WORKFLOW.md", "autonomous", "orchestration", "issue tracker", "agent orchestration", "headless", "daemon", "dispatch", "worktree isolation"]
  agents:
    - "manager-strategy"
    - "manager-spec"
  phases:
    - "plan"
---

# JikiME Workflow Symphony

`jikime serve` is an autonomous agent orchestration service inspired by OpenAI's Symphony.
It polls GitHub Issues, creates isolated git worktrees per issue, and runs Claude Code agents automatically.

## Quick Start

```bash
# 1. Copy example workflow
cp $(jikime init --print-templates)/WORKFLOW.md.example ./WORKFLOW.md

# 2. Configure (edit tracker.api_key, project_slug)
vim WORKFLOW.md

# 3. Start the service
export GITHUB_TOKEN=ghp_xxx
jikime serve

# 4. With HTTP API
jikime serve --port 8080
# Dashboard: http://127.0.0.1:8080
# State API:  http://127.0.0.1:8080/api/v1/state
```

## WORKFLOW.md Key Config

```yaml
tracker:
  kind: github
  api_key: $GITHUB_TOKEN          # env var via $VAR syntax
  project_slug: owner/repo        # GitHub "owner/repo"
  active_states: [todo, in-progress]

agent:
  max_concurrent_agents: 3        # parallel Claude sessions
  max_turns: 10                   # turns per session

claude:
  command: claude                 # claude CLI
  turn_timeout_ms: 3600000        # 1 hour per turn
```

## GitHub Issues → State Mapping

| GitHub Label    | active_state value | Effect              |
|-----------------|-------------------|---------------------|
| `todo`          | `todo`            | Dispatch when ready |
| `in-progress`   | `in-progress`     | Dispatch immediately|
| (closed issue)  | `Done`            | Stop + cleanup      |

Label naming: use lowercase, hyphenated labels matching `active_states` config.

## Orchestration Flow

```
Poll GitHub Issues (every 30s)
    ↓
Filter: active labels + not running/claimed
    ↓
Sort: priority asc → created_at oldest
    ↓
Dispatch (up to max_concurrent_agents)
    ↓ per issue
Create/reuse git worktree
    ↓
Run before_run hook
    ↓
claude --no-interactive -p "PROMPT"
    ↓
Multi-turn: re-check issue state after each turn
    ↓
after_run hook + retry (exponential backoff on failure)
```

## Retry Backoff

- Normal completion → 1 second continuation check
- Failure → `min(10s × 2^(attempt-1), max_retry_backoff_ms)`
- Default max: 5 minutes

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "missing tracker.api_key" | $GITHUB_TOKEN not set | `export GITHUB_TOKEN=ghp_xxx` |
| "project_slug must be owner/repo" | Wrong slug format | Use `owner/repo`, not `https://...` |
| No issues dispatched | No matching labels | Add `todo` label to issues |
| Claude not found | PATH issue | `which claude` to verify |
| Stall detected | Claude hung | Reduce `stall_timeout_ms` |

---

Version: 1.0.0
Last Updated: 2026-03-09
Source: JikiME-ADK serve command (Symphony-inspired)
