---
description: "GitHub workflow - Parallel issue fixing and PR review via worktree isolation"
argument-hint: "issues [--all | --label LABEL | NUMBER...] | pr [NUMBER | --all] [--solo]"
context: dev
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
---

## Pre-execution Context

!git status --porcelain
!git branch --show-current
!gh repo view --json name,defaultBranchRef --jq '.name + " @ " + .defaultBranchRef.name' 2>/dev/null || echo "gh CLI not configured"

---

# /jikime:github - GitHub Workflow

Parallel issue fixing and PR review with worktree isolation.

## Architecture

```
issues mode (worktree-isolated parallel):
  [Worktree A] fix/issue-1 → analyze + fix + test + push ─┐
  [Worktree B] fix/issue-2 → analyze + fix + test + push ─┼─ parallel (max 3)
  [Worktree C] fix/issue-3 → analyze + fix + test + push ─┘
  → create PR #1, PR #2, PR #3

pr mode (parallel review):
  [Worktree] verifier  → checkout branch, run tests ─┐
  security-reviewer    → analyze diff               ─┼─ parallel
  quality-reviewer     → analyze diff               ─┘
  → synthesize + user approval + submit review
```

## Mode Selection

```
--solo flag OR Agent Teams unavailable
  → Sequential sub-agent mode

default
  → Worktree-isolated parallel mode (max 3 concurrent)
```

---

## EXECUTION DIRECTIVE

Parse `$ARGUMENTS`:

- `issues NUMBER...` — fix specific issues
- `issues --all` — fetch open issues and select
- `issues --label LABEL` — filter by label
- `pr NUMBER` — review specific PR
- `pr --all` — review all open PRs
- `--solo` — disable worktrees, use sequential sub-agents

---

## Issues Workflow

### Phase 1: Fetch and Select

```bash
# Fetch open issues
gh issue list --state open --limit 20 --json number,title,labels,body

# Fetch single issue
gh issue view NUMBER --json number,title,labels,body,comments
```

Use AskUserQuestion to select issue(s) if not specified in arguments.

### Phase 2: Complexity Assessment

For each issue, score automatically:

| Signal | Detection | Weight |
|--------|-----------|--------|
| Label | `complexity:high`, `needs-investigation`, `hard` | +2 |
| Body length | > 800 characters | +1 |
| Comment count | > 5 comments | +1 |
| Title keyword | "investigate", "regression", "intermittent", "root cause" | +1 |
| Cross-module | Mentions 3+ distinct packages or files | +1 |

**Score ≥ 2 → deep analysis first (Explore subagent)**
**Score < 2 → direct fix**

### Phase 3: Parallel Implementation (Worktree Isolation)

Branch naming convention:
- Bug issues → `fix/issue-{n}`
- Feature issues → `feat/issue-{n}`
- Enhancement → `improve/issue-{n}`
- Docs → `docs/issue-{n}`

Pre-flight check for each issue:
```bash
git ls-remote --heads origin {branch}
```
If branch exists → warn user and offer: skip / force-push / alternate name.

For each issue batch (max 3 parallel), spawn subagent with `isolation: worktree`:

```
Use the backend subagent (isolation: worktree) to:
1. Checkout issue #{number} on branch {branch}
2. Analyze root cause using findings: {analysis}
3. Implement fix with minimal scope
4. Run existing tests: {test_command}
5. Commit: "fix: {title} (closes #{number})"
6. Push branch to remote
```

### Phase 4: Create PRs

After all worktree agents complete:

```bash
gh pr create \
  --title "fix: {issue_title} (closes #{number})" \
  --body "## Summary\n- Fixes #{number}\n\n## Changes\n{changes}\n\n## Test Plan\n{test_plan}" \
  --base main \
  --head {branch}
```

---

## PR Review Workflow

### Phase 1: Fetch PR

```bash
gh pr view NUMBER --json number,title,body,headRefName,files,reviews,comments
gh pr diff NUMBER
```

### Phase 2: Parallel Review

Spawn 3 reviewers in parallel (no worktree needed):

**Reviewer 1 — Verifier** (`isolation: worktree`):
```
Use the test-guide subagent (isolation: worktree) to:
1. Checkout PR #{number} branch
2. Run full test suite
3. Report: pass/fail counts, new failures, coverage delta
```

**Reviewer 2 — Security** (no isolation):
```
Use the security-auditor subagent to:
1. Review PR diff for: injection, XSS, auth bypass, secrets
2. Report: critical/high/medium/low findings with line references
```

**Reviewer 3 — Quality** (no isolation):
```
Use the reviewer subagent to:
1. Review PR diff for: code style, complexity, test coverage, docs
2. Report: approve / request-changes with inline comments
```

### Phase 3: Synthesize and Submit

Collect all reviewer results, present summary to user, then:

```bash
# Request changes
gh pr review NUMBER --request-changes --body "{synthesized_feedback}"

# Approve
gh pr review NUMBER --approve --body "{synthesized_feedback}"
```

---

## Completion

Report per issue/PR:
- ✅ Branch pushed + PR created / Review submitted
- ❌ Failed with error details
- ⚠️ Skipped (pre-flight conflict)

<jikime>DONE</jikime>
