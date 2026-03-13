---
description: "Execute DDD implementation with ANALYZE-PRESERVE-IMPROVE cycle"
argument-hint: "SPEC-ID [--checkpoint] [--skip-quality] [--personal | --team]"
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep, LSP
model: inherit
---

## Pre-execution Context

!git status --porcelain
!git branch --show-current
!git log --oneline -5
!git stash list | head -5

## Essential Files

@.jikime/config/config.yaml
@.jikime/config/quality.yaml
@.jikime/project/product.md
@.jikime/project/structure.md
@.jikime/project/tech.md

---

# JikiME-ADK Step 2: Run - DDD Implementation

User Interaction Architecture: AskUserQuestion must be used at COMMAND level only. Subagents invoked via Task() operate in isolated, stateless contexts.

Development Methodology: DDD (Domain-Driven Development)
- ANALYZE: Understand current state and behavior
- PRESERVE: Create characterization tests to lock existing behavior
- IMPROVE: Make incremental improvements with test validation

Quality Framework: TRUST 5
- Tested: Comprehensive test coverage
- Readable: Clean, maintainable code
- Unified: Consistent patterns
- Secured: Security best practices
- Trackable: Git history, checkpoints

---

## Command Purpose

Execute SPEC implementation using DDD methodology with quality gates.

Execute: $ARGUMENTS

### Usage

```bash
/jikime:2-run SPEC-AUTH-001              # Standard execution
/jikime:2-run SPEC-AUTH-001 --checkpoint # Create checkpoint before start
/jikime:2-run SPEC-AUTH-001 --personal   # Force personal mode
/jikime:2-run SPEC-AUTH-001 --team       # Force team mode
```

---

## Phase Overview

```
Phase 1: Strategy Analysis
    ↓
Phase 1.5: Task Decomposition
    ↓
Phase 2: DDD Implementation (ANALYZE → PRESERVE → IMPROVE)
    ↓
Phase 2.5: Quality Validation
    ↓
Phase 3: Git Operations
    ↓
Phase 4: Completion & Next Steps
```

---

## PHASE 1: Strategy Analysis

Goal: Analyze SPEC and create implementation strategy.

### Step 1.1: Load SPEC Documents

Read SPEC files from `.jikime/specs/SPEC-{ID}/`:

- spec.md: Core specifications
- plan.md: Implementation plan
- acceptance.md: Acceptance criteria

[HARD] If SPEC files not found, abort with error message.

### Step 1.2: Invoke manager-strategy Agent

[SOFT] Apply --ultrathink keyword for deep implementation strategy analysis
WHY: Implementation strategy requires careful consideration of architecture patterns, dependency ordering, and parallel execution opportunities
IMPACT: Sequential thinking ensures optimal agent delegation and task decomposition for SPEC execution

Use the manager-strategy subagent to:

Analyze SPEC and create implementation strategy for: SPEC-{ID}

Context:
- SPEC Documents: {spec.md, plan.md, acceptance.md content}
- Project Context: {product.md, structure.md, tech.md summary}
- Git Mode: {personal | team}

Tasks:
1. Analyze requirements and dependencies
2. Identify technical constraints
3. Evaluate implementation approaches
4. Select optimal strategy with rationale
5. Identify risks and mitigation

Output: Strategic Analysis Report

### Step 1.3: Present Strategy to User

Use AskUserQuestion:

Question: Strategy analysis complete. Review and proceed?

Present:
- Selected Approach
- Key Dependencies
- Estimated Complexity
- Risk Assessment

Options:
- Proceed with Implementation
- Modify Strategy
- Cancel

---

## PHASE 1.5: Task Decomposition

Goal: Break down implementation into manageable tasks.

### Step 1.5.1: Generate Task List

Based on strategy, decompose into tasks:

```
Task 1: [Description] - Priority: HIGH
Task 2: [Description] - Priority: HIGH
Task 3: [Description] - Priority: MEDIUM
...
```

### Step 1.5.2: Update TodoWrite

[HARD] Use TodoWrite to track all tasks.

For each task:
- content: Task description
- status: pending | in_progress | completed
- activeForm: Present tense description

### Step 1.5.3: Create Checkpoint (if --checkpoint flag)

If --checkpoint flag provided:

```bash
git stash push -m "jikime_cp/$(date +%Y%m%d_%H%M%S)_pre_SPEC-{ID}"
# Or create lightweight tag
git tag "jikime_cp/$(date +%Y%m%d_%H%M%S)_SPEC-{ID}_start"
```

Display checkpoint info to user.

---

## PHASE 2: DDD Implementation

Goal: Implement SPEC using ANALYZE-PRESERVE-IMPROVE cycle.

### DDD Cycle Overview

```
┌─────────────┐
│   ANALYZE   │  ← Understand current behavior
└──────┬──────┘
       ↓
┌─────────────┐
│  PRESERVE   │  ← Lock behavior with tests
└──────┬──────┘
       ↓
┌─────────────┐
│   IMPROVE   │  ← Make changes with confidence
└──────┬──────┘
       ↓
    (repeat)
```

### Step 2.1: For Each Task, Execute DDD Cycle

Use the manager-ddd subagent to:

Execute DDD implementation for Task: {task_description}

Context:
- SPEC ID: SPEC-{ID}
- Task: {current task}
- Previous Tasks: {completed tasks summary}
- Acceptance Criteria: {relevant criteria from acceptance.md}

DDD Cycle Instructions:

**ANALYZE Phase:**
1. Read existing code related to task
2. Understand current behavior and dependencies
3. Identify test coverage gaps
4. Document assumptions

**PRESERVE Phase:**
1. Create characterization tests for existing behavior
2. Ensure all edge cases are covered
3. Verify tests pass before changes
4. Document behavioral contracts

**IMPROVE Phase:**
1. Make incremental changes
2. Run tests after each change
3. Refactor for clarity if needed
4. Update documentation

Output:
- Files modified
- Tests added/modified
- Behavior preserved: YES/NO
- Changes summary

### Step 2.2: Track Progress

After each task:
1. Mark task as completed in TodoWrite
2. Create micro-commit if configured
3. Proceed to next task

### Step 2.3: Handle Failures

If DDD cycle fails:
1. Rollback to last known good state
2. Report failure details
3. Ask user for guidance

---

## PHASE 2.5: Quality Validation

Goal: Verify implementation meets quality standards.

### Step 2.5.1: Invoke manager-quality Agent

Use the manager-quality subagent to:

Validate implementation quality for: SPEC-{ID}

Quality Checks:
1. Test Coverage: Target 85%+
2. Lint/Format: Language-specific rules
3. Type Safety: Type errors = 0
4. Security Scan: No high/critical issues
5. Build Verification: Clean build

Validation Tools by Language:
- TypeScript: tsc, eslint, prettier, vitest
- Python: mypy, ruff, pytest
- Go: go vet, golangci-lint, go test
- Rust: cargo check, cargo clippy, cargo test

Output: Quality Report with PASS/WARNING/CRITICAL status

### Step 2.5.2: Handle Quality Issues

If quality gate fails:

Use AskUserQuestion:

Question: Quality validation found issues. How to proceed?

Options:
- Fix Issues Automatically - Attempt auto-fix
- Review Issues First - Show detailed report
- Skip Quality Gate - Proceed with warning (not recommended)
- Abort Implementation - Stop and review

### Step 2.5.3: Auto-Fix Loop (if selected)

If user selects "Fix Issues Automatically":

```
Loop (max 3 iterations):
1. Run auto-fix tools
2. Re-validate
3. If PASS → exit loop
4. If FAIL → report remaining issues
```

---

## PHASE 3: Git Operations

Goal: Commit changes and create PR (if team mode).

### Step 3.1: Detect Git Mode

Read from config or flags:
- --personal flag → Personal mode
- --team flag → Team mode
- config git_mode → Configured mode

### Step 3.2: Invoke manager-git Agent

Use the manager-git subagent to:

Execute git operations for: SPEC-{ID}

Mode: {personal | team}
Changes: {list of modified files}
Quality Status: {PASS | WARNING}

**Personal Mode Tasks:**
1. Stage relevant files
2. Create conventional commit: `feat(SPEC-{ID}): {description}`
3. Push to remote (if configured)

**Team Mode Tasks:**
1. Stage relevant files
2. Create conventional commit
3. Push to feature branch
4. Create/Update PR with:
   - Title: `feat(SPEC-{ID}): {title}`
   - Body: Implementation summary, test coverage, checklist
   - Labels: spec, implementation
   - Reviewers: From config (if set)

### Step 3.3: Display Git Summary

Show:
- Commit hash
- Files changed
- PR URL (team mode)
- Branch status

---

## PHASE 4: Completion

Goal: Summarize results and guide next steps.

### Step 4.1: Generate Completion Report

```markdown
## SPEC-{ID} Implementation Complete

### Summary
- Tasks Completed: X/Y
- Files Modified: N
- Tests Added: M
- Quality Status: PASS/WARNING

### Changes
- [file1]: Description
- [file2]: Description

### Quality Metrics
- Test Coverage: XX%
- Lint Issues: 0
- Type Errors: 0

### Git
- Commit: abc1234
- Branch: feature/SPEC-{ID}
- PR: #123 (team mode)
```

### Step 4.2: Offer Next Steps

Use AskUserQuestion:

Question: Implementation complete. What would you like to do next?

Options:
- Sync Documentation - Execute /jikime:3-sync SPEC-{ID}
- Start New SPEC - Execute /jikime:1-plan
- Review Changes - Open diff view
- Continue Development - Stay on current branch

---

## Critical Rules

### DDD Compliance

[HARD] Every code change MUST follow ANALYZE-PRESERVE-IMPROVE cycle.
[HARD] Characterization tests MUST exist before modifying existing code.
[HARD] Tests MUST pass after each incremental change.

### Quality Gates

[HARD] Quality validation is mandatory before git operations.
[SOFT] Test coverage target: 85%+
[SOFT] Zero high/critical security issues

### Git Operations

[HARD] Never force push to main/master
[HARD] Create checkpoints for risky operations
[HARD] Use conventional commit format

### User Interaction

[HARD] AskUserQuestion at COMMAND level only
[HARD] No emoji in AskUserQuestion fields
[HARD] Maximum 4 options per question

---

## Output Format

### User-Facing Output (Markdown)

All progress reports in Markdown format with:
- Phase headers
- Task progress lists
- Code blocks for paths/commands
- Bold for key results

### Internal Agent Communication (XML)

```xml
<strategy>Analysis results and selected approach</strategy>
<tasks>Task decomposition with priorities</tasks>
<ddd_cycle>ANALYZE-PRESERVE-IMPROVE execution log</ddd_cycle>
<quality>Validation results and metrics</quality>
<git>Commit info, PR details</git>
```

---

## Quick Reference

Entry Point: /jikime:2-run SPEC-{ID} [flags]

Flags:
- --checkpoint: Create recovery point before start
- --skip-quality: Skip quality validation (not recommended)
- --personal: Force personal git mode
- --team: Force team git mode

Agent Chain:
1. manager-strategy: Implementation strategy
2. manager-ddd: DDD cycle execution (per task)
3. manager-quality: Quality validation
4. manager-git: Git operations

Phase Flow:
```
1 (Strategy) → 1.5 (Tasks) → 2 (DDD) → 2.5 (Quality) → 3 (Git) → 4 (Done)
```

---

Version: 1.0.0
Last Updated: 2026-01-22
Architecture: Commands → Agents → Skills
Methodology: DDD (Domain-Driven Development)
Quality Framework: TRUST 5

---

## EXECUTION DIRECTIVE

You must NOW execute the command following the phases above.

1. PHASE 1: Load SPEC, invoke manager-strategy, get user approval
2. PHASE 1.5: Decompose tasks, update TodoWrite, create checkpoint if flagged
3. PHASE 2: Execute DDD cycle for each task via manager-ddd
4. PHASE 2.5: Invoke manager-quality for validation
5. PHASE 3: Invoke manager-git for commits/PR
6. PHASE 4: Show completion report, offer next steps

[HARD] Mark TodoWrite tasks as completed immediately after finishing each.
[HARD] Create checkpoints before risky operations.

Do NOT just describe what you will do. DO IT.
