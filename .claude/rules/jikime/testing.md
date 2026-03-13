# Testing Guidelines

Testing best practices with DDD (Domain-Driven Development) methodology.

## Coverage Targets

| Type | Target | Priority |
|------|--------|----------|
| Business Logic | 90%+ | Critical |
| API Endpoints | 80%+ | High |
| UI Components | 70%+ | Medium |
| Utilities | 80%+ | Medium |
| **Overall** | **80%+** | Required |

## Test Types

| Type | Scope | Key Focus |
|------|-------|-----------|
| Unit | Individual functions/modules | Isolation, speed, pure logic |
| Integration | Component interactions | API endpoints, DB queries |
| E2E | Complete user flows | Critical paths, Playwright |

## DDD Testing Approach

### ANALYZE → PRESERVE → IMPROVE

1. **ANALYZE**: Run existing tests, identify gaps, understand current behavior
2. **PRESERVE**: Write characterization tests for uncovered code, capture baseline
3. **IMPROVE**: Implement changes, run all tests after each change, add new tests

### Characterization Tests

When code lacks tests, write characterization tests first — document what code **actually does**, not what it **should** do.

## Test Quality Principles (FIRST)

| Principle | Description |
|-----------|-------------|
| **Fast** | Run quickly, encourage frequent execution |
| **Isolated** | No dependencies between tests |
| **Repeatable** | Same result every time |
| **Self-validating** | Clear pass/fail, no manual check |
| **Timely** | Written close to the code change |

### Good Test Practices

- **Naming**: `should_expectedBehavior_when_condition`
- **Assertions**: Clear intent (`toBe('active')` not `toBeTruthy()`)
- **Single responsibility**: One concept per test

## Test Organization

```
src/
├── services/
│   ├── user.service.ts
│   └── user.service.test.ts     # Co-located unit tests
tests/
├── integration/                  # Integration tests
└── e2e/                          # E2E tests
```

## Mocking Guidelines

| Mock | Don't Mock |
|------|------------|
| External APIs | Your own code |
| Database (in unit tests) | Business logic |
| Time/Date | Pure functions |
| File system | Simple utilities |

## Testing Checklist

Before committing:

- [ ] All existing tests pass
- [ ] New code has tests
- [ ] Coverage maintained (80%+)
- [ ] No skipped tests without reason
- [ ] Tests are meaningful (not just for coverage)
- [ ] Edge cases covered
- [ ] Error scenarios tested

---

Version: 2.0.0
Methodology: DDD (ANALYZE-PRESERVE-IMPROVE)
Source: JikiME-ADK testing rules (condensed - removed standard code examples)
