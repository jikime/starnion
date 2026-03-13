---
description: "Agentic autonomous loop - Auto-fix until completion marker (Ralph Loop)"
argument-hint: "[--max N] [--auto] [--seq] | --resume snapshot | --cancel"
context: debug
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
---

## Pre-execution Context

!git status --porcelain
!git diff --name-only HEAD

## Essential Files

@.jikime/config/ralph.yaml

---

# /jikime:loop - Agentic Autonomous Loop (Ralph Engine)

## Core Principle: Fully Autonomous Iterative Fixing

AI autonomously finds issues, fixes them, and repeats until completion.

```
START: Issue Detection
  ↓
AI: Fix → Verify → Repeat
  ↓
AI: Add Completion Marker
  ↓
<jikime>DONE</jikime>
```

## Command Purpose

Autonomously fix LSP errors, test failures, and coverage issues:

1. **Parallel Diagnostics** (LSP + AST-grep + Tests simultaneously)
2. **Auto TODO Generation**
3. **Autonomous Fixing** (Level 1-3)
4. **Iterative Verification**
5. **Completion Marker Detection**

Arguments: $ARGUMENTS

## Quick Start

```bash
# Default autonomous loop (parallel diagnostics)
/jikime:loop

# Maximum 50 iterations
/jikime:loop --max 50

# Sequential diagnostics + auto fix
/jikime:loop --sequential --auto

# Restore from snapshot
/jikime:loop --resume latest

# Cancel active loop
/jikime:loop --cancel
```

## Command Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--max N` | --max-iterations | Maximum iteration count | 100 |
| `--auto` | --auto-fix | Enable auto-fix | Level 1 |
| `--sequential` | --seq | Sequential diagnostics (for debugging) | Parallel |
| `--errors` | --errors-only | Fix errors only | All |
| `--coverage` | --include-coverage | Include coverage | 85% |
| `--zero-warnings` | - | Require zero warnings for completion | false |
| `--zero-security` | - | Require zero security issues | false |
| `--tests-pass` | - | Require all tests to pass | true |
| `--stagnation-limit N` | - | Max iterations without improvement | 3 |
| `--resume ID` | --resume-from | Restore from snapshot | - |
| `--cancel` | - | Cancel active loop | - |

## Completion Markers

AI adds a marker when all work is complete:

```markdown
## Loop Complete

Resolved 5 errors, 3 warnings in 7 iterations. <jikime>DONE</jikime>
```

**Marker Types**:
- `<jikime>DONE</jikime>` - Task complete
- `<jikime>COMPLETE</jikime>` - Full completion
- `<jikime:done />` - XML format

Without marker, loop continues.

## Autonomous Loop Flow

```
START: /jikime:loop

PARALLEL Diagnostics (default)
  ├── LSP: Errors/Warnings
  ├── AST-grep: Security
  ├── Tests: Test results
  └── Coverage: Coverage metrics
  ↓
Integrated Results
  ↓
Completion Marker Detected?
  ├── YES → COMPLETE
  ↓
Conditions Met?
  ├── YES → "Add marker or continue?"
  ↓
TODO Generation (immediate)
  ↓
Fix Execution (agent delegation)
  ├── Level 1: Immediate fix (import, formatting)
  ├── Level 2: Safe fix (rename, type)
  └── Level 3: Approval required (logic, api)
  ↓
Verification
  ↓
Stagnation Check (no improvement in N iterations?) → STOP
  ↓
Max reached? → STOP
  ↓
Repeat
```

## Parallel Diagnostics

```bash
# Sequential (--sequential)
LSP → AST-grep → Tests → Coverage
Total 30s

# Parallel (default)
LSP ├─┐
     ├─→ Merge → 8s (3.75x faster)
AST ├─┤
    ├─┘
Tests ┤
       └─→ 3-4x speed improvement
Coverage
```

### Parallel Diagnostics Implementation

By default, execute all four diagnostic tools simultaneously each iteration for optimal performance:

Step 1 - Launch Background Tasks:

1. LSP Diagnostics: Use Bash tool with run_in_background set to true for language-specific LSP diagnostic command
2. AST-grep Scan: Use Bash tool with run_in_background set to true for ast-grep with security and quality rules
3. Test Runner: Use Bash tool with run_in_background set to true for language-specific test framework (pytest, jest, go test)
4. Coverage Check: Use Bash tool with run_in_background set to true for coverage measurement (coverage.py, c8, go test -cover)

Step 2 - Collect Results:

1. Use TaskOutput tool to collect results from all four background tasks
2. Wait for all tasks to complete (timeout: 120 seconds per task)
3. Handle partial failures gracefully - continue with available results

Step 3 - Aggregate Diagnostics:

1. Parse output from each tool into structured diagnostic report
2. Calculate metrics: error count, warning count, test pass rate, coverage percentage
3. Detect completion conditions: zero errors AND tests passing AND coverage meets threshold

Step 4 - Completion Check:

1. Check for completion marker in previous iteration response
2. If marker found: Exit loop with success
3. If all conditions met and no new issues: Prompt for completion marker or continue

Language-Specific Commands:

Python: pytest --tb=short for tests, coverage run -m pytest for coverage
TypeScript: npm test or jest for tests, npm run coverage for coverage
Go: go test ./... for tests, go test -cover ./... for coverage
Rust: cargo test for tests, cargo tarpaulin for coverage

## TODO-Obsessive Rule

[HARD] TodoWrite Tool Mandatory Usage:

Call TodoWrite tool on every iteration to manage tasks:

1. Immediate Creation: When issues are discovered, call TodoWrite to add items with pending status
2. Immediate Progress: Before starting work, call TodoWrite to change item to in_progress
3. Immediate Completion: After completing work, call TodoWrite to change item to completed
4. Prohibited: Output TODO lists as text (MUST use TodoWrite tool)

WHY: Using TodoWrite tool allows users to track progress in real-time.

## Auto-Fix Levels

| Level | Description | Approval | Examples |
|-------|-------------|----------|----------|
| 1 | Immediate fix | Not required | import sort, whitespace |
| 2 | Safe fix | Log only | rename var, add type |
| 3 | Approval needed | Required | logic change, API modify |
| 4 | Manual required | Not allowed | security, architecture |

## Output Format

### Running

```markdown
## Loop: 3/100 (parallel)

### Diagnostics (0.8s)
- LSP: 2 errors, 5 warnings
- AST-grep: 0 security issues
- Tests: 23/25 passing
- Coverage: 82%

### TODO
1. [x] src/auth.ts:45 - undefined 'jwtToken'
2. [in_progress] src/auth.ts:67 - missing return
3. [ ] tests/auth.test.ts:12 - unused 'result'

Fixing...
```

### Complete (Marker Detected)

```markdown
## Loop: COMPLETE

### Summary
- Iterations: 7
- Errors fixed: 5
- Warnings fixed: 3
- Tests: 25/25 passing
- Coverage: 87%

### Files Modified
- src/auth.ts (7 fixes)
- tests/auth.test.ts (3 fixes)
- src/api/routes.ts (2 fixes)

<jikime>DONE</jikime>
```

### Max Iterations Reached

```markdown
## Loop: MAX REACHED (100/100)

### Remaining
- Errors: 1
- Warnings: 2

### Options
1. /jikime:loop --max 200  # Continue
2. /jikime:loop --resume latest  # Resume from snapshot
3. Manual fix
```

### Stagnation Detected

```markdown
## Loop: STAGNATION (no improvement in 3 iterations)

### Analysis
- Iteration 5: 3 errors
- Iteration 6: 3 errors (no change)
- Iteration 7: 3 errors (no change)

### Remaining Issues
- src/complex.ts:120 - Type incompatibility (requires architectural change)

### Recommendation
- Consider Level 4 (manual) intervention
- Or adjust approach: /jikime:loop "Refactor type system in src/complex.ts" --max 10
```

## State & Snapshot

```bash
# State storage
.jikime/cache/.jikime_loop_state.json

# Snapshots
.jikime/cache/ralph-snapshots/
├── iteration-001.json
├── iteration-002.json
└── latest.json

# Restore
/jikime:loop --resume iteration-002
/jikime:loop --resume latest
```

## Cancellation

Simply send any message to interrupt the loop. The loop state is automatically saved when the session ends via the Stop hook. Alternatively, use:

```bash
/jikime:loop --cancel
```

## Hook Integration

The Ralph Loop integrates with JikiME-ADK's hook system:

### Initialization Hook
```bash
jikime hooks start-loop --task "$ARGUMENTS" [options]
```
- Initializes loop state
- Sets completion conditions
- Configures diagnostic tools

### Post-Tool Hook (Automatic)
- Triggers after each Edit/Write operation
- Collects LSP diagnostics for modified files
- Updates loop state with current metrics

### Stop Hook (Loop Controller)
```bash
jikime hooks stop-loop
```
- Checks completion conditions when Claude tries to respond
- Re-injects diagnostic feedback if more work is needed
- Signals completion when all conditions are satisfied

## Skill Integration

This command automatically loads:

```
Skill("jikime-workflow-loop")
```

The skill provides detailed patterns for:
- Diagnostic interpretation
- Fix prioritization strategies
- Stagnation recovery patterns
- Multi-language support

## Quick Reference

```bash
# Autonomous loop (default parallel)
/jikime:loop

# Sequential + auto
/jikime:loop --sequential --auto

# Max iterations
/jikime:loop --max 50

# Errors only
/jikime:loop --errors

# With coverage threshold
/jikime:loop --coverage

# Zero warnings mode
/jikime:loop --zero-warnings

# Restore
/jikime:loop --resume latest

# Cancel
/jikime:loop --cancel
```

---

## EXECUTION DIRECTIVE

1. Parse $ARGUMENTS (extract --max, --auto, --sequential, --errors, --coverage, --zero-warnings, --zero-security, --tests-pass, --stagnation-limit, --resume, --cancel flags)

2. IF --cancel flag: Run `jikime hooks cancel-loop` and stop

3. IF --resume flag: Load state from specified snapshot and continue from saved iteration

4. Initialize hook system: Run `jikime hooks start-loop --task "$ARGUMENTS" [parsed options]`

5. Load skill: Skill("jikime-workflow-loop")

6. Detect project language from indicator files (pyproject.toml, package.json, go.mod, Cargo.toml, tsconfig.json)

7. Initialize iteration counter to 0

8. LOOP START (while iteration less than max):

   8a. Check for completion marker in previous response:
       - If DONE, COMPLETE, or done marker found: Exit loop with success

   8b. Execute diagnostic scan:

       IF --sequential flag is specified:

       - Run LSP, then AST-grep, then Tests, then Coverage sequentially

       ELSE (default parallel mode):

       - Launch all four diagnostic tools in parallel using Bash with run_in_background:
         - Task 1: LSP diagnostics for detected language
         - Task 2: AST-grep scan with sgconfig.yml rules
         - Task 3: Test runner for detected language
         - Task 4: Coverage measurement for detected language

       - Collect results using TaskOutput for each background task

       - Aggregate results into unified diagnostic report

   8c. Check completion conditions:
       - Zero errors AND all tests passing AND coverage meets threshold
       - If --zero-warnings: Also require zero warnings
       - If --zero-security: Also require zero security issues
       - If all conditions met: Add completion marker and exit

   8d. Check stagnation:
       - Compare current metrics with previous N iterations (stagnation-limit)
       - If no improvement detected: Exit with stagnation report

   8e. [HARD] Call TodoWrite tool to add newly discovered issues with pending status

   8f. [HARD] Before each fix, call TodoWrite to change item to in_progress

   8g. [HARD] AGENT DELEGATION MANDATE for Fix Execution:
       - ALL fix tasks MUST be delegated to specialized agents
       - NEVER execute fixes directly, even after auto compact
       - WHY: Specialized agents have domain expertise; direct execution violates orchestrator role
       - This rule applies regardless of session state or context recovery

       Agent Selection by Issue Type:
       - Type errors, logic bugs: Use debugger subagent
       - Import/module issues: Use backend or frontend subagent
       - Test failures: Use test-guide subagent
       - Security issues: Use security-auditor subagent
       - Performance issues: Use optimizer subagent
       - Build errors: Use build-fixer subagent

       Execute fixes via agent delegation based on --auto level (Level 1-3)

   8h. [HARD] After each fix completion, call TodoWrite to change item to completed

   8i. Save iteration snapshot to .jikime/cache/ralph-snapshots/

   8j. Increment iteration counter

9. LOOP END

10. IF max iterations reached without completion: Display remaining issues and options

11. Report final summary with evidence

---

Version: 2.0.0
Last Updated: 2026-01-23
Core: Agentic AI Autonomous Loop (Ralph Engine)
