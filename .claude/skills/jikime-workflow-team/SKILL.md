---
name: jikime-workflow-team
description: >
  Agent Teams workflow orchestration for JikiME-ADK. Provides team-based
  parallel execution patterns for plan, run, and debug phases. Includes
  TeamCreate, SendMessage, TaskList coordination, and graceful fallback.
  Use when Agent Teams mode is enabled and complex multi-domain work is needed.
license: Apache-2.0
compatibility: Designed for Claude Code v2.1.32+ with AGENT_TEAMS experimental flag
user-invocable: false
metadata:
  version: "1.0.0"
  category: "workflow"
  status: "experimental"
  updated: "2026-02-14"
  modularized: "true"
  tags: "agent-teams, parallel, orchestration, team-plan, team-run"
  related-skills: "jikime-foundation-core, jikime-workflow-spec, jikime-workflow-ddd"

# MoAI Extension: Progressive Disclosure
progressive_disclosure:
  enabled: true
  level1_tokens: 150
  level2_tokens: 8000

# MoAI Extension: Triggers
triggers:
  keywords: ["team mode", "agent teams", "parallel team", "team plan", "team run"]
  agents: ["manager-spec", "manager-ddd", "manager-strategy"]
  phases: ["plan", "run"]
---

# Agent Teams Workflow Orchestration

Provides complete workflow patterns for team-based parallel execution in JikiME-ADK.

## Prerequisites

Both conditions must be met for team mode:
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in environment or settings.json env
- `workflow.team.enabled: true` in `.jikime/config/workflow.yaml`

## Workflow Files

| File | Phase | Purpose |
|------|-------|---------|
| `team-plan.md` | Plan | Parallel SPEC research and design |
| `team-run.md` | Run | Parallel implementation with file ownership |
| `team-debug.md` | Debug | Competing hypothesis investigation |

## Quick Reference

### Team APIs

| API | Purpose |
|-----|---------|
| `TeamCreate(team_name)` | Initialize team structure |
| `Task(subagent_type, team_name, name, prompt)` | Spawn teammate |
| `SendMessage(recipient, type, content)` | Inter-teammate communication |
| `TaskCreate/Update/List/Get` | Shared task coordination |
| `TeamDelete` | Release team resources |

### Mode Selection

- `--team`: Force Agent Teams mode
- `--solo`: Force sub-agent mode
- No flag: Auto-select based on complexity thresholds

### Fallback Behavior

If team mode fails or prerequisites not met:
1. Log warning about team mode unavailability
2. Graceful fallback to sub-agent mode
3. Continue from last completed task
4. No data loss or state corruption

## Bundled Files

- `team-plan.md` - Plan phase team orchestration
- `team-run.md` - Run phase team orchestration
- `team-debug.md` - Debug phase team orchestration
