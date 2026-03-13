---
name: jikime-workflow-pr-lifecycle
description: PR lifecycle automation from creation to merge with CI monitoring and review resolution loops
version: 1.0.0
tags: ["workflow", "pr", "ci", "review", "automation", "github"]
triggers:
  keywords: ["PR", "pull request", "create PR", "merge", "CI check", "review comments"]
  phases: ["run", "sync"]
  agents: ["manager-git", "manager-quality"]
  languages: []
progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~2500
user-invocable: true
context: fork
agent: manager-git
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - TodoWrite
---

# PR Lifecycle Automation

Automated PR creation, CI monitoring, review resolution, and merge workflow.

## Overview

Automates the complete pull request lifecycle:
1. Create PR with structured description
2. Monitor CI checks until pass
3. Resolve review comments
4. Final validation and merge

## PR Creation

### Step 1: Pre-PR Checks

Before creating a PR, verify:

```bash
# Ensure all changes are committed
git status --porcelain

# Ensure branch is up to date with base
git fetch origin main
git diff origin/main...HEAD --stat

# Ensure build passes locally
npm run build  # or equivalent
npm test       # or equivalent
```

### Step 2: Create PR

Use `gh pr create` with structured description:

```bash
gh pr create \
  --title "feat(scope): concise description" \
  --body "$(cat <<'EOF'
## Summary

- What this PR does (1-3 bullet points)

## Changes

- List of significant changes
- New files, modified files, deleted files

## Test Plan

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Edge cases covered

## Screenshots (if UI changes)

N/A
EOF
)"
```

### PR Title Format

Follow conventional commits:
```
feat(scope): add user authentication
fix(scope): resolve memory leak in WebSocket
refactor(scope): extract validation logic
docs(scope): update API documentation
test(scope): add integration tests for auth
```

## CI Monitoring Loop

### Flow

```
PR Created
  ↓
Check CI Status (gh pr checks)
  ├── All Passing → Proceed to Review
  ├── Pending → Wait 60s, re-check (max 10 min)
  └── Failed → Diagnose and Fix
        ↓
      Fix CI Failure
        ↓
      Push Fix
        ↓
      Re-check (max 5 retry cycles)
        ├── Pass → Proceed to Review
        └── Still failing after 5 cycles → STOP, report to user
```

### CI Check Commands

```bash
# Check CI status
gh pr checks

# Watch CI (blocking wait)
gh pr checks --watch --fail-fast

# Get specific check details
gh pr view --json statusCheckRollup --jq '.statusCheckRollup[]'
```

### CI Failure Diagnosis

When CI fails:

1. **Identify failing check**: Parse `gh pr checks` output
2. **Read failure logs**: `gh run view <run-id> --log-failed`
3. **Categorize failure**:

| Category | Action | Example |
|----------|--------|---------|
| Lint error | Auto-fix | `npm run lint --fix` |
| Type error | Fix types | Missing type annotation |
| Test failure | Fix test or code | Assertion mismatch |
| Build error | Fix build | Missing dependency |
| Flaky test | Re-run | `gh run rerun <run-id>` |

4. **Fix and push**:
```bash
# Fix the issue
# ...

# Commit fix
git add -A
git commit -m "fix(ci): resolve [specific issue]"
git push
```

### Timeout Protection

| Parameter | Default | Description |
|-----------|---------|-------------|
| CI wait timeout | 10 min | Max time to wait for CI |
| CI retry cycles | 5 | Max fix-and-recheck attempts |
| Polling interval | 60s | Time between status checks |

If timeout reached:
```
CI monitoring timed out after 10 minutes.
Last status: 2/5 checks passed, 1 pending, 2 failed.

Failed checks:
- lint: ESLint found 3 errors
- test: 2 test failures in auth.test.ts

Action needed: Manual intervention required.
```

## Review Resolution Loop

### Flow

```
CI Passed
  ↓
Wait for Review
  ↓
Review Comments Received
  ├── Check comment count
  ├── Read all comments
  ├── Categorize and prioritize
  ├── Fix issues
  ├── Push fixes
  ├── Re-request review
  └── Repeat (max 3 review cycles)
        ├── Approved → Merge
        └── Still changes requested after 3 cycles → STOP, report
```

### Review Comment Commands

```bash
# List PR review comments
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments \
  --jq '.[] | {path: .path, line: .line, body: .body}'

# List PR reviews
gh pr view --json reviews --jq '.reviews[] | {state: .state, body: .body}'

# Check if approved
gh pr view --json reviewDecision --jq '.reviewDecision'
```

### Comment Resolution Strategy

1. **Read all comments** at once (batch processing)
2. **Categorize** by type:

| Type | Priority | Action |
|------|----------|--------|
| Bug/Logic error | Critical | Fix immediately |
| Style/Convention | Medium | Apply suggestion |
| Suggestion/Optional | Low | Evaluate, respond |
| Question | Low | Answer in comment |
| Nitpick | Low | Apply if trivial |

3. **Fix all issues** in a single commit:
```bash
git add -A
git commit -m "fix(review): address review comments

- Fix [issue 1]
- Apply [suggestion 2]
- Respond to [question 3]"
git push
```

4. **Respond to non-code comments** via `gh`:
```bash
gh pr comment --body "Addressed all review comments. Please re-review."
```

### Timeout Protection

| Parameter | Default | Description |
|-----------|---------|-------------|
| Review cycles | 3 | Max rounds of review resolution |
| Review wait | Manual | User notified to wait for review |

## Final Validation and Merge

### Pre-Merge Checklist

```
- [ ] CI checks all passing
- [ ] Review approved (no changes requested)
- [ ] No merge conflicts
- [ ] Branch is up to date with base
```

### Merge Commands

```bash
# Check merge readiness
gh pr view --json mergeable --jq '.mergeable'

# Merge (squash recommended)
gh pr merge --squash --delete-branch

# Or merge commit
gh pr merge --merge --delete-branch
```

### Post-Merge Cleanup

```bash
# Switch back to main
git checkout main
git pull

# Clean up local branch
git branch -d feature-branch
```

## Complete Workflow Example

```
1. Pre-PR checks (build, test, lint)
2. gh pr create with structured body
3. CI Monitoring Loop:
   - gh pr checks --watch (wait up to 10 min)
   - If failed: diagnose → fix → push → re-check (max 5 cycles)
4. Review Resolution Loop:
   - Read comments via gh api
   - Fix issues → push → re-request (max 3 cycles)
5. Final validation
6. gh pr merge --squash --delete-branch
7. Post-merge cleanup
```

## Output Format

### PR Created
```markdown
## J.A.R.V.I.S.: PR Lifecycle - Created

PR #42 created: feat(auth): add user authentication
URL: https://github.com/owner/repo/pull/42

Monitoring CI checks...
```

### CI Passed
```markdown
## J.A.R.V.I.S.: PR Lifecycle - CI Passed

All 5/5 CI checks passed:
- lint: passed
- type-check: passed
- test: passed (87% coverage)
- build: passed
- security: passed

Waiting for review...
```

### Review Resolved
```markdown
## J.A.R.V.I.S.: PR Lifecycle - Review Resolved

Addressed 4 review comments in 1 cycle:
- 2 bug fixes applied
- 1 style suggestion applied
- 1 question answered

Re-requested review. CI re-running...
```

### Merged
```markdown
## J.A.R.V.I.S.: PR Lifecycle - Complete

PR #42 merged successfully (squash).
Branch feature/auth deleted.

<jikime>DONE</jikime>
```

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `jikime-workflow-poc` | Phase 5 uses this skill |
| `jikime-workflow-task-format` | PR tasks use 5-field format |
| `jikime-workflow-loop` | CI fix loop similar to Ralph Loop |

---

Version: 1.0.0
Last Updated: 2026-02-27
Source: Adapted from smart-ralph PR lifecycle automation
