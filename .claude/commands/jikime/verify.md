---
description: "Comprehensive quality verification - build, type, lint, test, security, browser in one command"
argument-hint: "[quick|standard|full|pre-pr|--fix|--json|--ci|--incremental|--no-browser|--browser-only|--headed|--fix-loop]"
type: utility
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Comprehensive Verification

Unified quality gate verification integrated with LSP Quality Gates and TRUST 5 framework.

Verification mode: $ARGUMENTS

---

## Core Philosophy

```
Unified Quality Gate Verification:
├─ Static Analysis
│   ├─ Build verification (compilation success)
│   ├─ Type checking (TypeScript/Pyright/etc.)
│   ├─ Lint validation (ESLint/Ruff/etc.)
│   ├─ Test execution (with coverage)
│   ├─ Security scanning (secrets, vulnerabilities)
│   ├─ LSP Quality Gates (zero regression policy)
│   └─ TRUST 5 compliance check
│
└─ Runtime Verification (full, pre-pr, or --browser-only)
    └─ Browser verification via Playwright
        ├─ Console errors detection
        ├─ Page load validation
        ├─ UI rendering checks
        └─ Auto-fix loop (with --fix-loop)
```

**Integrated Workflow**: `full` and `pre-pr` profiles automatically run browser verification after static analysis passes. Use `--no-browser` to skip, or `--browser-only` to run browser verification exclusively.

---

## Usage

```bash
# Standard verification (recommended)
/jikime:verify

# Quick check (build + types only)
/jikime:verify quick

# Full verification (all checks + deps)
/jikime:verify full

# Pre-PR verification (full + security scan)
/jikime:verify pre-pr

# With auto-fix attempt
/jikime:verify --fix

# CI/CD mode (exit codes)
/jikime:verify --ci

# JSON output for automation
/jikime:verify --json

# Only check changed files
/jikime:verify --incremental

# Browser-only verification (skip static analysis)
/jikime:verify --browser-only

# Browser verification with visible window (headed mode)
/jikime:verify --browser-only --headed

# Browser verification with auto-fix loop
/jikime:verify --browser-only --fix-loop

# Full verification with headed browser
/jikime:verify pre-pr --headed

# Browser-only with custom routes and max iterations
/jikime:verify --browser-only --routes /,/dashboard,/settings --max 5
```

---

## Verification Profiles

| Profile | Static Checks | Browser | Use Case |
|---------|---------------|---------|----------|
| `quick` | Build, Types | ❌ | During active development |
| `standard` | Build, Types, Lint, Tests | ❌ | Default, after changes |
| `full` | All + Deps, Coverage | ✅ | Before major commits |
| `pre-pr` | Full + Security + Secrets + Adversarial | ✅ | Before creating PR |

**Browser Verification**: Automatically runs for `full` and `pre-pr` profiles using Playwright.

**Skip Browser Verification**:
```bash
# Skip browser verification even for full/pre-pr profiles
/jikime:verify pre-pr --no-browser
```

**Run Browser-Only Verification**:
```bash
# Browser verification only (skip static analysis)
/jikime:verify --browser-only

# With visible browser window
/jikime:verify --browser-only --headed

# With auto-fix loop for runtime errors
/jikime:verify --browser-only --fix-loop --max 10
```

## Browser Verification Options

| Option | Description | Default |
|--------|-------------|---------|
| `--browser-only` | Skip static analysis, run browser verification only | false |
| `--headed` | Run browser in headed mode (visible window) | false |
| `--fix-loop` | Enable auto-fix loop for browser errors | false |
| `--max N` | Maximum fix iterations (with --fix-loop) | 10 |
| `--routes paths` | Comma-separated routes to verify | Auto-discover |
| `--port N` | Dev server port | Auto-detect |
| `--url URL` | Dev server URL (skip server start) | - |
| `--stagnation-limit N` | Max iterations without improvement | 3 |
| `--e2e` | Run E2E tests after browser verification | false |

---

## Verification Phases

### Phase 1: Build Check

```bash
# Auto-detect and run build
npm run build 2>&1 | tail -30
# OR
pnpm build 2>&1 | tail -30
# OR
cargo build 2>&1 | tail -30
```

**Gate**: FAIL → Stop immediately, show errors

### Phase 2: Type Check

```bash
# TypeScript
npx tsc --noEmit 2>&1

# Python
pyright . 2>&1

# Go
go vet ./... 2>&1
```

**Gate**: Errors → Must fix before PR

### Phase 3: Lint Check

```bash
# JavaScript/TypeScript
npm run lint 2>&1

# With auto-fix
npm run lint -- --fix 2>&1

# Python
ruff check . 2>&1
```

**Gate**: Errors → Must fix. Warnings → Document if needed.

### Phase 4: Test Suite

```bash
# Run with coverage
npm test -- --coverage 2>&1

# Report format
Coverage: X% (target: 80%)
Tests: X passed, Y failed
```

**Gate**: Failures → Must fix. Coverage < 80% → Warning.

### Phase 5: Security Scan

```bash
# Secret detection
grep -rn "sk-\|api_key\|password\s*=" --include="*.ts" src/

# Dependency vulnerabilities
npm audit --production

# Console.log detection
grep -rn "console.log" --include="*.ts" src/
```

**Gate**: Secrets found → CRITICAL. Vulnerabilities → Review.

### Phase 6: LSP Quality Gates

Check against `.jikime/config/quality.yaml` thresholds:

```yaml
lsp_quality_gates:
  run:
    max_errors: 0
    max_type_errors: 0
    max_lint_errors: 0
  sync:
    max_warnings: 10
```

**Gate**: Regression from baseline → Block PR.

### Phase 7: TRUST 5 Compliance

```markdown
[T] Tested:    Coverage > 80%, critical paths tested
[R] Readable:  No complexity warnings, clear naming
[U] Unified:   Consistent patterns, follows architecture
[S] Secured:   No vulnerabilities, input validated
[T] Trackable: Structured logging, error context
```

### Phase 8: Adversarial Review (pre-pr, full profiles only)

**Purpose**: Multi-angle validation to reduce false positives and catch missed issues.

```
┌─────────────────────────────────────────────────────────────┐
│                   ADVERSARIAL REVIEW LAYER                  │
├─────────────────────────────────────────────────────────────┤
│  Subagent 1: False Positive Filter                          │
│  ├─ Review all warnings/errors from Phases 1-7              │
│  ├─ Identify false positives (intentional patterns,         │
│  │   test fixtures, generated code, third-party)            │
│  └─ Output: Filtered list with confidence scores            │
├─────────────────────────────────────────────────────────────┤
│  Subagent 2: Missing Issues Finder                          │
│  ├─ Analyze code changes with fresh perspective             │
│  ├─ Look for edge cases, race conditions, error handling    │
│  ├─ Check boundary conditions and null safety               │
│  └─ Output: Additional issues not caught by standard tools  │
├─────────────────────────────────────────────────────────────┤
│  Subagent 3: Context Validator                              │
│  ├─ Compare findings against original intent/requirements   │
│  ├─ Verify changes don't break existing functionality       │
│  ├─ Check if suggested fixes align with codebase patterns   │
│  └─ Output: Contextual assessment with recommendations      │
└─────────────────────────────────────────────────────────────┘
```

**Execution**: All 3 subagents run in PARALLEL (single Task message):

```markdown
## Adversarial Review

### False Positive Analysis
| Finding | Verdict | Reason |
|---------|---------|--------|
| `unused import` in test.ts | FALSE POSITIVE | Test fixture |
| `any` type warning | VALID | Should be typed |

### Missing Issues Found
1. Race condition in `async updateUser()` - no mutex
2. Missing null check at `data.items[0]`

### Context Validation
- Changes align with PR description: ✅
- Pattern consistency maintained: ✅
- Suggested fixes are safe: ✅
```

**Gate**: Adversarial findings integrated into final report with severity adjustment.

### Phase 9: Browser Verification (full, pre-pr profiles only)

**Purpose**: Runtime browser error detection that catches issues missed by static analysis.

**Browser Tool Selection**:
1. **Playwright** (recommended): Built-in, supports headed/headless modes
2. **agent-browser** (fallback): If installed, uses agent-browser CLI

**Browser Modes**:
| Mode | Description | Use Case |
|------|-------------|----------|
| `headless` | No visible browser (default) | CI/CD, automated testing |
| `headed` | Visible browser window | Manual verification, debugging |

**Workflow**:

```
┌─────────────────────────────────────────────────────────────┐
│                   BROWSER VERIFICATION                       │
├─────────────────────────────────────────────────────────────┤
│  1. Dev Server Detection                                     │
│     ├─ Scan common ports (3000, 5173, 8080, 4200)           │
│     ├─ If running: Use existing server                       │
│     └─ If not: Start with detected package manager           │
├─────────────────────────────────────────────────────────────┤
│  2. Route Discovery                                          │
│     ├─ Parse React Router / Next.js / Vue Router patterns    │
│     └─ Fallback to ["/"] if none found                       │
├─────────────────────────────────────────────────────────────┤
│  3. Browser Navigation & Error Capture                       │
│     ├─ Open browser (headed or headless)                     │
│     ├─ Navigate to each route                                │
│     ├─ Capture console errors and page errors                │
│     └─ Take screenshots for evidence                         │
├─────────────────────────────────────────────────────────────┤
│  4. Error Analysis                                           │
│     ├─ Categorize: console_error, page_error, network_error  │
│     ├─ Extract source file and line from stack traces        │
│     └─ Deduplicate and prioritize by severity                │
└─────────────────────────────────────────────────────────────┘
```

**Execution with Playwright (Recommended)**:

```bash
# Headed mode (visible browser for manual verification)
npx playwright open http://localhost:{port}

# Programmatic verification with error capture
npx playwright test --project=chromium  # If E2E tests exist

# Screenshot capture for evidence
npx playwright screenshot http://localhost:{port} screenshot.png
```

**Execution with agent-browser (Fallback)**:

```bash
# Check if agent-browser is available
if which agent-browser > /dev/null 2>&1; then
  # Start browser verification
  agent-browser open http://localhost:{port}
  agent-browser snapshot -i
  agent-browser errors
  agent-browser close
fi
```

**Headed Mode Activation**:
- Use `--headed` flag with verify command
- Useful for debugging and manual verification
- Shows actual browser window during verification

**Error Types Captured**:

| Type | Detection | Severity |
|------|-----------|----------|
| `console.error` | Snapshot analysis | HIGH |
| `uncaughtException` | Error boundary detection | CRITICAL |
| `unhandledRejection` | Promise rejection detection | CRITICAL |
| `network error` | Failed resource placeholders | MEDIUM |
| `resource load failure` | Missing images/broken links | LOW |

**Gate**: Browser errors found → Report in final summary. CRITICAL errors → Block PR recommendation.

**Skip Condition**: Use `--no-browser` to skip this phase.

### Browser-Only Mode (--browser-only)

When `--browser-only` is specified, skip all static analysis phases (1-8) and run browser verification directly.

**Use Cases**:
- Quick runtime error check after code changes
- Debugging browser-specific issues
- Manual verification with `--headed` flag

**Workflow**:
```
START: --browser-only flag detected
  |
  ├─ Skip Phases 1-8 (static analysis)
  |
  └─ Execute Phase 9 (browser verification) only
      |
      ├─ Dev server detection/start
      ├─ Route discovery
      ├─ Browser navigation
      └─ Error capture and reporting
```

### Auto-Fix Loop (--fix-loop)

When `--fix-loop` is specified with browser verification, automatically fix detected errors and re-verify until clean.

**Flow**:
```
Iteration 1:
  Errors Found: 5
  → Delegate fixes to agents
  → Re-navigate all routes

Iteration 2:
  Errors Found: 2 (3 fixed)
  → Delegate remaining fixes
  → Re-navigate all routes

Iteration 3:
  Errors Found: 0
  → SUCCESS: All runtime errors resolved
```

**Fix Delegation**:
| Error Type | Agent |
|------------|-------|
| Component/UI errors | frontend subagent |
| Module resolution | debugger subagent |
| Type/reference errors | debugger subagent |
| API/network errors | backend subagent |
| Build/bundler errors | build-fixer subagent |

**Stagnation Detection**:
If error count doesn't decrease for N consecutive iterations (default: 3):
- Stop loop
- Report remaining errors with analysis
- Suggest manual intervention

**Example Output (Fix Loop)**:
```markdown
## Browser Verify: Iteration 2/10

### Routes Scanned: 5/8
- [x] / (0 errors)
- [x] /about (0 errors)
- [x] /dashboard (2 errors)
- [ ] /settings ← scanning

### Errors Found: 3
1. CRITICAL: TypeError at src/components/Canvas.tsx:45
2. HIGH: ReferenceError at src/hooks/useAuth.ts:23
3. MEDIUM: 404 at /api/health

Fixing...
```

---

## Output Format

### J.A.R.V.I.S. Format

```markdown
## J.A.R.V.I.S.: Verification Report

### Quick Summary
| Check | Status | Details |
|-------|--------|---------|
| Build | ✅ PASS | 0 errors |
| Types | ✅ PASS | 0 errors |
| Lint | ⚠️ WARN | 3 warnings |
| Tests | ✅ PASS | 47/47 (98% coverage) |
| Security | ✅ PASS | 0 issues |
| LSP Gates | ✅ PASS | No regression |
| TRUST 5 | ✅ PASS | All principles met |
| Browser | ✅ PASS | 5 routes, 0 errors |

### Overall: ✅ READY FOR PR

### Warnings to Address
1. `src/utils/helper.ts:42` - Unused variable (lint)
2. `src/api/handler.ts:18` - Consider extracting function

### Predictive Suggestions
- Consider adding E2E test for new auth flow
- Review error handling in payment module

### Adversarial Review (pre-pr/full only)
| Subagent | Findings |
|----------|----------|
| False Positive Filter | 2 warnings filtered (test fixtures) |
| Missing Issues Finder | 1 race condition detected |
| Context Validator | Changes align with intent ✅ |

**Adjusted Issues**: 3 warnings → 1 warning (after filtering)
**New Issues**: 1 (race condition in async handler)

### Browser Verification (pre-pr/full only)
| Route | Status | Errors |
|-------|--------|--------|
| / | ✅ PASS | 0 |
| /dashboard | ✅ PASS | 0 |
| /settings | ⚠️ WARN | 1 (non-critical) |
| /profile | ✅ PASS | 0 |
| /auth/login | ✅ PASS | 0 |

**Browser Errors Found**: 1
- `src/pages/settings.tsx` - Warning: React key missing in list (non-blocking)

**Runtime Health**: All critical paths load successfully
```

### F.R.I.D.A.Y. Format

```markdown
## F.R.I.D.A.Y.: Migration Verification

### Module Status
| Module | Build | Types | Tests | Status |
|--------|-------|-------|-------|--------|
| Auth | ✅ | ✅ | ✅ | VERIFIED |
| Users | ✅ | ✅ | ✅ | VERIFIED |
| Products | ✅ | ⚠️ 2 | ✅ | NEEDS FIX |

### Migration Progress: 8/10 modules verified

### Blocking Issues
1. Products module: 2 type errors in migration
   - `ProductDTO.price`: Expected number, got string
   - `Product.category`: Missing property

### Next Steps
1. Fix type errors in Products module
2. Run: /jikime:verify --incremental
```

---

## Auto-Fix Mode (--fix)

When `--fix` is used:

1. Run `eslint --fix` for auto-fixable lint issues
2. Run `prettier --write` for formatting
3. Re-run verification to confirm fixes
4. Report remaining issues that need manual attention

```markdown
## Auto-Fix Results

### Fixed Automatically
- 12 lint issues (formatting, imports)
- 3 unused imports removed

### Requires Manual Fix
- `src/auth.ts:42` - Type error: string vs number
- `src/api.ts:18` - Unused function (intentional?)

Re-verification: Build ✅ | Types ❌ (1 error) | Lint ✅
```

---

## Incremental Mode (--incremental)

Only verify changed files since last commit:

```bash
/jikime:verify --incremental

# Checks only:
git diff --name-only HEAD~1 | xargs -I {} verify {}
```

Benefits:
- 10x faster for large codebases
- Immediate feedback during development
- Full verification still recommended pre-PR

---

## CI/CD Integration

### Exit Codes (--ci)

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Build failed |
| 2 | Type errors |
| 3 | Lint errors (not warnings) |
| 4 | Test failures |
| 5 | Security issues (critical) |
| 6 | LSP regression detected |
| 7 | Browser errors (critical runtime errors) |

### JSON Output (--json)

```json
{
  "timestamp": "2024-01-22T10:30:00Z",
  "profile": "pre-pr",
  "status": "PASS",
  "checks": {
    "build": {"status": "pass", "errors": 0, "duration_ms": 2340},
    "types": {"status": "pass", "errors": 0, "warnings": 2},
    "lint": {"status": "pass", "errors": 0, "warnings": 5},
    "tests": {"status": "pass", "total": 47, "passed": 47, "coverage": 98.2},
    "security": {"status": "pass", "secrets": 0, "vulnerabilities": 0},
    "lsp": {"status": "pass", "regression": false},
    "trust5": {"status": "pass", "score": 5},
    "browser": {
      "status": "pass",
      "routes_checked": 5,
      "errors": 0,
      "warnings": 1,
      "routes": [
        {"path": "/", "status": "pass", "errors": []},
        {"path": "/dashboard", "status": "pass", "errors": []},
        {"path": "/settings", "status": "warn", "errors": [{"type": "console_warn", "message": "React key missing"}]},
        {"path": "/profile", "status": "pass", "errors": []},
        {"path": "/auth/login", "status": "pass", "errors": []}
      ]
    }
  },
  "ready_for_pr": true,
  "warnings": [
    {"file": "src/utils.ts", "line": 42, "message": "Unused variable"}
  ],
  "adversarial_review": {
    "false_positives_filtered": 2,
    "missing_issues_found": 1,
    "context_validated": true,
    "findings": [
      {"type": "missing", "severity": "medium", "message": "Race condition in async handler", "file": "src/api.ts", "line": 78}
    ]
  }
}
```

### GitHub Actions Integration

```yaml
- name: Run Verification
  run: |
    jikime-adk verify pre-pr --ci --json > verify-results.json
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
      echo "Verification failed with code $exit_code"
      cat verify-results.json | jq '.warnings'
      exit $exit_code
    fi
```

---

## LSP Quality Gates Integration

Reads from `.jikime/config/quality.yaml`:

```yaml
lsp_quality_gates:
  enabled: true

  plan:
    require_baseline: true

  run:
    max_errors: 0
    max_type_errors: 0
    max_lint_errors: 0
    allow_regression: false

  sync:
    max_errors: 0
    max_warnings: 10
    require_clean_lsp: true
```

### Baseline Comparison

```
Previous State (baseline):
  Errors: 0, Type Errors: 0, Warnings: 5

Current State:
  Errors: 0, Type Errors: 0, Warnings: 7

Regression: +2 warnings (within threshold)
Status: PASS (no error regression)
```

---

## TRUST 5 Integration

Each principle is verified:

| Principle | Checks | Target |
|-----------|--------|--------|
| **T**ested | Coverage, test count | 80%+ coverage |
| **R**eadable | Complexity, naming | No warnings |
| **U**nified | Pattern consistency | Architecture compliance |
| **S**ecured | Vulnerabilities, secrets | Zero critical |
| **T**rackable | Logging, error handling | Structured logs |

---

## EXECUTION DIRECTIVE

1. Detect project type (npm, pnpm, cargo, go, etc.)

2. Parse profile and flags from $ARGUMENTS:
   - Profile: quick | standard | full | pre-pr (default: standard)
   - Flags: --fix, --ci, --json, --incremental, --no-browser, --browser-only, --headed, --fix-loop, --max, --routes, --port, --url, --stagnation-limit, --e2e

3. **IF `--browser-only` flag**: Skip to step 6 (browser verification only)

4. Execute static analysis phases in order:
   - Build → Type → Lint → Test → Security → LSP → TRUST 5

5. Stop on critical failures (build, types in strict mode)

6. **For `pre-pr`, `full` profiles, or `--browser-only`** (unless `--no-browser`): Execute Adversarial Review (Phase 8) if not --browser-only
   - Launch 3 subagents in PARALLEL (single Task message)
   - Collect results and integrate into final report

7. **Browser Verification (Phase 9)**:
   - **IF `--browser-only` OR (`pre-pr`/`full` AND NOT `--no-browser`)**:
     a. Detect running dev server on common ports (3000, 5173, 8080, 4200)
     b. If multiple servers found: Use AskUserQuestion to let user select
     c. If no server running: Start with detected package manager (background)
     d. Discover routes (from --routes flag or scan project files)
     e. **Browser Mode**:
        - IF `--headed`: Use `npx playwright open` for visible browser
        - ELSE: Use headless mode for automated verification
     f. For each route: Navigate, capture screenshots, detect errors
     g. Aggregate browser errors by severity (CRITICAL, HIGH, MEDIUM, LOW)

8. **IF `--fix-loop` flag**: Execute Auto-Fix Loop
   a. Initialize iteration counter (max from --max flag, default 10)
   b. LOOP while errors > 0 AND iteration < max:
      - [HARD] Call TodoWrite to track discovered errors
      - [HARD] Delegate fixes to specialized agents:
        - Component/UI errors → frontend subagent
        - Module resolution → debugger subagent
        - API/network errors → backend subagent
      - Re-verify all routes after fixes
      - Check stagnation (--stagnation-limit, default 3)
      - IF no improvement for N iterations: Exit with stagnation report
   c. Report fix summary

9. **IF `--e2e` flag AND browser verification passed**:
   - Run E2E tests with Playwright
   - Report E2E results

10. Cleanup:
    - Close browser
    - Terminate dev server if we started it

11. Aggregate all results into report

12. Use orchestrator-appropriate format (J.A.R.V.I.S. or F.R.I.D.A.Y.)

13. If `--fix`, attempt auto-fixes for static analysis issues and re-verify

14. If `--ci`, set exit code based on results (browser errors = 7)

15. If `--json`, output JSON instead of markdown

Execute NOW. Do NOT just describe.

---

## Related Commands

### Browser Verification (Built-in)

Use verify command with browser options:
```bash
/jikime:verify --browser-only           # Browser verification only
/jikime:verify --browser-only --headed  # With visible browser
/jikime:verify --browser-only --fix-loop # With auto-fix loop
```

### E2E Testing

- `/jikime:e2e` - E2E test generation and execution (Playwright)

### Static Analysis Only

- `/jikime:test` - Run tests only
- `/jikime:build-fix` - Fix build errors
- `/jikime:security` - Deep security analysis
- `/jikime:eval` - Eval-driven verification
- `/jikime:loop` - Iterative fix loop

---

## Prerequisites

### Playwright (Built-in)

Browser verification uses Playwright. Install if not present:

```bash
# Install Playwright
npm install -D @playwright/test

# Install browsers
npx playwright install
```

**Playwright Commands**:
```bash
# Open browser (headed mode)
npx playwright open http://localhost:3000

# Take screenshot
npx playwright screenshot http://localhost:3000 screenshot.png

# Run E2E tests
npx playwright test
```

---

Version: 2.0.0
Type: Utility Command (Type B)
Integration: LSP Quality Gates, TRUST 5, Adversarial Review, Playwright
Changelog:
- v2.0.0: Unified browser-verify into verify command. Added --browser-only, --headed, --fix-loop options. Switched to Playwright.
- v1.3.0: Added Adversarial Review phase
