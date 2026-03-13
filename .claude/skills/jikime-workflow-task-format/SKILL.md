---
name: jikime-workflow-task-format
description: Structured task format with Do/Files/Done-when/Verify/Commit fields and quality checkpoints for systematic task tracking
version: 1.0.0
tags: ["workflow", "task", "format", "checkpoint", "quality"]
triggers:
  keywords: ["task format", "structured task", "task breakdown", "checkpoint", "verify task"]
  phases: ["plan", "run"]
  agents: ["manager-ddd", "manager-spec", "planner"]
  languages: []
progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~2500
user-invocable: false
context: fork
agent: planner
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - TodoWrite
---

# Structured Task Format

Systematic task decomposition with 5-field structure and quality checkpoints.

## Overview

Every implementation task is decomposed into structured units with clear acceptance criteria.
This format ensures nothing is forgotten and quality is verified at regular intervals.

## Task Structure (5 Fields)

Each task follows this mandatory format:

```
### Task N: [Title]

**Do**: What to implement (specific action)
**Files**: Which files to create or modify
**Done when**: Measurable acceptance criteria
**Verify**: How to verify completion (test command, manual check)
**Commit**: Commit message when task is complete
```

### Field Rules

| Field | Required | Description |
|-------|----------|-------------|
| **Do** | Yes | Single, actionable implementation step |
| **Files** | Yes | Explicit file paths (create/modify/delete) |
| **Done when** | Yes | Measurable criteria (test passes, build succeeds, output matches) |
| **Verify** | Yes | Concrete verification command or check |
| **Commit** | Yes | Conventional commit message (feat/fix/refactor/test/docs) |

### Example Task

```
### Task 1: Create user authentication API

**Do**: Implement POST /api/auth/login endpoint with JWT token generation
**Files**: src/api/auth/login.ts (create), src/types/auth.ts (create)
**Done when**: POST /api/auth/login returns 200 with valid JWT for correct credentials, 401 for invalid
**Verify**: `npm test -- --grep "auth login"` passes
**Commit**: feat(auth): add login endpoint with JWT generation
```

## Quality Checkpoints ([VERIFY])

Insert a `[VERIFY]` checkpoint task after every 2-3 implementation tasks.

### Checkpoint Format

```
### Task N: [VERIFY] Quality Checkpoint

**Do**: Run full verification suite
**Files**: (none - verification only)
**Done when**: All checks pass with zero errors
**Verify**:
  - `npm run build` (zero errors)
  - `npm test` (all passing)
  - `npm run lint` (zero warnings)
  - Manual: feature works as expected
**Commit**: (no commit - checkpoint only)
```

### Checkpoint Rules

1. **Frequency**: Insert [VERIFY] after every 2-3 tasks
2. **Blocking**: Do NOT proceed to next task if checkpoint fails
3. **Fix First**: If checkpoint fails, create fix tasks before continuing
4. **No Skip**: [VERIFY] tasks cannot be skipped or deferred

### Checkpoint Insertion Pattern

```
Task 1: Implementation
Task 2: Implementation
Task 3: Implementation
Task 4: [VERIFY] Quality Checkpoint   <-- after 3 tasks
Task 5: Implementation
Task 6: Implementation
Task 7: [VERIFY] Quality Checkpoint   <-- after 2 tasks
Task 8: Implementation
...
Task N: [VERIFY] Final Checkpoint     <-- always at the end
```

## TodoWrite Integration

All tasks MUST be tracked using TodoWrite:

```
1. Task discovered → TodoWrite: add with "pending" status
2. Task started → TodoWrite: change to "in_progress"
3. Task completed → TodoWrite: change to "completed"
4. [VERIFY] failed → TodoWrite: add fix tasks with "pending"
```

### TodoWrite Format

```
[pending] Task 1: Create user authentication API
[in_progress] Task 2: Add password hashing
[completed] Task 3: Create login form
[pending] Task 4: [VERIFY] Quality Checkpoint
```

## Task Sizing Guidelines

| Size | Description | Example |
|------|-------------|---------|
| **XS** | Single function/method | Add validation helper |
| **S** | Single file change | Create API endpoint |
| **M** | 2-3 file changes | Feature with tests |
| **L** | 4+ file changes | **Split into smaller tasks** |

**Rule**: If a task touches more than 3 files, split it into smaller tasks.

## DDD Task Format

When working with existing code (DDD workflow), tasks follow ANALYZE-PRESERVE-IMPROVE:

```
### Task N: [ANALYZE] Understand current auth flow

**Do**: Read and document current authentication implementation
**Files**: src/auth/ (read only)
**Done when**: Current behavior documented with edge cases identified
**Verify**: Documentation matches actual code behavior
**Commit**: (no commit - analysis only)

### Task N+1: [PRESERVE] Add characterization tests

**Do**: Write tests that capture current behavior exactly
**Files**: tests/auth.test.ts (create)
**Done when**: Tests pass against current implementation
**Verify**: `npm test -- --grep "auth characterization"` all pass
**Commit**: test(auth): add characterization tests for existing auth flow

### Task N+2: [IMPROVE] Refactor to JWT-based auth

**Do**: Replace session-based auth with JWT tokens
**Files**: src/auth/login.ts (modify), src/auth/middleware.ts (modify)
**Done when**: All characterization tests still pass with new implementation
**Verify**: `npm test` all pass, no behavior change
**Commit**: refactor(auth): migrate from session to JWT authentication
```

## Integration with Other Skills

| Skill | Integration Point |
|-------|------------------|
| `jikime-workflow-poc` | POC phases generate tasks in this format |
| `jikime-workflow-tdd` | RED-GREEN-REFACTOR maps to task sequences |
| `jikime-workflow-ddd` | ANALYZE-PRESERVE-IMPROVE maps to task prefixes |
| `jikime-workflow-loop` | Loop iterations track progress via TodoWrite |

---

Version: 1.0.0
Last Updated: 2026-02-27
Source: Adapted from smart-ralph structured task format
