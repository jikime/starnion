---
description: "Multi-perspective parallel analysis - Architecture, Security, Performance, Testing in one command"
argument-hint: "[@path] [--focus arch|security|perf|test] [--depth quick|standard|deep]"
type: utility
allowed-tools: Task, TodoWrite, Bash, Read, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Multi-Perspective Analysis

Analyze code from 4 orthogonal perspectives simultaneously using parallel subagents.

Target: $ARGUMENTS

---

## Core Philosophy

```
Single command for comprehensive multi-angle analysis:
┌─────────────────────────────────────────────────────────────┐
│                  PARALLEL PERSPECTIVE ANALYSIS              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  │ ARCHITECTURE│  │  SECURITY   │  │ PERFORMANCE │  │  TESTING    │
│  │   Agent     │  │   Agent     │  │   Agent     │  │   Agent     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
│         │                │                │                │
│         ▼                ▼                ▼                ▼
│  Structure,       Vulnerabilities,  Complexity,      Coverage,
│  Coupling,        OWASP Top 10,     Bottlenecks,     Edge Cases,
│  SOLID, DRY       Input Validation  Caching,         Mocking
│                                     Memory Leaks
│                                                             │
│         └────────────────┬────────────────┘                 │
│                          ▼                                  │
│              ┌─────────────────────┐                        │
│              │   SYNTHESIS AGENT   │                        │
│              │  Cross-perspective  │                        │
│              │     Integration     │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Usage

```bash
# Analyze entire project
/jikime:perspective

# Analyze specific path
/jikime:perspective @src/api/

# Focus on specific perspective
/jikime:perspective --focus security

# Deep analysis (more thorough)
/jikime:perspective --depth deep

# Quick scan
/jikime:perspective --depth quick

# Combine options
/jikime:perspective @src/auth/ --focus security --depth deep
```

---

## Depth Profiles

| Profile | Description | Time Estimate |
|---------|-------------|---------------|
| `quick` | Surface-level scan, obvious issues | ~1 min |
| `standard` | Balanced analysis (default) | ~3 min |
| `deep` | Comprehensive analysis, edge cases | ~5 min |

---

## Perspective Details

### 1. Architecture Perspective

**Focus Areas**:
- Module structure and boundaries
- Coupling and cohesion metrics
- SOLID principle compliance
- DRY violations (code duplication)
- Dependency direction (inward vs outward)
- Layer separation (presentation, business, data)

**Output**:
```markdown
### Architecture Analysis

**Structure Score**: 85/100

| Metric | Status | Details |
|--------|--------|---------|
| Coupling | ⚠️ | High coupling in `UserService` ↔ `OrderService` |
| Cohesion | ✅ | Modules are well-focused |
| SOLID | ⚠️ | SRP violation in `ApiHandler` (3 responsibilities) |
| DRY | ✅ | No significant duplication detected |

**Recommendations**:
1. Extract shared logic from UserService/OrderService to common module
2. Split ApiHandler into AuthHandler, DataHandler, ErrorHandler
```

### 2. Security Perspective

**Focus Areas**:
- OWASP Top 10 vulnerabilities
- Input validation and sanitization
- Authentication/authorization patterns
- Secret management
- SQL/NoSQL injection risks
- XSS and CSRF vulnerabilities
- Dependency vulnerabilities

**Output**:
```markdown
### Security Analysis

**Risk Score**: 72/100 (Medium Risk)

| Category | Status | Findings |
|----------|--------|----------|
| Injection | ⚠️ | 2 potential SQL injection points |
| Auth | ✅ | Proper JWT validation |
| Secrets | ✅ | No hardcoded secrets |
| Input Validation | ❌ | Missing validation in 3 endpoints |
| Dependencies | ⚠️ | 1 known vulnerability (lodash) |

**Critical Findings**:
1. `src/api/users.ts:45` - User input directly in SQL query
2. `src/api/search.ts:23` - Missing input sanitization

**Recommendations**:
1. Use parameterized queries for all database operations
2. Add Zod schema validation for all API endpoints
```

### 3. Performance Perspective

**Focus Areas**:
- Algorithm complexity (Big O)
- Database query efficiency (N+1 problems)
- Memory usage patterns
- Caching opportunities
- Async/await patterns
- Bundle size impact
- Render performance (React/Vue)

**Output**:
```markdown
### Performance Analysis

**Efficiency Score**: 78/100

| Area | Status | Details |
|------|--------|---------|
| Complexity | ⚠️ | O(n²) loop in `processItems()` |
| Database | ❌ | N+1 query in `getUserOrders()` |
| Memory | ✅ | No memory leaks detected |
| Caching | ⚠️ | Missing cache for `fetchConfig()` |
| Async | ✅ | Proper Promise handling |

**Bottlenecks Identified**:
1. `src/services/order.ts:89` - Nested loop O(n²), consider Map lookup
2. `src/api/users.ts:34` - N+1 query, use eager loading

**Recommendations**:
1. Replace nested loop with Map for O(n) complexity
2. Add `.include()` for related entities
3. Implement Redis cache for config data
```

### 4. Testing Perspective

**Focus Areas**:
- Test coverage analysis
- Missing test scenarios
- Edge case coverage
- Mocking strategy
- Test quality (assertions, isolation)
- E2E test coverage for critical paths
- Test maintainability

**Output**:
```markdown
### Testing Analysis

**Coverage Score**: 82/100

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Line Coverage | 78% | 80% | ⚠️ |
| Branch Coverage | 65% | 70% | ❌ |
| Critical Paths | 90% | 100% | ⚠️ |

**Uncovered Areas**:
1. `src/auth/oauth.ts` - 0% coverage (critical!)
2. `src/api/webhook.ts` - Error handling branch uncovered
3. `src/utils/parser.ts` - Edge cases not tested

**Missing Test Scenarios**:
1. OAuth flow error handling
2. Webhook signature validation failure
3. Parser with malformed input

**Recommendations**:
1. Add unit tests for OAuth error scenarios
2. Add integration test for webhook flow
3. Add property-based tests for parser
```

---

## Synthesis Report

After all perspectives complete, a synthesis agent combines findings:

```markdown
## Multi-Perspective Analysis: Synthesis Report

### Executive Summary
- **Overall Health Score**: 79/100
- **Critical Issues**: 2
- **Warnings**: 8
- **Recommendations**: 12

### Cross-Perspective Insights

| Finding | Perspectives | Priority |
|---------|--------------|----------|
| SQL injection in users.ts | Security + Testing (untested) | CRITICAL |
| N+1 query pattern | Performance + Architecture | HIGH |
| Missing OAuth tests | Testing + Security | HIGH |
| SRP violation in ApiHandler | Architecture | MEDIUM |

### Prioritized Action Items

**Immediate (This PR)**:
1. Fix SQL injection vulnerabilities (Security)
2. Add input validation (Security + Testing)

**Short-term (This Sprint)**:
3. Refactor N+1 queries (Performance)
4. Add OAuth error tests (Testing)
5. Split ApiHandler (Architecture)

**Technical Debt Backlog**:
6. Implement caching layer (Performance)
7. Increase branch coverage to 70% (Testing)

### Perspective Correlation Matrix

```
              Arch    Sec     Perf    Test
Architecture    -     LOW     HIGH    MED
Security       LOW     -      LOW     HIGH
Performance   HIGH    LOW      -      MED
Testing        MED    HIGH    MED      -
```

Note: HIGH correlation means issues in one area often indicate issues in another.
```

---

## Focus Mode (--focus)

When `--focus` is specified, only run that perspective with deeper analysis:

```bash
/jikime:perspective --focus security
```

- Runs only Security perspective
- Uses `deep` depth automatically
- Provides more detailed findings
- Includes remediation code examples

---

## EXECUTION DIRECTIVE

1. Parse $ARGUMENTS:
   - Extract target path (default: project root)
   - Extract `--focus` option (default: all perspectives)
   - Extract `--depth` option (default: standard)

2. **Launch 4 perspective subagents in PARALLEL** (CRITICAL: single Task message):

   ```
   Task 1: Architecture Analysis
   - prompt: "You are an Architecture Analyst. Analyze [target] for structure, coupling, SOLID compliance..."
   - run_in_background: true

   Task 2: Security Analysis
   - prompt: "You are a Security Analyst. Analyze [target] for OWASP Top 10, input validation..."
   - run_in_background: true

   Task 3: Performance Analysis
   - prompt: "You are a Performance Analyst. Analyze [target] for complexity, bottlenecks..."
   - run_in_background: true

   Task 4: Testing Analysis
   - prompt: "You are a Testing Analyst. Analyze [target] for coverage, missing tests..."
   - run_in_background: true
   ```

3. Collect results with TaskOutput for each agent

4. Run Synthesis:
   - Cross-reference findings across perspectives
   - Identify correlated issues
   - Prioritize action items
   - Generate correlation matrix

5. Format output using orchestrator-appropriate style (J.A.R.V.I.S. or F.R.I.D.A.Y.)

6. If `--focus` specified, run only that perspective with deep depth

Execute NOW. Do NOT just describe.

---

## Related Commands

- `/jikime:verify` - Quality verification with adversarial review
- `/jikime:security` - Deep security analysis only
- `/jikime:architect` - Architecture review and design
- `/jikime:analyze` - General codebase analysis

---

Version: 1.0.0
Type: Utility Command (Type B)
Integration: Parallel Execution, Multi-Perspective Analysis
