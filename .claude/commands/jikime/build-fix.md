---
description: "Fix TypeScript and build errors incrementally. One error at a time for safety."
context: debug
---

# Build Fix

**Context**: @.claude/contexts/debug.md (Auto-loaded)

Fix build and type errors incrementally.

## Usage

```bash
# Fix all build errors
/jikime:build-fix

# Fix specific file errors
/jikime:build-fix @src/services/order.ts

# Preview fixes without applying
/jikime:build-fix --dry-run
```

## Options

| Option | Description |
|--------|-------------|
| `@path` | Specific file to fix |
| `--dry-run` | Preview without applying |
| `--max` | Max errors to fix (default: 10) |

## Process

```
1. Run Build
   npm run build (or pnpm build)
        ↓
2. Parse Errors
   - Group by file
   - Sort by severity
        ↓
3. Fix Loop (per error)
   - Show context (5 lines)
   - Explain issue
   - Apply fix
   - Verify resolved
        ↓
4. Stop Conditions
   - Fix causes new errors
   - Same error 3x
   - User requests stop
        ↓
5. Summary Report
```

## Safety Rules

- **One error at a time** - Safety first
- **Verify after each fix** - Stop if new errors detected
- **Minimal changes** - Only the minimum necessary modifications

## Output

```markdown
## Build Fix Report

### Session
- Errors found: 8
- Errors fixed: 7
- Errors remaining: 1

### Fixed
1. TS2322: Type mismatch in order.ts:45
2. TS2339: Missing property in user.ts:12
3. TS2345: Argument type error in api.ts:78

### Remaining
1. TS2307: Cannot find module '@/lib/auth'
   → Needs package installation

### Build Status: ⚠️ Partial Success
```
