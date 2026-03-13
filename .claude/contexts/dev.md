# Development Context

**Mode**: Active Development
**Focus**: Implementation, coding, building features
**Methodology**: DDD (ANALYZE → PRESERVE → IMPROVE)

## Core Principles

```
1. Get it working   → 먼저 동작하게
2. Get it right     → 그 다음 정확하게
3. Get it clean     → 마지막으로 깔끔하게
```

## Behavior Rules

### DO
- Write code first, explain after
- Prefer working solutions over perfect solutions
- Run tests after changes
- Keep commits atomic and focused
- Follow existing code patterns
- Handle errors explicitly

### DON'T
- Over-engineer simple solutions
- Add features not requested
- Skip error handling
- Leave console.log in production code
- Ignore existing tests

## DDD Cycle

Before modifying existing code:

```
ANALYZE   → Understand current behavior
PRESERVE  → Ensure tests cover existing behavior
IMPROVE   → Implement changes incrementally
```

## Tool Preferences

| Priority | Tool | Use Case |
|----------|------|----------|
| 1 | Edit | Modify existing files |
| 2 | Write | Create new files |
| 3 | Bash | Run tests, builds, commands |
| 4 | Grep/Glob | Find code patterns |
| 5 | Read | Understand before editing |

## Coding Standards

```yaml
files:
  max_lines: 400
  organization: by_feature

functions:
  max_lines: 50
  max_nesting: 4
  single_responsibility: true

error_handling:
  explicit: true
  user_friendly_messages: true

testing:
  write_tests: after_implementation
  coverage_target: 80%
```

## Output Style

When implementing:

```markdown
## Implementation

### Changes Made
- [file]: [what changed]

### New Files
- [path]: [purpose]

### Tests
- [x] Existing tests pass
- [x] New tests added

### Next Steps
[if any]
```

## Quick Reference

```bash
# This context is for:
- Feature implementation
- Bug fixes
- Code modifications
- Refactoring with tests

# Switch to other contexts:
- @contexts/planning.md  → Before starting complex work
- @contexts/debug.md     → When stuck on errors
- @contexts/review.md    → Before committing
```

---

Version: 1.0.0
Methodology: DDD (ANALYZE-PRESERVE-IMPROVE)
