# Security Guidelines

Security best practices based on OWASP Top 10 and industry standards.

## OWASP Top 10 Quick Reference

| # | Vulnerability | Prevention |
|---|--------------|------------|
| A01 | **Injection** | Parameterized queries only, never string concatenation |
| A02 | **Broken Auth** | Strong passwords, httpOnly+secure cookies, session expiry |
| A03 | **Sensitive Data** | Sanitize logs (`[REDACTED]`), exclude sensitive fields from responses |
| A05 | **CSRF** | Use CSRF tokens in forms |
| A07 | **XSS** | Use framework defaults (React auto-escapes), sanitize with DOMPurify if HTML needed |

### Critical Patterns

```typescript
// Injection: ALWAYS parameterized
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId])

// Sensitive Data: ALWAYS exclude
const { passwordHash, ...safeUser } = user
return safeUser

// Env Vars: NEVER hardcode
const apiKey = process.env.API_KEY
if (!apiKey) throw new Error('API_KEY not set')
```

## Secret Management

### Detection Patterns

Check for: `sk-`, `pk-`, `api_` prefixes, `-----BEGIN` private keys, connection strings with credentials, JWT secrets in code.

### .gitignore Requirements

```gitignore
.env
.env.local
.env.*.local
*.pem
*.key
credentials.json
secrets/
```

## Input Validation

ALWAYS validate at system boundaries using schema validation (Zod recommended):

```typescript
const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(50).trim()
})
```

### File Upload Security

- Max file size limit (e.g., 5MB)
- Whitelist allowed MIME types
- Limit file count per request

## Security Response Protocol

| Level | Examples | Action |
|-------|----------|--------|
| **CRITICAL** | Exposed secrets, RCE | Fix immediately, rotate secrets |
| **HIGH** | SQL injection, auth bypass | Fix before merge |
| **MEDIUM** | XSS, CSRF | Should fix soon |
| **LOW** | Information disclosure | Plan to fix |

**If CRITICAL/HIGH found**: STOP → Fix → Rotate exposed secrets → Review codebase for similar issues → Add regression test.

## Security Checklist

Before ANY commit:

- [ ] No hardcoded secrets
- [ ] All user inputs validated
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection (if applicable)
- [ ] Authentication verified
- [ ] Authorization checked
- [ ] Sensitive data not logged
- [ ] Error messages don't leak info
- [ ] Dependencies up to date

---

Version: 2.0.0
Source: JikiME-ADK security rules (condensed - OWASP examples consolidated)
