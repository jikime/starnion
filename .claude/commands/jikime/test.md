---
description: "Run tests quickly - unit, integration, coverage check"
argument-hint: "[--coverage | --unit | --integration | --watch | --fix]"
type: utility
allowed-tools: Task, TodoWrite, Bash, Read, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Test Runner

Quick test execution utility for rapid development cycles.

Test target: $ARGUMENTS

---

## Usage

```bash
# Run all tests
/jikime:test

# Run with coverage report
/jikime:test --coverage

# Run specific test type
/jikime:test --unit
/jikime:test --integration

# Watch mode for continuous testing
/jikime:test --watch

# Auto-fix failing tests if possible
/jikime:test --fix
```

---

## Options

| Option | Description |
|--------|-------------|
| `--coverage` | Generate coverage report |
| `--unit` | Unit tests only |
| `--integration` | Integration tests only |
| `--watch` | Watch mode for continuous testing |
| `--fix` | Auto-fix failing tests if possible |

---

## Test Process

```
1. Detect Test Framework
   - Vitest, Jest, Mocha, Pytest, Go test, etc.
        ↓
2. Run Tests
   - Execute based on flags
        ↓
3. Report Results
   - Pass: Show summary
   - Fail: Show details and suggestions
```

---

## Coverage Targets

| Type | Target |
|------|--------|
| Business Logic | 90%+ |
| API Endpoints | 80%+ |
| UI Components | 70%+ |
| Overall | 80%+ |

---

## Output Format

```markdown
## Test Results

### Summary
- Total: 68 tests
- Passed: 67 (98.5%)
- Failed: 1

### Failed Test Details
```
FAIL order/payment.test.ts
  ✕ should process refund correctly
    Expected: 100
    Received: 0
```

### Coverage (if --coverage)
| Category | Coverage | Target | Status |
|----------|----------|--------|--------|
| Statements | 85% | 80% | PASS |
| Branches | 78% | 75% | PASS |
| Functions | 82% | 80% | PASS |
```

---

## Framework Detection

Auto-detects test framework from project:

| File | Framework |
|------|-----------|
| `vitest.config.*` | Vitest |
| `jest.config.*` | Jest |
| `pytest.ini`, `pyproject.toml` | Pytest |
| `go.mod` | Go test |
| `Cargo.toml` | Cargo test |

---

## Related Commands

- `/jikime:e2e` - E2E tests with Playwright
- `/jikime:2-run` - Full implementation workflow (includes testing)
- `/jikime:build-fix` - Fix build errors

---

## EXECUTION DIRECTIVE

1. Detect test framework in project
2. Parse flags from $ARGUMENTS
3. Execute appropriate test command
4. Report results in markdown format
5. If failures, suggest fixes

Do NOT just describe. Execute the tests NOW.

---

Version: 1.0.0
Type: Utility Command (Type B)
