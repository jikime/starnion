---
description: "POC-First development - Phase-based greenfield workflow (Make It Work → Refactor → Test → Quality → PR)"
argument-hint: "[feature description] [--phase N] [--skip-pr]"
context: dev
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
---

## Pre-execution Context

!git status --porcelain
!git diff --name-only HEAD

---

# /jikime:poc - POC-First Development Workflow

## Core Principle: Make It Work First, Then Improve

For greenfield features, ship a working prototype quickly, then systematically refine.

```
Phase 1: Make It Work (50-60%)
  ↓
Phase 2: Refactor (15-20%)
  ↓
Phase 3: Testing (15-20%)
  ↓
Phase 4: Quality Gates (10-15%)
  ↓
Phase 5: PR Lifecycle
  ↓
<jikime>DONE</jikime>
```

## Command Purpose

Orchestrate POC-First development through 5 structured phases:

1. **Make It Work**: Core functionality end-to-end
2. **Refactor**: Clean up code structure
3. **Testing**: Add comprehensive tests
4. **Quality Gates**: Production-ready validation
5. **PR Lifecycle**: Create and merge PR

Arguments: $ARGUMENTS

## Quick Start

```bash
# Full POC workflow
/jikime:poc "User authentication with JWT"

# Start from specific phase
/jikime:poc "Auth system" --phase 3

# Skip PR phase
/jikime:poc "Auth system" --skip-pr
```

## Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--phase N` | Start from phase N (1-5) | 1 |
| `--skip-pr` | Skip Phase 5 (PR lifecycle) | false |

---

## EXECUTION DIRECTIVE

1. Parse $ARGUMENTS (extract feature description, --phase, --skip-pr flags)

2. Load skill: Skill("jikime-workflow-poc")

3. Load task format: Skill("jikime-workflow-task-format")

4. IF no feature description provided: Use AskUserQuestion to ask "What feature do you want to build?"

5. Determine starting phase (default: 1, or --phase N)

6. [HARD] Intent Classification Check:
   - Analyze if this is truly greenfield (new code, no existing behavior)
   - If existing code modification detected: Suggest DDD workflow instead
   - If test-first approach preferred: Suggest TDD workflow instead

7. Create feature branch:
   ```bash
   git checkout -b feature/[feature-slug]
   ```

8. Generate task list using structured task format (Do/Files/Done when/Verify/Commit)

9. [HARD] Track all tasks via TodoWrite

10. PHASE LOOP (from starting phase to 5):

    Phase 1 - Make It Work:
    - Scaffold project structure
    - Implement core happy path
    - Wire up end-to-end
    - [VERIFY] Feature works manually
    - Ask user to confirm "it works"

    Phase 2 - Refactor:
    - Extract constants and configuration
    - Split large modules
    - Apply naming conventions and types
    - Remove debug statements
    - [VERIFY] Feature still works after refactoring

    Phase 3 - Testing:
    - Add unit tests for business logic
    - Add integration tests
    - Add edge case and error tests
    - [VERIFY] All tests pass, coverage >= 80%

    Phase 4 - Quality Gates:
    - Fix all lint and type errors
    - Security audit
    - Add documentation
    - [VERIFY] All quality gates pass

    Phase 5 - PR Lifecycle (unless --skip-pr):
    - Load Skill("jikime-workflow-pr-lifecycle")
    - Create PR with structured description
    - Monitor CI
    - Address reviews
    - Merge

11. [HARD] Agent Delegation:
    - ALL implementation tasks MUST be delegated to specialized agents
    - Phase 1-2: Use backend/frontend subagent
    - Phase 3: Use test-guide subagent
    - Phase 4: Use security-auditor, refactorer subagents
    - Phase 5: Use manager-git subagent

12. Report final summary with evidence

13. Output completion marker: <jikime>DONE</jikime>

Execute NOW — start with intent classification, then proceed phase by phase.

---

Version: 1.0.0
Last Updated: 2026-02-27
Core: POC-First Development Workflow
