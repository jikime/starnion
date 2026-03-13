---
description: "Dead code detection and safe removal with comprehensive analysis tools and DELETION_LOG tracking"
argument-hint: "[scan|remove|report|log] [--safe|--careful|--deps|--exports|--files|--dry-run]"
type: utility
allowed-tools: Task, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Code Cleanup

Comprehensive dead code detection and safe removal integrated with DDD methodology and TRUST 5 quality framework.

Target: $ARGUMENTS

---

## Core Philosophy

```
Safety first, then clean:
├─ Analyze before removing
├─ Categorize by risk level
├─ Test after each removal
├─ Track all deletions
└─ Preserve behavior (DDD aligned)
```

---

## Usage

```bash
# Scan for dead code (analysis only)
/jikime:cleanup scan

# Safe removal (only low-risk items)
/jikime:cleanup remove --safe

# Careful removal (medium-risk with confirmation)
/jikime:cleanup remove --careful

# Specific targets
/jikime:cleanup remove --deps      # Unused npm dependencies
/jikime:cleanup remove --exports   # Unused exports
/jikime:cleanup remove --files     # Unused files

# Dry run (show what would be removed)
/jikime:cleanup scan --dry-run

# View deletion history
/jikime:cleanup log

# Generate cleanup report
/jikime:cleanup report
```

---

## Options

| Option | Description |
|--------|-------------|
| `scan` | Analyze codebase for dead code (no changes) |
| `remove` | Remove detected dead code |
| `report` | Generate comprehensive cleanup report |
| `log` | View DELETION_LOG.md history |
| `--safe` | Only remove low-risk items |
| `--careful` | Include medium-risk with verification |
| `--deps` | Target unused dependencies |
| `--exports` | Target unused exports |
| `--files` | Target unused files |
| `--dry-run` | Show what would be removed |

---

## Analysis Tools

### 1. knip - Comprehensive Dead Code Detection

```bash
# Install if not present
npm list knip || npm install -D knip

# Run full analysis
npx knip

# JSON output for processing
npx knip --reporter json > .jikime/cleanup/knip-report.json
```

**Detects**:
- Unused files
- Unused exports
- Unused dependencies
- Unused devDependencies
- Unused types

### 2. depcheck - Dependency Analysis

```bash
# Install if not present
npm list depcheck || npm install -D depcheck

# Run analysis
npx depcheck

# JSON output
npx depcheck --json > .jikime/cleanup/depcheck-report.json
```

**Detects**:
- Unused dependencies
- Missing dependencies
- Phantom dependencies

### 3. ts-prune - TypeScript Export Analysis

```bash
# Install if not present
npm list ts-prune || npm install -D ts-prune

# Run analysis
npx ts-prune

# Filter by threshold
npx ts-prune | grep -v "used in module"
```

**Detects**:
- Unused exports
- Unused types
- Dead code paths

### 4. ESLint Unused Directives

```bash
# Check for unused eslint-disable comments
npx eslint . --report-unused-disable-directives
```

---

## Risk Classification

### SAFE (Auto-removable)

| Category | Risk | Verification |
|----------|------|--------------|
| Unused npm dependencies | Low | depcheck + grep |
| Unused devDependencies | Low | depcheck |
| Commented-out code | Low | Visual inspection |
| Unused imports | Low | ESLint + knip |
| Unused eslint-disable | Low | ESLint report |

### CAREFUL (Requires confirmation)

| Category | Risk | Verification |
|----------|------|--------------|
| Unused exports | Medium | knip + grep |
| Unused internal files | Medium | knip + git history |
| Unused types/interfaces | Medium | ts-prune |
| Dead code branches | Medium | Code coverage |

### RISKY (Manual review required)

| Category | Risk | Verification |
|----------|------|--------------|
| Public API exports | High | API tests |
| Shared utilities | High | Cross-project grep |
| Dynamic imports | High | String pattern search |
| Reflection-based code | High | Runtime testing |

---

## Cleanup Workflow

### Phase 1: Scan

```
1. Run all analysis tools in parallel:
   - knip (comprehensive)
   - depcheck (dependencies)
   - ts-prune (exports)
   - eslint (directives)

2. Aggregate findings into categories:
   - SAFE: Immediately removable
   - CAREFUL: Needs confirmation
   - RISKY: Needs manual review

3. Generate scan report
```

### Phase 2: Verification

```
For SAFE items:
  → Grep search for any references
  → Check dynamic import patterns
  → Verify not in public API

For CAREFUL items:
  → Review git history
  → Check cross-module usage
  → Run affected tests

For RISKY items:
  → Flag for human review
  → Document reasoning
  → Skip automatic removal
```

### Phase 3: Removal

```
1. Create backup branch: cleanup/YYYY-MM-DD

2. Remove by category (safest first):
   a. Unused npm dependencies
   b. Unused devDependencies
   c. Unused imports
   d. Unused exports
   e. Unused files

3. After each category:
   → Run build
   → Run tests
   → Commit if passing

4. Update DELETION_LOG.md
```

### Phase 4: Validation

```
1. Full build verification
2. Full test suite
3. Coverage comparison
4. Bundle size comparison
5. Generate final report
```

---

## DELETION_LOG.md Format

All deletions are tracked in `docs/DELETION_LOG.md`:

```markdown
# Code Deletion Log

This log tracks all code cleanup operations for audit and recovery purposes.

---

## [YYYY-MM-DD] Cleanup Session

**Operator**: J.A.R.V.I.S.
**Branch**: cleanup/2024-01-22
**Tools Used**: knip, depcheck, ts-prune

### Summary

| Category | Items Removed | Lines Removed | Size Impact |
|----------|---------------|---------------|-------------|
| Dependencies | 5 | - | -120 KB |
| Files | 12 | 1,450 | -45 KB |
| Exports | 23 | 89 | - |
| **Total** | **40** | **1,539** | **-165 KB** |

### Unused Dependencies Removed

| Package | Version | Last Used | Size | Reason |
|---------|---------|-----------|------|--------|
| lodash | 4.17.21 | Never | 72 KB | Not imported anywhere |
| moment | 2.29.4 | 2023-06 | 48 KB | Replaced by date-fns |

### Unused Files Deleted

| File | Lines | Last Modified | Reason |
|------|-------|---------------|--------|
| src/utils/deprecated.ts | 120 | 2023-08-15 | No imports |
| src/components/OldButton.tsx | 85 | 2023-09-01 | Replaced by Button.tsx |

### Unused Exports Removed

| File | Export | Type | Reason |
|------|--------|------|--------|
| src/lib/helpers.ts | formatOld() | function | No references |
| src/types/legacy.ts | OldConfig | type | No references |

### Verification

- [x] Build passes
- [x] All tests pass (47/47)
- [x] No console errors
- [x] Bundle size reduced

### Recovery

If issues occur, revert with:
```bash
git revert HEAD~[N]  # N = number of cleanup commits
npm install
```

---

## History

| Date | Items | Lines | Size | Operator |
|------|-------|-------|------|----------|
| 2024-01-22 | 40 | 1,539 | -165 KB | J.A.R.V.I.S. |
| 2024-01-15 | 12 | 450 | -32 KB | J.A.R.V.I.S. |
```

---

## Output Format

### J.A.R.V.I.S. Format

```markdown
## J.A.R.V.I.S.: Cleanup Scan Complete

### Dead Code Summary
| Category | Found | Risk | Action |
|----------|-------|------|--------|
| Dependencies | 5 | SAFE | Auto-remove |
| Exports | 23 | CAREFUL | Review |
| Files | 12 | CAREFUL | Review |
| Dynamic refs | 2 | RISKY | Skip |

### Recommended Actions

**Immediate (SAFE)**:
1. Remove 5 unused dependencies (-120 KB)
2. Remove 15 unused imports

**Review Required (CAREFUL)**:
1. 12 files appear unused but check git history
2. 23 exports not directly referenced

**Manual Review (RISKY)**:
1. `src/lib/dynamic.ts` - uses dynamic imports
2. `src/api/reflection.ts` - uses reflection

### Estimated Impact
- Bundle size: -165 KB (~8% reduction)
- Lines of code: -1,539
- Files: -12

Proceed with --safe removal? Use: /jikime:cleanup remove --safe
```

### F.R.I.D.A.Y. Format

```markdown
## F.R.I.D.A.Y.: Migration Cleanup

### Legacy Code Status
| Module | Dead Code | Migrated | Clean |
|--------|-----------|----------|-------|
| Auth | 5 items | Yes | No |
| Users | 0 items | Yes | Yes |
| Products | 12 items | Yes | No |

### Migration-Safe Removal
Only removing code that has been:
- Fully migrated to target framework
- Verified by characterization tests
- Not referenced in migration artifacts

### Removal Queue
1. Legacy Auth module (after migration verified)
2. Old Products components (characterization tests passing)
```

---

## DDD Integration

Cleanup follows the ANALYZE-PRESERVE-IMPROVE cycle:

```
ANALYZE:
  → Scan for dead code patterns
  → Identify behavioral impact
  → Check test coverage

PRESERVE:
  → Ensure characterization tests exist
  → Verify no behavior change
  → Create backup branch

IMPROVE:
  → Remove verified dead code
  → Update documentation
  → Track in DELETION_LOG.md
```

---

## TRUST 5 Integration

| Principle | Cleanup Alignment |
|-----------|-------------------|
| **T**ested | Run tests after each removal |
| **R**eadable | Remove noise, improve clarity |
| **U**nified | Consolidate duplicates |
| **S**ecured | Remove vulnerable dependencies |
| **T**rackable | DELETION_LOG.md audit trail |

---

## Safety Checklist

Before any removal:
- [ ] Backup branch created
- [ ] All analysis tools run
- [ ] Risk classification complete
- [ ] Test coverage verified
- [ ] Git history reviewed

After each removal batch:
- [ ] Build succeeds
- [ ] Tests pass
- [ ] No console errors
- [ ] Committed with clear message
- [ ] DELETION_LOG.md updated

---

## EXECUTION DIRECTIVE

1. Parse $ARGUMENTS for command and options
2. For `scan`:
   - Run knip, depcheck, ts-prune in parallel
   - Aggregate and classify findings
   - Report summary with risk levels
3. For `remove`:
   - Create backup branch
   - Filter by risk level based on flags
   - Remove in safe order (deps → imports → exports → files)
   - Run build + tests after each category
   - Update DELETION_LOG.md
   - Commit changes
4. For `report`:
   - Generate comprehensive cleanup report
   - Include before/after metrics
   - List all potential removals by risk
5. For `log`:
   - Display DELETION_LOG.md history

Execute NOW. Do NOT just describe.

---

## Related Commands

- `/jikime:refactor` - Code refactoring with DDD
- `/jikime:codemap` - Architecture documentation
- `/jikime:verify` - Quality verification
- `/jikime:test` - Test execution

---

Version: 1.0.0
Type: Utility Command (Type B)
Integration: knip, depcheck, ts-prune, DDD, TRUST 5
