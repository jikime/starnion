---
description: "Refactor code for better quality. Apply clean code principles while preserving behavior with DDD methodology."
context: dev
---

# Refactor

**Context**: @.claude/contexts/dev.md (Auto-loaded)

Improve code quality using DDD methodology.

## Usage

```bash
# Refactor specific file
/jikime:refactor @src/services/order.ts

# Refactor with specific pattern
/jikime:refactor @src/utils/ --pattern extract-function

# Safe mode (extra tests)
/jikime:refactor @src/core/ --safe

# Preview changes
/jikime:refactor @src/auth/ --dry-run
```

## Options

| Option | Description |
|--------|-------------|
| `@path` | Files to refactor |
| `--pattern` | Pattern: extract-function, remove-duplication |
| `--safe` | Extra characterization tests |
| `--dry-run` | Preview without applying |

## DDD Approach

```
ANALYZE → PRESERVE → IMPROVE

1. ANALYZE: Understand current behavior
2. PRESERVE: Create characterization tests
3. IMPROVE: Apply refactoring
4. VERIFY: Ensure tests pass
```

## Patterns

- **Extract Function**: Break large functions
- **Remove Duplication**: Consolidate similar code
- **Simplify Conditionals**: Flatten nested logic
- **Improve Naming**: Clarify intent

## Output

```markdown
## Refactoring Report

### Code Analyzed
src/services/order.ts (245 lines)

### Issues Found
1. Long function: calculateTotal (78 lines)
2. Deep nesting in processOrder (5 levels)
3. Duplicate validation logic

### Changes Applied
1. Extracted calculateSubtotal()
2. Extracted applyDiscount()
3. Flattened conditionals with early returns

### Metrics
| Metric | Before | After |
|--------|--------|-------|
| Lines | 245 | 180 |
| Max nesting | 5 | 3 |
| Functions | 4 | 8 |

### Verification
✅ All 12 tests passing
✅ Behavior preserved
```
