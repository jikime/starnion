---
description: "Synchronize documentation and finalize SPEC implementation"
argument-hint: "SPEC-ID [--auto | --force | --status | --project]"
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

## Pre-execution Context

!git status --porcelain
!git branch --show-current
!git log --oneline -5
!git diff --name-only HEAD~1

## Essential Files

@.jikime/config/config.yaml
@.jikime/config/language.yaml
@.jikime/project/product.md
@.jikime/project/structure.md
@.jikime/project/tech.md

---

# JikiME-ADK Step 3: Sync - Documentation Synchronization

User Interaction Architecture: AskUserQuestion must be used at COMMAND level only. Subagents invoked via Task() operate in isolated, stateless contexts.

Workflow Integration: This command implements the final step of the development workflow (Project → Plan → Run → Sync).

---

## Command Purpose

Synchronize project documentation with code changes and finalize SPEC implementation.

Sync for: $ARGUMENTS

### Usage Modes

```bash
/jikime:3-sync SPEC-AUTH-001           # Standard sync for specific SPEC
/jikime:3-sync SPEC-AUTH-001 --auto    # Auto-sync without prompts
/jikime:3-sync SPEC-AUTH-001 --force   # Force regenerate all docs
/jikime:3-sync --status                # Show sync status for all SPECs
/jikime:3-sync --project               # Sync project-level docs only
```

---

## Phase Overview

```
Phase 0.5: Pre-Sync Quality Check
    ↓
Phase 1: Documentation Analysis
    ↓
Phase 2: Documentation Update
    ↓
Phase 3: SPEC Finalization
    ↓
Phase 4: PR/Merge Management (Team Mode)
    ↓
Phase 5: Completion
```

---

## PHASE 0.5: Pre-Sync Quality Check

Goal: Verify implementation quality before documentation sync.

### Step 0.5.1: Check Implementation Status

Verify SPEC-{ID} implementation is complete:

1. All tasks marked complete in acceptance.md
2. Tests passing
3. No uncommitted changes (or warn user)

### Step 0.5.2: Run Quality Validation

[SOFT] Apply --ultrathink keyword for deep quality assessment
WHY: Quality validation requires systematic analysis of test coverage, code quality metrics, and TRUST 5 compliance
IMPACT: Sequential thinking ensures comprehensive quality gate evaluation and actionable improvement recommendations

Use the manager-quality subagent to:

Quick validation for: SPEC-{ID}

Checks:
- Test pass rate: 100%
- Build status: SUCCESS
- Lint/Format: PASS

[SOFT] If quality issues found, warn user but allow continuation.

### Step 0.5.3: Detect Worktree/Branch

Detect current development environment:

```bash
# Check if in worktree
git rev-parse --git-dir 2>/dev/null | grep -q "worktrees"

# Get current branch
git branch --show-current
```

Record environment for Phase 4 merge handling.

---

## PHASE 1: Documentation Analysis

Goal: Analyze what documentation needs updating.

### Step 1.1: Scan Code Changes

Identify files changed during SPEC implementation:

```bash
# Get files changed in SPEC implementation
git log --name-only --format="" SPEC-{ID}..HEAD | sort -u

# Or since feature branch creation
git diff --name-only main...HEAD
```

### Step 1.2: Map Changes to Documentation

For each changed file, determine documentation impact:

| File Type | Documentation Target |
|-----------|---------------------|
| API endpoints | tech.md, API docs |
| Components | structure.md |
| Models/Types | tech.md |
| Config | structure.md, tech.md |
| Tests | acceptance.md status |

### Step 1.3: Generate Update Plan

Create documentation update plan:

```
Documentation Update Plan for SPEC-{ID}
========================================

Project Docs:
- [ ] product.md: Update features section
- [ ] structure.md: Update directory tree
- [ ] tech.md: Update tech stack info

SPEC Docs:
- [ ] spec.md: Mark status as "implemented"
- [ ] acceptance.md: Update test results

Generated Docs:
- [ ] CHANGELOG.md: Add entry for SPEC-{ID}
- [ ] README.md: Update if needed
```

---

## PHASE 2: Documentation Update

Goal: Update all affected documentation.

### Step 2.1: Invoke manager-docs Agent

Use the manager-docs subagent to:

Update documentation for: SPEC-{ID}

Context:
- Changed Files: {list from Phase 1}
- Update Plan: {from Step 1.3}
- Language: ko

Tasks:

**Project Documentation:**
1. Update product.md with new features
2. Update structure.md with new directories/files
3. Update tech.md with new dependencies/patterns

**SPEC Documentation:**
1. Update spec.md status to "implemented"
2. Add implementation notes
3. Update acceptance.md with actual test results

**Generated Documentation:**
1. Add CHANGELOG entry
2. Update README if significant changes

Output:
- Files updated
- Changes summary
- Backup created (if --force)

### Step 2.2: Handle --force Mode

If --force flag provided:

1. Create backup of existing docs
2. Regenerate docs from scratch
3. Compare with backup
4. Show diff to user

### Step 2.3: User Review

Use AskUserQuestion:

Question: Documentation updates ready. Review and approve?

Present:
- Files to be updated
- Summary of changes
- Backup status (if applicable)

Options:
- Apply Updates
- Review Changes First
- Skip Documentation Update
- Cancel

---

## PHASE 3: SPEC Finalization

Goal: Mark SPEC as complete and archive.

### Step 3.1: Update SPEC Status

Update `.jikime/specs/SPEC-{ID}/spec.md`:

```yaml
---
id: SPEC-{ID}
status: "completed"  # Changed from "in_progress"
completed_date: "YYYY-MM-DD"
---
```

### Step 3.2: Generate Completion Summary

Create completion summary in SPEC directory:

```markdown
# SPEC-{ID} Completion Summary

## Implementation
- Start Date: YYYY-MM-DD
- End Date: YYYY-MM-DD
- Commits: N
- Files Changed: M

## Quality Metrics
- Test Coverage: XX%
- All Tests Passing: YES
- Quality Gates: PASSED

## Documentation
- product.md: Updated
- structure.md: Updated
- tech.md: Updated
- CHANGELOG.md: Entry added

## Notes
{Implementation notes if any}
```

### Step 3.3: Archive Option

Use AskUserQuestion:

Question: SPEC finalization complete. Archive SPEC files?

Options:
- Archive to .jikime/archive/ - Move completed SPEC
- Keep in specs/ - Leave SPEC in active directory
- Delete SPEC Files - Remove after completion (not recommended)

---

## PHASE 4: PR/Merge Management (Team Mode)

Goal: Finalize PR and handle merge.

### Step 4.1: Detect Git Mode

Read from config:
- git_mode: "personal" or "team"

If personal mode: Skip to PHASE 5

### Step 4.2: Update PR (Team Mode)

Use the manager-git subagent to:

Finalize PR for: SPEC-{ID}

Tasks:
1. Update PR description with final summary
2. Add completion checklist
3. Update labels (remove draft, add ready-for-review)
4. Request reviewers (if configured)
5. Add documentation update notes

### Step 4.3: Merge Options

Use AskUserQuestion:

Question: PR is ready for merge. How would you like to proceed?

Options:
- Squash and Merge - Single commit in main
- Merge Commit - Preserve all commits
- Rebase and Merge - Linear history
- Leave for Manual Merge - PR ready, merge later

### Step 4.4: Execute Merge (if selected)

If user selected merge option:

1. Verify CI/CD passed
2. Execute merge
3. Delete feature branch (if configured)
4. Handle worktree cleanup (if applicable)

### Step 4.5: Worktree Cleanup

If working in worktree:

```bash
# Return to main worktree
cd ~/path/to/main/project

# Remove completed worktree
git worktree remove ~/worktrees/{PROJECT}/SPEC-{ID}

# Prune worktree list
git worktree prune
```

---

## PHASE 5: Completion

Goal: Summarize sync results and guide next steps.

### Step 5.1: Generate Sync Report

```markdown
## SPEC-{ID} Sync Complete

### Documentation Updated
- product.md: Updated
- structure.md: Updated
- tech.md: Updated
- CHANGELOG.md: Entry added

### SPEC Status
- Status: Completed
- Archived: Yes/No
- Completion Date: YYYY-MM-DD

### Git Status
- Branch: feature/SPEC-{ID} merged to main
- PR: #123 (merged)
- Commits: Squashed to abc1234

### Next Steps Recommended
1. Verify documentation in repository
2. Check CHANGELOG entry
3. Consider starting next SPEC
```

### Step 5.2: Offer Next Steps

Use AskUserQuestion:

Question: Sync complete. What would you like to do next?

Options:
- Start New SPEC - Execute /jikime:1-plan
- View Project Status - Show all SPEC statuses
- Review Documentation - Open updated docs
- End Session - Complete workflow

---

## Mode-Specific Behaviors

### --status Mode

Show sync status for all SPECs:

```markdown
## SPEC Sync Status

| SPEC ID | Status | Docs Synced | Last Updated |
|---------|--------|-------------|--------------|
| SPEC-AUTH-001 | Completed | Yes | 2026-01-22 |
| SPEC-API-002 | In Progress | Pending | - |
| SPEC-UI-003 | Draft | N/A | - |
```

### --project Mode

Sync project-level documentation only:

1. Analyze entire codebase
2. Regenerate product.md, structure.md, tech.md
3. Update README.md
4. No SPEC-specific operations

### --auto Mode

Execute without user prompts:

1. Skip all AskUserQuestion calls
2. Use default options
3. Report results at end
4. [HARD] Still require quality gate pass

---

## Critical Rules

### Documentation Quality

[HARD] Documentation must be in user's conversation_language.
[HARD] Code examples remain in English.
[HARD] Create backups before --force regeneration.

### Git Operations

[HARD] Never force push to main/master.
[HARD] Verify CI/CD before merge.
[HARD] Clean up worktrees after merge.

### User Interaction

[HARD] AskUserQuestion at COMMAND level only.
[HARD] No emoji in AskUserQuestion fields.
[HARD] Maximum 4 options per question.

---

## Output Format

### User-Facing Output (Markdown)

All reports in Markdown with:
- Clear headers
- Status indicators
- Tables for status summaries
- Code blocks for paths

### Internal Agent Communication (XML)

```xml
<analysis>Documentation change analysis</analysis>
<updates>Files updated with changes</updates>
<spec_status>SPEC finalization details</spec_status>
<git>PR/merge operation results</git>
```

---

## Quick Reference

Entry Point: /jikime:3-sync SPEC-{ID} [flags]

Flags:
- --auto: Execute without prompts
- --force: Regenerate all docs
- --status: Show all SPEC statuses
- --project: Project-level sync only

Agent Chain:
1. manager-quality: Pre-sync validation
2. manager-docs: Documentation updates
3. manager-git: PR/merge operations

Phase Flow:
```
0.5 (Quality) → 1 (Analyze) → 2 (Update) → 3 (Finalize) → 4 (PR/Merge) → 5 (Done)
```

---

Version: 2.0.0
Last Updated: 2026-01-22
Architecture: Commands → Agents → Skills

---

## EXECUTION DIRECTIVE

You must NOW execute the command following the phases above.

1. PHASE 0.5: Run quality check, detect worktree/branch
2. PHASE 1: Analyze documentation needs
3. PHASE 2: Invoke manager-docs for updates
4. PHASE 3: Finalize SPEC status
5. PHASE 4: Handle PR/merge (team mode)
6. PHASE 5: Show completion report, offer next steps

[HARD] Create backups before force regeneration.
[HARD] Clean up worktrees after successful merge.

Do NOT just describe what you will do. DO IT.
