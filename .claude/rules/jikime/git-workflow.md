# Git Workflow Rules

Git conventions and workflow guidelines for consistent version control.

## Branching Strategies

### GitHub Flow (Recommended for most projects)

```
main ──●────●────●────●────●── (always deployable)
        \          /
feature  └──●──●──┘
```

- `main` is always deployable
- Feature branches from main → PR + review + merge → Deploy

### Git Flow (For release-based projects)

```
main     ──●─────────────●────── (releases only)
            \           /
release      └────●────┘
                 /
develop  ──●──●────●──●──●──
            \     /
feature      └──●┘
```

Use when: Multiple releases in production, formal release cycle, hotfix branches needed.

## Commit Message Format

```
<type>(<scope>): <description>

[optional body]
[optional footer(s)]
```

### Commit Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code refactoring (no behavior change) |
| `docs` | Documentation changes |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |
| `ci` | CI/CD changes |
| `style` | Formatting, no logic change |

### Examples

```bash
# Simple
feat: add user authentication with JWT
fix: resolve memory leak in WebSocket handler

# With scope and body
feat(auth): add OAuth2 login support

Implements Google and GitHub OAuth providers.
Closes #123

BREAKING CHANGE: Session tokens now expire after 24h
```

## Pull Request Workflow

1. Analyze **full commit history** (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary with test plan
4. Push with `-u` flag if new branch

### PR Size Guidelines

| Size | Lines | Guidance |
|------|-------|---------|
| **XS** | < 50 | Quick review |
| **S** | 50-200 | Standard review |
| **M** | 200-500 | Thorough review |
| **L** | 500+ | **Split if possible** |

## Feature Implementation Workflow

### DDD Approach (JikiME Standard)

Use **manager-ddd** subagent:
1. **ANALYZE**: Understand existing behavior
2. **PRESERVE**: Write characterization tests
3. **IMPROVE**: Implement with test validation

### Code Review → Commit & Push

- Use **manager-quality** subagent for review
- Follow conventional commits format
- Reference related issues

## Branch Naming

```
<type>/<description>
```

| Type | Usage | Example |
|------|-------|---------|
| `feature/` | New features | `feature/AUTH-123-oauth-login` |
| `fix/` | Bug fixes | `fix/BUG-456-null-pointer` |
| `refactor/` | Refactoring | `refactor/validation-module` |
| `docs/` | Documentation | `docs/api-v2-endpoints` |
| `chore/` | Maintenance | `chore/TECH-789-upgrade-deps` |

## Git Checklist

Before pushing:

- [ ] Commit messages follow conventional format
- [ ] Branch name is descriptive
- [ ] No sensitive data in commits (secrets, API keys)
- [ ] Tests pass locally
- [ ] Code is properly formatted

Before merging PR:

- [ ] All CI checks pass
- [ ] Code review completed
- [ ] Conflicts resolved
- [ ] Documentation updated if needed

## Prohibited Practices

| Practice | Reason |
|----------|--------|
| Force push to main/master | Destroys history |
| Committing secrets | Security risk |
| Large monolithic commits | Hard to review/revert |
| Merge commits in feature branches | Clutters history |
| Committing build artifacts | Bloats repository |

## Context Memory in Commits [HARD]

All implementation commits MUST include a `## Context` section to preserve AI-developer interaction context across sessions.

### Context Memory Categories

| Category | Purpose | Example |
|----------|---------|---------|
| `Decision` | Technical decision + rationale | "JWT over session (stateless API requirement)" |
| `Constraint` | Active constraints | "Must maintain /api/v1 backward compatibility" |
| `Gotcha` | Pitfalls discovered | "Redis TTL unreliable for RefreshToken storage" |
| `Pattern` | Patterns/references used | "middleware chain pattern from auth.go:45" |
| `Risk` | Known risks/deferred items | "Token rotation deferred to Phase 2" |
| `UserPref` | User preferences captured | "User prefers functional style over OOP" |

### Commit Format with Context

```
feat(auth): add JWT login endpoint

Implement POST /api/v1/auth/login with bcrypt password validation.

## Context (AI-Developer Memory)
- Decision: EdDSA over RSA256 (user requested, performance priority)
- Constraint: Must maintain /api/v1 backward compatibility
- Gotcha: bcrypt cost factor 12 causes >200ms on low-end hardware
- Pattern: middleware chain pattern from existing auth.go:45
- Risk: Token rotation deferred to Phase 2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Only include relevant categories — omit empty ones. Record learnings as they emerge during implementation.

---

Version: 4.0.0
Last Updated: 2026-03-09
Source: JikiME-ADK git-workflow rules + Context Memory system
