# Sync Context

**Mode**: Documentation Synchronization
**Focus**: Document generation, quality verification, git operations
**Methodology**: Sync to Verify to Commit

## Core Principles

```
1. Analyze changes  → 변경된 코드 분석
2. Update docs      → 문서 동기화
3. Verify quality   → 품질 검증
4. Commit changes   → 변경사항 커밋
```

## Behavior Rules

### DO
- Analyze git changes before sync
- Update only affected documentation
- Verify link integrity after sync
- Follow TRUST 5 principles
- Create meaningful commit messages
- Delegate to specialized agents

### DON'T
- Regenerate unchanged docs
- Skip quality verification
- Commit without review option
- Create unnecessary documentation
- Break existing document links

## Sync Phases

```
PHASE 0.5: Quality Verification
    ↓
PHASE 1: Analysis & Planning
    ↓
PHASE 2: Execute Sync
    ↓
PHASE 3: Git Operations
```

## Tool Preferences

| Priority | Tool | Use Case |
|----------|------|----------|
| 1 | Task | Delegate to manager-docs, manager-quality |
| 2 | Bash | Git operations, quality checks |
| 3 | Read | Analyze existing docs |
| 4 | Write/Edit | Update documentation |
| 5 | Grep/Glob | Find affected files |

## Agent Delegation

```yaml
manager-docs:
  purpose: Documentation generation and update
  tasks:
    - README synchronization
    - CODEMAP updates
    - SPEC status sync
    - API documentation

manager-quality:
  purpose: Quality verification
  tasks:
    - TRUST 5 compliance check
    - Link integrity verification
    - Consistency validation

manager-git:
  purpose: Git operations
  tasks:
    - Stage documentation files
    - Create commits
    - PR management (Team mode)
```

## Documentation Standards

```yaml
readme:
  sections:
    - Project overview
    - Quick start
    - Architecture reference
    - Features list

codemaps:
  structure:
    - INDEX.md (overview)
    - Domain-specific maps
  format:
    - ASCII diagrams
    - Key modules table
    - Data flow description

spec_docs:
  sync_fields:
    - Status (Planning → In Progress → Completed)
    - Progress percentage
    - Implementation notes
```

## Quality Verification

### TRUST 5 Checklist

```
T - Tested: All links working
R - Readable: Clear structure, proper formatting
U - Unified: Consistent terminology
S - Secured: No sensitive data exposed
T - Trackable: Version info, timestamps
```

### Verification Commands

```bash
# Link check
grep -r "\[.*\](.*)" docs/ | while read link; do ...

# Freshness check
find docs/ -name "*.md" -mtime +30
```

## Output Style

When syncing:

```markdown
## Sync Complete

### Quality Verification
- Tests: PASS
- Linter: PASS (2 warnings)
- Types: PASS

### Documents Updated
| File | Action | Status |
|------|--------|--------|
| README.md | Updated | SUCCESS |

### TRUST 5 Compliance
- Link Integrity: PASS
- Consistency: PASS
- Freshness: PASS

### Git Status
- Staged files: 4
- Ready to commit: Yes/No
```

## Quick Reference

```bash
# This context is for:
- Documentation synchronization
- Quality verification
- Git commit preparation
- SPEC status updates

# Switch to other contexts:
- @contexts/dev.md      → Continue development
- @contexts/review.md   → Code review before sync
- @contexts/planning.md → Plan next feature
```

---

Version: 1.0.0
Methodology: Sync to Verify to Commit
