# Agent Delegation Rules

Rules for when and how to delegate tasks to specialized agents.

## Command Type Rules

### Type A: Workflow Commands

Commands: `/jikime:0-project`, `/jikime:1-plan`, `/jikime:2-run`, `/jikime:3-sync`

- Agent delegation **recommended** for complex tasks requiring specialized expertise
- Direct tool usage **permitted** for simpler operations
- User interaction only through J.A.R.V.I.S./F.R.I.D.A.Y. using `AskUserQuestion`

### Type B: Utility Commands

**J.A.R.V.I.S. (Development)**: `/jikime:jarvis`, `/jikime:build-fix`, `/jikime:loop`, `/jikime:test`
**F.R.I.D.A.Y. (Migration)**: `/jikime:friday`, `/jikime:migrate-*`

- [HARD] **Agent delegation MANDATORY** for all implementation/fix tasks
- Direct tool access permitted **ONLY** for diagnostics (LSP, tests, linters)
- ALL code modifications **MUST** be delegated to specialized agents
- This rule applies even after auto compact or session recovery

**WHY**: Prevents quality degradation when session context is lost.

## Selection Decision Tree

```
1. Read-only codebase exploration?
   → Use the Explore subagent

2. External documentation or API research needed?
   → Use WebSearch, WebFetch, Context7 MCP tools

3. Domain expertise needed?
   → Use the specialist subagent (backend, frontend, debugger, etc.)

4. Workflow coordination needed?
   → Use the manager-[workflow] subagent

5. Complex multi-step tasks?
   → Use the manager-strategy subagent

6. Multi-domain parallel work needed?
   → Use Agent Teams mode (--team flag or auto-detect)
```

## Agent Teams Mode (Experimental)

When complexity exceeds thresholds, use Agent Teams for parallel execution.

### Activation Conditions

Auto-activates when ANY of:
- Domains >= 3 (frontend, backend, database, testing, etc.)
- Files >= 10 affected
- Complexity score >= 7

### Team vs Sub-Agent Decision

| Scenario | Mode | Reason |
|----------|------|--------|
| Simple single-domain task | Sub-agent | Lower overhead |
| Multi-file same domain | Sub-agent | No coordination needed |
| Cross-domain feature | Team | Parallel efficiency |
| Complex debugging | Team (investigation) | Competing hypotheses |
| UI-heavy with backend | Team (design_impl) | Designer + devs in parallel |

### Team Agents

| Agent | Phase | Permission | Owns |
|-------|-------|------------|------|
| team-researcher | plan | read-only | - |
| team-analyst | plan | read-only | - |
| team-architect | plan | read-only | - |
| team-backend-dev | run | acceptEdits | src/api/**, src/services/** |
| team-frontend-dev | run | acceptEdits | src/components/**, src/pages/** |
| team-designer | run | acceptEdits | design/**, src/styles/tokens/** |
| team-tester | run | acceptEdits | tests/**, **/*.test.* |
| team-quality | run | read-only | - |

### Communication Rules

- **J.A.R.V.I.S./F.R.I.D.A.Y.** bridges user ↔ team communication
- **Teammates** use SendMessage for inter-teammate coordination
- **Shared TaskList** for self-coordinated work distribution
- **AskUserQuestion** only from orchestrator (teammates cannot ask users)

## Context Optimization

When delegating to agents:

- Pass **minimal context** (spec_id, max 3 bullet points, architecture summary under 200 chars)
- **Exclude** background information, reasoning, and non-essential details
- Each agent gets independent 200K token session

## Execution Patterns

### Sequential Chaining

```
debugger → refactorer → test-guide
(identify)  (implement)  (validate)
```

### Parallel Execution

```
backend ─┬─→ Results
frontend ─┘  (simultaneous)
```

## Checklist

- [ ] Complex implementation delegated to appropriate agent
- [ ] Type B commands use agent delegation for code modifications
- [ ] Minimal context passed to agents
- [ ] Correct agent selected for task domain

### File Ownership Rules

Prevent write conflicts during parallel execution:

```yaml
# Exclusive ownership (only this teammate can write)
team-backend-dev:
  - src/api/**
  - src/services/**
  - src/repositories/**
  - src/models/**

team-frontend-dev:
  - src/components/**
  - src/pages/**
  - src/app/**
  - src/hooks/**

team-tester:
  - tests/**
  - **/*.test.*
  - **/*.spec.*

# Shared (coordinate via SendMessage)
shared:
  - src/types/**
  - src/utils/**
```

### Fallback Behavior

If team mode fails:
1. Log warning
2. Fall back to sequential sub-agent mode
3. Continue from last completed task
4. No data loss

---

Version: 2.0.0
Source: Extracted from CLAUDE.md Section 3, 4, 15
