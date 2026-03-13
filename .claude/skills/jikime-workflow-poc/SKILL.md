---
name: jikime-workflow-poc
description: POC-First development workflow for greenfield features. Make-It-Work first, then refactor, test, and polish in structured phases.
version: 1.0.0
tags: ["workflow", "poc", "greenfield", "rapid-prototype", "phase-based"]
triggers:
  keywords: ["POC", "proof of concept", "prototype", "greenfield", "new feature", "from scratch", "make it work"]
  phases: ["plan", "run"]
  agents: ["manager-ddd", "manager-strategy", "planner"]
  languages: []
progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~3000
user-invocable: true
context: fork
agent: manager-strategy
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - TodoWrite
  - Task
  - AskUserQuestion
---

# POC-First Development Workflow

Phase-based approach: Make It Work first, then refine through structured phases.

## Overview

For greenfield features (new code with no existing behavior to preserve),
POC-First is more effective than TDD or DDD. Ship a working prototype quickly,
then systematically improve quality.

## Intent Classification

Before starting, determine the right workflow:

```
Is this NEW code (no existing behavior)?
  ├── YES → POC-First Workflow (this skill)
  └── NO  → Is existing code being modified?
        ├── YES → DDD Workflow (jikime-workflow-ddd)
        └── Regression test needed? → TDD Workflow (jikime-workflow-tdd)
```

### Decision Matrix

| Scenario | Workflow | Reason |
|----------|----------|--------|
| Brand new feature | **POC-First** | No behavior to preserve |
| New API endpoint | **POC-First** | Greenfield implementation |
| New UI component | **POC-First** | Build first, test after |
| Refactoring existing code | **DDD** | Must preserve behavior |
| Bug fix | **TDD** | Regression test first |
| Legacy migration | **DDD** | Characterize before changing |
| Adding tests to existing code | **TDD** | Test-first approach |

## Phase Structure

### Phase 1: Make It Work (50-60% of effort)

**Goal**: Get the core functionality working end-to-end.

**Rules**:
- Focus ONLY on making it work
- Hardcoding is acceptable
- Skip edge cases
- Minimal error handling
- No premature optimization
- Use console.log for debugging freely

**Task Pattern**:
```
Task 1: Scaffold project structure
Task 2: Implement core happy path
Task 3: Wire up end-to-end
Task 4: [VERIFY] Core feature works manually
```

**Done when**: The feature works for the happy path. Demo-able to stakeholders.

**Phase Transition**: User confirms "it works" or automated smoke test passes.

### Phase 2: Refactor (15-20% of effort)

**Goal**: Clean up code without changing behavior.

**Rules**:
- Extract hardcoded values to constants/config
- Split large files (>400 lines)
- Apply naming conventions
- Remove console.log statements
- Add proper TypeScript types (if applicable)
- DO NOT add new functionality

**Task Pattern**:
```
Task 5: Extract constants and configuration
Task 6: Split large modules by responsibility
Task 7: Apply naming conventions and types
Task 8: [VERIFY] Feature still works after refactoring
```

**Done when**: Code is clean, well-organized, and still works.

**Phase Transition**: Build passes, feature still works manually.

### Phase 3: Testing (15-20% of effort)

**Goal**: Add comprehensive test coverage.

**Rules**:
- Unit tests for business logic (80%+ coverage)
- Integration tests for API endpoints
- E2E tests for critical user flows
- Edge case coverage
- Error scenario tests

**Task Pattern**:
```
Task 9: Add unit tests for core business logic
Task 10: Add integration tests for API
Task 11: Add edge case and error tests
Task 12: [VERIFY] All tests pass, coverage >= 80%
```

**Done when**: Test suite passes, coverage meets threshold (80%+).

**Phase Transition**: `npm test` passes, coverage report shows >= 80%.

### Phase 4: Quality Gates (10-15% of effort)

**Goal**: Production-ready quality.

**Rules**:
- Zero linting errors
- Zero type errors
- Security audit clean
- Performance acceptable
- Documentation complete
- Accessibility compliant (if UI)

**Task Pattern**:
```
Task 13: Fix all lint and type errors
Task 14: Security audit and fix
Task 15: Add documentation (JSDoc, README)
Task 16: [VERIFY] Final quality gate
```

**Quality Gate Checklist**:
- [ ] `npm run build` — zero errors
- [ ] `npm test` — all passing, coverage >= 80%
- [ ] `npm run lint` — zero errors/warnings
- [ ] `npm run type-check` — zero errors
- [ ] Security: No critical/high vulnerabilities
- [ ] Docs: Key functions documented

**Done when**: All quality gates pass.

### Phase 5: PR Lifecycle

**Goal**: Create PR and get it merged.

**Rules**:
- Use `Skill("jikime-workflow-pr-lifecycle")` for automation
- Or create PR manually with comprehensive description
- CI must pass
- Code review addressed

**Task Pattern**:
```
Task 17: Create PR with description
Task 18: Address CI failures (if any)
Task 19: Address review comments (if any)
Task 20: [VERIFY] PR approved and merged
```

## Phase Transition Rules

### HARD Rules

1. **No skipping phases**: Phase 1 → 2 → 3 → 4 → 5 (strict order)
2. **Phase gate required**: Each phase ends with [VERIFY] checkpoint
3. **No regression**: Previous phase's verification must still pass
4. **User confirmation**: Phase 1 completion requires user confirmation

### Transition Protocol

```
Phase N complete:
  1. Run [VERIFY] checkpoint
  2. All checks pass?
     ├── YES → Announce phase completion, start Phase N+1
     └── NO  → Fix issues before proceeding
  3. Report: "Phase N complete. Starting Phase N+1."
```

## TodoWrite Integration

Track phase progress using TodoWrite:

```
[completed] Phase 1: Make It Work
  [completed] Task 1: Scaffold structure
  [completed] Task 2: Core happy path
  [completed] Task 3: End-to-end wiring
  [completed] Task 4: [VERIFY] Works manually

[in_progress] Phase 2: Refactor
  [in_progress] Task 5: Extract constants
  [pending] Task 6: Split modules
  [pending] Task 7: Naming and types
  [pending] Task 8: [VERIFY] Still works

[pending] Phase 3: Testing
[pending] Phase 4: Quality Gates
[pending] Phase 5: PR Lifecycle
```

## Output Format

### Phase Start
```markdown
## J.A.R.V.I.S.: POC Phase 1 - Make It Work

Starting greenfield implementation of [feature].
Goal: Working end-to-end happy path.

### Tasks
1. [ ] Scaffold project structure
2. [ ] Implement core logic
3. [ ] Wire up end-to-end
4. [ ] [VERIFY] Feature works
```

### Phase Complete
```markdown
## J.A.R.V.I.S.: POC Phase 1 Complete

Phase 1 verified. Core feature works end-to-end.
Moving to Phase 2: Refactor.

### Evidence
- Manual test: Login → Dashboard flow works
- API response: 200 OK with valid JWT
```

### All Phases Complete
```markdown
## J.A.R.V.I.S.: POC Complete

All 5 phases completed successfully.

### Summary
- Phase 1: Core feature working (12 files created)
- Phase 2: Refactored (3 files split, 15 constants extracted)
- Phase 3: Tests added (87% coverage, 24 tests)
- Phase 4: Quality gates passed (0 errors, 0 warnings)
- Phase 5: PR #42 merged

<jikime>DONE</jikime>
```

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `jikime-workflow-task-format` | All tasks use 5-field format |
| `jikime-workflow-ddd` | Alternative for existing code modification |
| `jikime-workflow-tdd` | Alternative for test-first development |
| `jikime-workflow-pr-lifecycle` | Phase 5 automation |
| `jikime-workflow-loop` | Can run within any phase for iterative fixing |

---

Version: 1.0.0
Last Updated: 2026-02-27
Source: Adapted from smart-ralph POC-First workflow
