---
description: "Initialize project and generate documentation from codebase analysis"
argument-hint: ""
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

## Pre-execution Context

!git status --porcelain
!git branch --show-current

## Essential Files

@.jikime/config/language.yaml
@.jikime/project/product.md
@.jikime/project/structure.md
@.jikime/project/tech.md

---

# JikiME-ADK Step 0: Project Initialization

User Interaction Architecture: AskUserQuestion tool must be used at COMMAND level only. Subagents invoked via Task() operate in isolated, stateless contexts and cannot interact with users directly.

Architecture: Commands delegate to Agents, which coordinate Skills. This command orchestrates exclusively through Task() tool.

Workflow Integration: This command implements Step 0 of the development workflow (Project → Plan → Run → Sync).

---

## Command Purpose

Initialize project configuration and generate documentation by analyzing the existing codebase. This command creates:

- `.jikime/project/product.md` - Product overview, features, and user value
- `.jikime/project/structure.md` - Project architecture and directory organization
- `.jikime/project/tech.md` - Technology stack, dependencies, and technical decisions

---

## PHASE 0: Project Type Detection

Goal: Determine project type and mode.

### Step 1: Ask Project Type

[HARD] Use AskUserQuestion FIRST before any analysis.

Question: What type of project are you working on?

Options (in user's conversation_language):

- New Project: Starting a new project from scratch
- Existing Project: Documenting an existing codebase
- Migration Project: Migrating from another framework/technology

### Step 2: Route Based on Selection

- New Project → PHASE 0.5 (Information Collection)
- Existing Project → PHASE 1 (Codebase Analysis)
- Migration Project → PHASE 0.5 + Migration Context Collection

---

## PHASE 0.5: Project Information Collection (New/Migration Projects)

Goal: Collect project information when no existing code to analyze.

### Step 1: Invoke manager-project Agent

Use the manager-project subagent to:

Collect project configuration and preferences for: New Project Setup

Tasks:

1. Detect project mode (NEW/EXISTING/MIGRATION)
2. Collect project type (Web App, API, CLI, Library)
3. Collect primary language and framework
4. Collect project description and goals
5. Configure Git workflow mode (Personal/Team)
6. Configure development methodology

Output: Project configuration ready for documentation generation

### Step 2: Generate Initial Documentation

Based on collected information:

- product.md: From user's project description
- structure.md: Recommended directory structure for project type
- tech.md: Based on selected language and framework

---

## PHASE 1: Codebase Analysis (Existing Projects)

Goal: Understand the project structure and technology stack.

### Step 1: Invoke Explore Agent

[SOFT] Apply --ultrathink keyword for comprehensive codebase analysis
WHY: Understanding project structure requires systematic analysis of architecture patterns, dependencies, and technology choices
IMPACT: Sequential thinking enables thorough codebase exploration and accurate technology stack identification

Use the Explore subagent to analyze the codebase with the following objectives:

Analysis Objectives:

1. Project Structure: Identify main directories, entry points, architectural patterns
2. Technology Stack: Detect languages, frameworks, key dependencies
3. Core Features: Identify main functionality and business logic
4. Build System: Detect build tools, package managers, scripts

Output Format:

- Primary Language
- Framework
- Architecture Pattern
- Key Directories
- Dependencies
- Entry Points

---

## PHASE 2: User Confirmation

Goal: Confirm analysis results before documentation generation.

### Step 1: Present Analysis Results

Use AskUserQuestion to present summary and get approval:

Question: Based on codebase analysis, here is the project summary. Proceed with documentation generation?

Present in user's conversation_language:

- Detected Language: [language]
- Framework: [framework]
- Architecture: [pattern]
- Key Features: [features list]

Options:

- Proceed with documentation generation
- Review specific analysis details first
- Cancel and adjust project configuration

---

## PHASE 3: Documentation Generation

Goal: Generate project documentation files.

### Step 1: Invoke manager-docs Agent

Use the manager-docs subagent to generate documentation with:

- Analysis Results: From Explore agent
- User Confirmation: Approved project summary
- Output Directory: `.jikime/project/`
- Language: User's conversation_language

Documentation Files:

1. product.md: Project name, description, features, use cases
2. structure.md: Directory tree, purpose of directories, key files
3. tech.md: Technology stack, frameworks, development environment

---

## PHASE 3.5: Development Environment Check

Goal: Verify LSP servers are installed for detected tech stack.

### Step 1: Check LSP Server Status

Based on detected primary language, check LSP availability:

- Python: pyright or pylsp
- TypeScript/JavaScript: typescript-language-server
- Go: gopls
- Rust: rust-analyzer
- Java: jdtls
- Ruby: solargraph
- PHP: intelephense
- C/C++: clangd

### Step 2: Present LSP Status

If LSP not installed, inform user with installation guidance in conversation_language.

### Step 3: Offer Installation Assistance

Use AskUserQuestion:

Options:

- Continue without LSP
- Show installation instructions
- Auto-install now (via Bash)

---

## PHASE 4: Completion

Goal: Confirm documentation generation and guide to next steps.

### Step 1: Display Results

Show completion message in user's language:

- Files created: List generated files
- Location: `.jikime/project/`
- Status: Success or partial completion

### Step 2: Offer Next Steps

Use AskUserQuestion:

Question: Project documentation generated. What would you like to do next?

Options:

- Write SPEC - Execute /jikime:1-plan to define feature specifications
- Review Documentation - Open generated files for review
- Start New Session - Clear context and start fresh

---

## Critical Rules

### Language Handling

[HARD] Always use user's conversation_language for all output and prompts.

Read language from `.jikime/config/language.yaml` before starting.

### User Interaction

[HARD] Use AskUserQuestion for ALL user interaction at COMMAND level only.
[HARD] No emoji characters in AskUserQuestion fields.
[HARD] Maximum 4 options per AskUserQuestion question.

### Agent Delegation

[HARD] Delegate ALL execution to specialized agents.

Agent Chain:

1. manager-project agent: Project configuration and initialization
2. Explore agent: Codebase analysis
3. manager-docs agent: Documentation generation

---

## Output Format

### User-Facing Output (Markdown)

Progress reports must use Markdown:

- Headers for phase identification
- Lists for itemized findings
- Bold for emphasis on key results
- Code blocks for file paths and technical details

### Internal Agent Communication (XML)

For agent-to-agent data transfer only (never displayed to users):

```xml
<analysis>Codebase analysis results</analysis>
<approach>Documentation generation strategy</approach>
<phase>Current execution phase</phase>
<completion>Summary of generated files</completion>
```

---

## Quick Reference

Entry Point: /jikime:0-project

Mode Detection:

- New Project: Collect info → Generate docs
- Existing Project: Analyze codebase → Confirm → Generate docs
- Migration: Collect info + source context → Generate docs

Agent Chain:

1. manager-project subagent: Project configuration
2. Explore subagent: Analyze codebase
3. manager-docs subagent: Generate documentation

Output Files:

- `.jikime/project/product.md`
- `.jikime/project/structure.md`
- `.jikime/project/tech.md`

---

Version: 1.0.0
Last Updated: 2026-01-22
Architecture: Commands → Agents → Skills

---

## EXECUTION DIRECTIVE

You must NOW execute the command following the phases described above.

1. [PHASE 0] Ask user: New Project, Existing Project, or Migration Project?
2. If New/Migration: Collect project info via manager-project (PHASE 0.5)
3. If Existing: Invoke Explore subagent to analyze codebase (PHASE 1)
4. Present results via AskUserQuestion (PHASE 2)
5. Invoke manager-docs subagent to generate documentation (PHASE 3)
6. Check LSP server status (PHASE 3.5)
7. Confirm completion and offer next steps (PHASE 4)

[HARD] ALWAYS start with PHASE 0 - Ask project type FIRST before any analysis.

Do NOT just describe what you will do. DO IT.
