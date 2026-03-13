# Debug Context

**Mode**: Problem Investigation & Resolution
**Focus**: Root cause analysis, systematic debugging
**Principle**: Hypothesize → Test → Verify

## Core Principles

```
1. Reproduce first  → 문제 재현 확인
2. Isolate the issue → 원인 범위 좁히기
3. Find root cause  → 표면 증상이 아닌 근본 원인
4. Verify the fix   → 수정 후 재발 방지 확인
```

## Behavior Rules

### DO
- Reproduce the bug before investigating
- Read error messages carefully
- Check recent changes (git log/diff)
- Use binary search to isolate issues
- Verify fix doesn't break other things

### DON'T
- Guess without evidence
- Apply fixes without understanding cause
- Ignore stack traces
- Skip reproduction steps
- Fix symptoms instead of root cause

## Debug Process

```
┌─────────────────────────────────────────┐
│           Debug Workflow                │
├─────────────────────────────────────────┤
│  1. REPRODUCE                           │
│     └─ Can we consistently trigger it?  │
│              ↓                          │
│  2. GATHER INFO                         │
│     └─ Error messages, logs, stack      │
│              ↓                          │
│  3. HYPOTHESIZE                         │
│     └─ What could cause this?           │
│              ↓                          │
│  4. ISOLATE                             │
│     └─ Binary search to narrow scope    │
│              ↓                          │
│  5. ROOT CAUSE                          │
│     └─ Why does this happen?            │
│              ↓                          │
│  6. FIX & VERIFY                        │
│     └─ Fix and confirm resolution       │
└─────────────────────────────────────────┘
```

## Tool Preferences

| Priority | Tool | Use Case |
|----------|------|----------|
| 1 | Read | Examine error locations |
| 2 | Grep | Find related code |
| 3 | Bash | Run tests, check logs |
| 4 | LSP | Trace definitions, references |
| 5 | Bash (git) | Check recent changes |

## Debug Strategies

### Error Message Analysis
```markdown
Parse the error:
1. Error type (TypeError, ReferenceError, etc.)
2. Error message (what failed)
3. Stack trace (where it failed)
4. First line of YOUR code in stack
```

### Binary Search Isolation
```markdown
If bug appeared recently:
1. Find last known good state
2. Find current bad state
3. Test midpoint
4. Narrow down to specific change
```

### Common Bug Patterns

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| "undefined is not..." | Null reference | Optional chaining, null checks |
| Infinite loop | Missing exit condition | Loop conditions, recursion base |
| Race condition | Async timing | await, Promise handling |
| Wrong data | Type mismatch | Input validation, type coercion |
| Silent failure | Swallowed error | try/catch, error handling |

## Investigation Commands

```bash
# Recent changes that might cause bug
git log --oneline -20
git diff HEAD~5

# Find where error originates
grep -r "ErrorMessage" --include="*.ts"

# Check test status
npm test -- --watch

# Trace imports/dependencies
grep -r "import.*SuspectModule"
```

## Output Style

```markdown
## Debug Report: [Issue Description]

### Symptoms
- What: [Observable behavior]
- When: [Trigger conditions]
- Where: [Affected area]

### Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Expected vs Actual]

### Investigation

**Hypothesis 1**: [Theory]
- Evidence: [What supports/refutes]
- Result: ✅ Confirmed / ❌ Ruled out

**Hypothesis 2**: [Theory]
- Evidence: [What supports/refutes]
- Result: ✅ Confirmed / ❌ Ruled out

### Root Cause
[Detailed explanation of why the bug occurs]

Location: `path/to/file.ts:line`

### Fix

```typescript
// Before (buggy)
[old code]

// After (fixed)
[new code]
```

### Verification
- [ ] Bug no longer reproduces
- [ ] Existing tests pass
- [ ] New test added for this case
- [ ] No regression in related features
```

## Quick Debugging Checklist

```markdown
□ Can I reproduce it consistently?
□ Did I read the full error message?
□ Did I check the stack trace?
□ What changed recently?
□ Is the input data correct?
□ Are all dependencies loaded?
□ Is async/await handled correctly?
□ Are there any null/undefined values?
```

## Quick Reference

```bash
# This context is for:
- Investigating errors
- Finding root causes
- Fixing bugs systematically
- Understanding failures

# Switch to other contexts:
- @contexts/dev.md       → Ready to implement fix
- @contexts/research.md  → Need to understand system better
- @contexts/review.md    → Verify fix quality
```

---

Version: 1.0.0
Principle: Root Cause > Symptoms
