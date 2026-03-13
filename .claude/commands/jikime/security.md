---
description: "Run security audit. OWASP Top 10, dependency scan, secrets detection, and vulnerability report."
context: review
---

# Security

**Context**: @.claude/contexts/review.md (Auto-loaded)

Run security audit. OWASP Top 10 vulnerability detection, dependency scan, secrets detection.

## Usage

```bash
# Full security audit
/jikime:security

# Scan specific path
/jikime:security @src/api/

# Dependency audit only
/jikime:security --deps

# Secrets scan only
/jikime:security --secrets

# OWASP check only
/jikime:security --owasp
```

## Options

| Option | Description |
|--------|-------------|
| `[path]` | Target path to audit |
| `--deps` | Dependency vulnerability scan |
| `--secrets` | Hardcoded secrets detection |
| `--owasp` | OWASP Top 10 check |
| `--fix` | Auto-fix where possible |

[SOFT] Apply --ultrathink keyword for deep security analysis
WHY: Security auditing requires systematic threat modeling, vulnerability assessment, and attack surface analysis
IMPACT: Sequential thinking ensures comprehensive OWASP coverage and identification of complex multi-vector vulnerabilities

## OWASP Top 10 Checks

| # | Vulnerability | Detection |
|---|---------------|-----------|
| 1 | Injection | SQL, NoSQL, Command |
| 2 | Broken Auth | Password handling |
| 3 | Data Exposure | Hardcoded secrets |
| 4 | XSS | innerHTML, dangerouslySetInnerHTML |
| 5 | SSRF | Unvalidated URLs |
| 6 | Authorization | Missing permission checks |

## Severity Levels

| Level | Action |
|-------|--------|
| CRITICAL | Immediate fix required |
| HIGH | Fix before deployment |
| MEDIUM | Fix when possible |
| LOW | Review and decide |

## Output

```markdown
# Security Audit Report

**Date:** 2026-01-21
**Risk Level:** HIGH

## Summary
- Critical: 1
- High: 2
- Medium: 3
- Low: 5

## Critical Issues

### 1. Hardcoded API Key
**Location:** src/config.ts:15
**Issue:** API key exposed in source code
**Fix:**
\`\`\`typescript
// Before
const apiKey = "sk-proj-xxxxx"

// After
const apiKey = process.env.OPENAI_API_KEY
\`\`\`

## Dependency Vulnerabilities

| Package | Severity | Fix |
|---------|----------|-----|
| lodash | HIGH | Update to 4.17.21 |
```

## Quick Commands

```bash
# Check dependencies
npm audit

# High severity only
npm audit --audit-level=high

# Auto fix
npm audit fix
```

## Security Checklist

- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] Authentication required
- [ ] Authorization checks
- [ ] Rate limiting applied
- [ ] Dependencies up to date

## Related Commands

- `/jikime:refactor` - Code refactoring
- `/jikime:test` - Run security tests

---

Version: 1.0.0
