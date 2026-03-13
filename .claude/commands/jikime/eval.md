---
description: "Eval-Driven Development (EDD) - Define, run, and track AI development evals"
argument-hint: "[define|check|report|list|clean] [eval-name] [--auto-suggest|--json|--ci]"
type: utility
allowed-tools: Task, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Eval-Driven Development

Treat evals as "unit tests for AI development" - define success criteria before implementation, track progress with pass@k metrics.

Eval target: $ARGUMENTS

---

## Core Philosophy

```
Eval-Driven Development (EDD) = TDD for AI
├─ Define evals BEFORE coding (like writing tests first)
├─ Run evals continuously during development
├─ Track pass@k metrics for reliability measurement
└─ Integrate with DDD (ANALYZE-PRESERVE-IMPROVE)
```

---

## Usage

```bash
# Define new eval for a feature
/jikime:eval define auth-system

# Auto-suggest evals from code analysis
/jikime:eval define auth-system --auto-suggest

# Check current eval status
/jikime:eval check auth-system

# Generate comprehensive report
/jikime:eval report auth-system

# List all evals with status
/jikime:eval list

# Export for CI/CD
/jikime:eval report auth-system --json

# Clean old logs (keep last 10)
/jikime:eval clean
```

---

## Options

| Option | Description |
|--------|-------------|
| `define <name>` | Create new eval definition |
| `check <name>` | Run evals and check status |
| `report <name>` | Generate full eval report |
| `list` | Show all evals with status |
| `clean` | Remove old eval logs |
| `--auto-suggest` | Analyze code and suggest evals |
| `--json` | Export report as JSON for CI/CD |
| `--ci` | CI-friendly output (exit code based) |

---

## Eval Types

### 1. Capability Evals (New Features)
Test if the implementation can do something new:

```markdown
[CAPABILITY EVAL: feature-name]
Task: What the implementation should accomplish
Success Criteria:
  - [ ] Criterion 1 (measurable, verifiable)
  - [ ] Criterion 2
  - [ ] Criterion 3
Grader: code | model | human
```

### 2. Regression Evals (Behavior Preservation)
Ensure changes don't break existing functionality (DDD aligned):

```markdown
[REGRESSION EVAL: feature-name]
Baseline: commit SHA or SPEC reference
Tests:
  - existing-test-1: PASS/FAIL
  - existing-test-2: PASS/FAIL
Grader: code (npm test, pytest, etc.)
```

### 3. Quality Evals (TRUST 5 Integration)
Verify quality principles are maintained:

```markdown
[QUALITY EVAL: feature-name]
TRUST 5 Checks:
  - Tested: Coverage > 80%
  - Readable: No complexity warnings
  - Unified: Consistent patterns
  - Secured: No vulnerabilities
  - Trackable: Proper logging
Grader: code + lsp
```

---

## Grader Types

| Grader | Use Case | Implementation |
|--------|----------|----------------|
| `code` | Deterministic checks | Bash commands, test runners |
| `model` | Open-ended evaluation | Claude self-assessment |
| `human` | Security, UX review | Flag for manual review |
| `lsp` | Type/lint validation | LSP diagnostics check |

---

## Metrics

### pass@k (At least one success in k attempts)
```
pass@1: 67%  → First attempt success rate
pass@3: 100% → Success within 3 attempts
Target: pass@3 > 90% for capability evals
```

### pass^k (All k trials succeed)
```
pass^3: 100% → 3 consecutive successes required
Use for: Critical paths, regression evals
Target: pass^3 = 100% for regression evals
```

### Trend Tracking
```json
{
  "eval": "auth-system",
  "history": [
    {"date": "2024-01-20", "pass@3": 0.67, "pass^3": 0.33},
    {"date": "2024-01-21", "pass@3": 0.89, "pass^3": 0.67},
    {"date": "2024-01-22", "pass@3": 1.00, "pass^3": 1.00}
  ]
}
```

---

## Eval Workflow Integration

### With SPEC Workflow

```
/jikime:1-plan "feature-name"
    ↓
  SPEC created
    ↓
/jikime:eval define feature-name --auto-suggest
    ↓
  Evals defined from SPEC requirements
    ↓
/jikime:2-run SPEC-XXX
    ↓
  During implementation: /jikime:eval check feature-name
    ↓
/jikime:3-sync
    ↓
  /jikime:eval report feature-name
```

### With DDD Methodology

```
ANALYZE phase:
  → Define regression evals for existing behavior

PRESERVE phase:
  → Run regression evals (must be pass^3 = 100%)

IMPROVE phase:
  → Run capability evals (target pass@3 > 90%)
```

---

## Storage Structure

```
.jikime/
├── evals/
│   ├── auth-system.md        # Eval definition
│   ├── auth-system.log       # Run history (last 10)
│   ├── auth-system.json      # Metrics over time
│   └── baselines/
│       └── auth-system.json  # Regression baselines
```

---

## Output Format

### J.A.R.V.I.S. Format (Development)

```markdown
## J.A.R.V.I.S.: Eval Check (auth-system)

### Capability Evals
| Eval | Status | Attempts | Notes |
|------|--------|----------|-------|
| User registration | PASS | pass@1 | Clean implementation |
| Email validation | PASS | pass@2 | Required retry (edge case) |
| Password hashing | PASS | pass@1 | bcrypt verified |

### Regression Evals
| Eval | Status | Baseline |
|------|--------|----------|
| Login flow | PASS | abc123 |
| Session mgmt | PASS | abc123 |

### Metrics
- Capability pass@1: 67% (2/3)
- Capability pass@3: 100% (3/3)
- Regression pass^3: 100% (2/2)

### Recommendation
✅ **READY** - All evals passing, recommend proceeding to sync phase.
```

### F.R.I.D.A.Y. Format (Migration)

```markdown
## F.R.I.D.A.Y.: Migration Eval (legacy-auth → new-auth)

### Behavior Preservation Evals
| Module | Status | Components | Verified |
|--------|--------|------------|----------|
| Login | PASS | 5/5 | 100% |
| Session | PASS | 3/3 | 100% |
| Logout | PASS | 2/2 | 100% |

### Migration Completion: 10/10 (100%)
### Regression pass^3: 100%

<jikime>EVAL_COMPLETE</jikime>
```

---

## Auto-Suggest Feature

When using `--auto-suggest`, Claude analyzes:

1. **SPEC documents** → Extract requirements as evals
2. **Existing tests** → Create regression evals
3. **Function signatures** → Suggest capability evals
4. **Error handlers** → Suggest edge case evals

```bash
/jikime:eval define payment-flow --auto-suggest

# Output:
Suggested Capability Evals:
  1. Can process credit card payment
  2. Can handle payment decline
  3. Can issue refund

Suggested Regression Evals:
  1. Existing order flow unchanged
  2. Cart calculations correct

Accept suggestions? [y/n/edit]
```

---

## CI/CD Integration

### JSON Export

```bash
/jikime:eval report auth-system --json > eval-results.json
```

```json
{
  "eval_name": "auth-system",
  "timestamp": "2024-01-22T10:30:00Z",
  "status": "READY",
  "capability_evals": {
    "total": 3,
    "passing": 3,
    "pass_at_1": 0.67,
    "pass_at_3": 1.00
  },
  "regression_evals": {
    "total": 2,
    "passing": 2,
    "pass_caret_3": 1.00
  },
  "recommendation": "SHIP"
}
```

### Exit Codes (--ci)

| Code | Meaning |
|------|---------|
| 0 | All evals passing |
| 1 | Capability evals failing |
| 2 | Regression evals failing (CRITICAL) |
| 3 | Both failing |

---

## EXECUTION DIRECTIVE

1. Parse subcommand from $ARGUMENTS
2. For `define`:
   - Create `.jikime/evals/<name>.md` with template
   - If `--auto-suggest`, analyze code for suggestions
   - Prompt user to confirm/edit criteria
3. For `check`:
   - Load eval definition
   - Run each eval (code grader → immediate, model → Claude assess)
   - Record results in `.jikime/evals/<name>.log`
   - Update metrics in `.jikime/evals/<name>.json`
4. For `report`:
   - Generate comprehensive report
   - Use orchestrator-appropriate format (J.A.R.V.I.S./F.R.I.D.A.Y.)
   - If `--json`, output JSON instead
5. For `list`:
   - Scan `.jikime/evals/*.md`
   - Show status summary for each

Execute NOW. Do NOT just describe.

---

## Related Commands

- `/jikime:test` - Run actual tests (code grader uses this)
- `/jikime:verify` - Comprehensive quality verification
- `/jikime:1-plan` - Create SPEC for eval definition
- `/jikime:2-run` - Implementation with continuous eval checks

---

Version: 1.0.0
Type: Utility Command (Type B)
Methodology: Eval-Driven Development (EDD)
