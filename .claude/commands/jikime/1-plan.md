---
description: "Define specifications and create development branch or worktree"
argument-hint: "Title 1 Title 2 ... | SPEC-ID modifications [--worktree | --branch]"
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

## Pre-execution Context

!git status --porcelain
!git branch --show-current
!git log --oneline -5
!find .jikime/specs -name "*.md" -type f 2>/dev/null | head -10

## Essential Files

@.jikime/config/config.yaml
@.jikime/project/product.md
@.jikime/project/structure.md
@.jikime/project/tech.md
.jikime/specs/

---

# JikiME-ADK Step 1: Plan - Always make a plan first

User Interaction Architecture: AskUserQuestion must be used at COMMAND level only. Subagents invoked via Task() operate in isolated, stateless contexts and cannot interact with users. Collect all user input BEFORE delegating to agents.

---

## Command Purpose

"Plan → Run → Sync" As the first step in the workflow, it supports the entire planning process from ideation to plan creation.

Plan for: $ARGUMENTS

### Usage Scenarios

Scenario 1: SPEC Only (Default)
- Command: /jikime:1-plan "User authentication system"
- Creates SPEC documents only

Scenario 2: SPEC + Branch
- Command: /jikime:1-plan "User authentication system" --branch
- Creates SPEC documents plus Git branch

Scenario 3: SPEC + Worktree
- Command: /jikime:1-plan "User authentication system" --worktree
- Creates SPEC documents plus Git worktree for parallel development

Flag Priority: --worktree > --branch > default (SPEC only)

---

## The Command Has THREE Execution Phases

1. PHASE 1: Project Analysis & SPEC Planning
2. PHASE 2: SPEC Document Creation
3. PHASE 3: Git Branch/Worktree Setup (Conditional)

---

## PHASE 1: Project Analysis and SPEC Planning

### PHASE 1A: Project Exploration (Optional)

When to run: User provides vague/unstructured request

Use the Explore subagent to:

1. Find relevant files by keywords from user request
2. Locate existing SPEC documents (.jikime/specs/*.md)
3. Identify implementation patterns and dependencies
4. Discover project configuration files

Decision Logic: If user provided clear SPEC title, skip Phase 1A.

### PHASE 1B: SPEC Planning (Required)

[SOFT] Apply --ultrathink keyword for deep architectural analysis
WHY: SPEC planning requires careful consideration of domain classification, technical constraints, and dependency analysis
IMPACT: Sequential thinking ensures comprehensive requirement analysis and proper EARS structure design

Use the manager-spec subagent to:

Analyze project and create SPEC plan for: $ARGUMENTS

Language Configuration:

- conversation_language: ko
- language_name: Korean (한국어)

Critical Language Rules:

- Respond in conversation_language from config
- All SPEC documents content in ko
- Code examples and technical keywords remain in English

Tasks:

1. Document Analysis: Scan existing documentation and patterns
2. SPEC Candidate Generation: Create 1-3 SPEC candidates
3. EARS Structure Design: Define requirements using EARS grammar
4. Implementation Plan Creation: Technical constraints, dependencies

### Step 1B.2: Request User Approval

Use AskUserQuestion for explicit approval:

Question: Planning is complete. Proceed with SPEC creation?

Options:

- Proceed with SPEC Creation
- Request Plan Modification
- Save as Draft
- Cancel

---

## PHASE 1.5: Pre-Creation Validation Gate

### Step 1.5.1: SPEC Type Classification

[HARD] Determine if request is for SPEC, Report, or Documentation

Classification:

- Report keywords (report, analysis, audit) → .jikime/reports/
- SPEC keywords (feature, requirement, implement) → .jikime/specs/
- Documentation keywords (guide, manual) → .jikime/docs/

### Step 1.5.2: Pre-Creation Validation

[HARD] Complete ALL checks before creating SPEC:

1. ID Format: `SPEC-{DOMAIN}-{NUMBER}` (e.g., SPEC-AUTH-001)
2. Domain Name: From allowed list (AUTH, API, UI, DB, REFACTOR, etc.)
3. ID Uniqueness: Search .jikime/specs/ for duplicates
4. Directory Structure: Create `.jikime/specs/SPEC-{ID}/` not flat file

### Step 1.5.3: Allowed Domain Names

AUTH, AUTHZ, SSO, MFA, API, BACKEND, SERVICE, WEBHOOK, UI, FRONTEND, COMPONENT, PAGE, DB, DATA, MIGRATION, CACHE, INFRA, DEVOPS, MONITOR, SECURITY, REFACTOR, FIX, UPDATE, PERF, TEST, DOCS

---

## PHASE 2: SPEC Document Creation

[HARD] Create Directory Structure:

```
.jikime/specs/SPEC-{ID}/
├── spec.md      # Core specifications (EARS format)
├── plan.md      # Implementation plan
└── acceptance.md # Acceptance criteria (Given/When/Then)
```

### spec.md Requirements

YAML frontmatter with required fields:

- id, version, status, created, updated, author, priority

HISTORY section immediately after frontmatter
Complete EARS structure with requirement types

### plan.md Requirements

- Implementation plan with detailed steps
- Task decomposition and dependencies
- Technology stack specifications
- Risk analysis and mitigation

### acceptance.md Requirements

- Minimum 2 Given/When/Then test scenarios
- Edge case testing scenarios
- Success criteria and validation methods

---

## PHASE 3: Git Branch/Worktree Setup

### Step 1: Read Git Configuration

Read from .jikime/config/config.yaml:

- git_mode: "personal" or "team"
- spec_git_workflow: "develop_direct", "feature_branch", or "per_spec"

### Step 2: Determine Branch Creation Behavior

[HARD] Check for flags first:

- --worktree flag → Create worktree (Step 2.5)
- --branch flag → Create branch (Step 2.3)
- No flags + prompt_always: true → Ask user (Step 2.2)
- No flags + prompt_always: false → Skip or auto-create

### Step 2.2: Ask User for Environment Selection

Use AskUserQuestion:

Question: Create a development environment for this SPEC?

Options:

- Create Worktree - Isolated environment for parallel SPEC development
- Create Branch - Feature branch (traditional workflow)
- Use current branch - Work directly on current branch

### Step 2.3: Create Feature Branch

Use the manager-git subagent to:

1. Create branch: `feature/SPEC-{SPEC_ID}`
2. Set tracking upstream if remote exists
3. Switch to new branch
4. Create initial commit

### Step 2.4: Skip Branch Creation

Continue on current branch. SPEC files created, ready for /jikime:2-run.

### Step 2.5: Create Worktree

[HARD] SPEC files MUST be committed before worktree creation.

Steps:

1. Stage SPEC files: `git add .jikime/specs/SPEC-{ID}/`
2. Create commit: `feat(spec): Add SPEC-{ID} - {title}`
3. Create worktree at: `~/worktrees/{PROJECT}/SPEC-{ID}/`
4. Display next steps for worktree navigation

### Step 2.6: Team Mode - Create Draft PR

[CONDITION] git_mode == "team" AND branch created (not worktree)

Use the manager-git subagent to create draft PR:

- Title: "feat(spec): Add SPEC-{SPEC_ID} [DRAFT]"
- Status: DRAFT
- Labels: spec, draft

---

## Output Format

### User-Facing Output (Markdown)

Progress reports must use Markdown with clear sections:

- **Context**: Current project state
- **Findings**: SPEC candidates identified
- **Assessment**: Technical constraints
- **Recommendations**: Next steps

### Internal Agent Communication (XML)

For agent-to-agent data transfer only:

```xml
<analysis>Context, findings, assessment</analysis>
<plan>Requirements, architecture, decomposition</plan>
<implementation>Status, artifacts, validation</implementation>
```

---

## Summary: Execution Checklist

### AskUserQuestion Compliance

- [ ] SPEC Creation Approval: Before creating SPEC files
- [ ] Development Environment Selection: For worktree/branch/current
- [ ] Next Action Selection: After SPEC creation completes

### PHASE Checklist

- [ ] PHASE 1: manager-spec analyzed project and proposed SPEC candidates
- [ ] User approval obtained
- [ ] PHASE 2: All 3 SPEC files created (spec.md, plan.md, acceptance.md)
- [ ] Directory naming correct: `.jikime/specs/SPEC-{ID}/`
- [ ] PHASE 3: Branch/worktree created based on flags/user choice

---

## Quick Reference

Entry Point: /jikime:1-plan "description" [--worktree | --branch]

Agent Chain:

1. Explore subagent (optional): Project exploration
2. manager-spec subagent (required): SPEC planning and creation
3. manager-git subagent (conditional): Branch/PR creation

Output:

- `.jikime/specs/SPEC-{ID}/spec.md`
- `.jikime/specs/SPEC-{ID}/plan.md`
- `.jikime/specs/SPEC-{ID}/acceptance.md`

---

## Final Step: Next Action Selection

Use AskUserQuestion after SPEC creation:

Question: SPEC document creation is complete. What would you like to do next?

Options:

- Start Implementation - Execute /jikime:2-run SPEC-{ID}
- Modify Plan - Modify and enhance SPEC content
- Add New Feature - Create additional SPEC document

---

Version: 1.0.0
Last Updated: 2026-01-22
Architecture: Commands → Agents → Skills

---

## EXECUTION DIRECTIVE

You must NOW execute the command following the phases above.

1. Start PHASE 1: Project Analysis & SPEC Planning
2. Use manager-spec subagent (or Explore as appropriate)
3. Get user approval before PHASE 2
4. Create SPEC documents in PHASE 2
5. Handle branch/worktree in PHASE 3 based on flags
6. Offer next steps

Do NOT just describe what you will do. DO IT.
