---
description: "PR lifecycle automation - Create PR, monitor CI, resolve reviews, merge"
argument-hint: "[--base main] [--squash] [--no-delete-branch] [--draft]"
context: dev
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
---

## Pre-execution Context

!git status --porcelain
!git log --oneline -5
!git diff --name-only HEAD

---

# /jikime:pr-lifecycle - PR Lifecycle Automation

## Core Principle: Automated PR from Creation to Merge

Handles the complete PR lifecycle with CI monitoring and review resolution loops.

```
Pre-PR Checks (build, test, lint)
  ↓
Create PR (gh pr create)
  ↓
CI Monitoring Loop (max 10 min, 5 retry cycles)
  ↓
Review Resolution Loop (max 3 cycles)
  ↓
Merge & Cleanup
  ↓
<jikime>DONE</jikime>
```

## Command Purpose

Automate the entire pull request lifecycle:

1. **Pre-PR Checks**: Verify build, tests, and lint pass locally
2. **Create PR**: Structured description with test plan
3. **CI Monitoring**: Watch and fix CI failures
4. **Review Resolution**: Address review comments
5. **Merge**: Squash merge and cleanup

Arguments: $ARGUMENTS

## Quick Start

```bash
# Default PR lifecycle (squash merge to main)
/jikime:pr-lifecycle

# Custom base branch
/jikime:pr-lifecycle --base develop

# Draft PR
/jikime:pr-lifecycle --draft

# Keep branch after merge
/jikime:pr-lifecycle --no-delete-branch
```

## Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--base <branch>` | Base branch for PR | main |
| `--squash` | Squash merge | true |
| `--merge` | Merge commit (instead of squash) | false |
| `--no-delete-branch` | Keep branch after merge | false |
| `--draft` | Create as draft PR | false |

---

## EXECUTION DIRECTIVE

1. Parse $ARGUMENTS (extract --base, --squash, --merge, --no-delete-branch, --draft flags)

2. Load skill: Skill("jikime-workflow-pr-lifecycle")

3. [HARD] Pre-PR Checks:

   3a. Verify no uncommitted changes:
   ```bash
   git status --porcelain
   ```
   If uncommitted changes exist: Ask user to commit or stash

   3b. Verify local build passes:
   - Detect build tool (npm/yarn/pnpm/go/cargo)
   - Run build command
   - If fails: STOP and report

   3c. Verify tests pass:
   - Run test command
   - If fails: STOP and report

   3d. Verify branch is pushed:
   ```bash
   git push -u origin HEAD
   ```

4. Analyze changes for PR description:

   4a. Get full commit history:
   ```bash
   git log origin/main...HEAD --oneline
   ```

   4b. Get changed files:
   ```bash
   git diff origin/main...HEAD --stat
   ```

5. Create PR:

   5a. Generate PR title from commits (conventional format)

   5b. Generate PR body with Summary, Changes, Test Plan sections

   5c. Create PR:
   ```bash
   gh pr create --title "..." --body "..." [--draft]
   ```

   5d. Report PR URL to user

6. [HARD] CI Monitoring Loop (max 10 min, 5 retry cycles):

   6a. Check CI status:
   ```bash
   gh pr checks
   ```

   6b. IF all passing: Proceed to Step 7

   6c. IF pending: Wait 60s, re-check (total max 10 min)

   6d. IF failed:
   - Read failure logs: `gh run view <id> --log-failed`
   - Categorize failure (lint/type/test/build/flaky)
   - Fix issue via agent delegation
   - Commit and push fix
   - Increment retry counter
   - If retry > 5: STOP and report

7. Review Wait:

   7a. Check review status:
   ```bash
   gh pr view --json reviewDecision --jq '.reviewDecision'
   ```

   7b. IF "APPROVED": Proceed to Step 8

   7c. IF "CHANGES_REQUESTED": Enter Review Resolution Loop

   7d. IF no review yet: Inform user to request review and wait

8. Review Resolution Loop (max 3 cycles):

   8a. Read all review comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   ```

   8b. Categorize comments (bug/style/suggestion/question)

   8c. Fix all issues in single commit

   8d. Push and re-request review

   8e. Wait for re-review

   8f. If cycle > 3: STOP and report

9. Final Validation:
   - All CI checks passing
   - Review approved
   - No merge conflicts
   - Branch up to date

10. Merge:
    ```bash
    gh pr merge --squash --delete-branch  # or --merge based on flags
    ```

11. Post-Merge Cleanup:
    ```bash
    git checkout main
    git pull
    ```

12. Report final summary

13. Output completion marker: <jikime>DONE</jikime>

Execute NOW — start with pre-PR checks.

---

Version: 1.0.0
Last Updated: 2026-02-27
Core: PR Lifecycle Automation
