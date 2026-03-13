---
description: "[Step 0/4] Source project discovery. Identify tech stack, architecture, and migration complexity."
argument-hint: '@<source-path> [--quick]'
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Glob, Grep
model: inherit
---

# Migration Step 0: Discover

**Starting Phase**: Explore source code and perform initial analysis.

## What This Command Does

1. **Technology Detection** - Identify languages, frameworks, and libraries
2. **Architecture Analysis** - Understand structure, patterns, and dependencies
3. **Architecture Pattern Detection** - Classify source as monolith, separated, or unknown
4. **Complexity Assessment** - Evaluate migration difficulty
5. **Interactive Stack Selection** - Guide user through target stack choices
6. **Config Initialization** - Create `.migrate-config.yaml` with full target stack
7. **Discovery Report** - Generate comprehensive discovery report

## Usage

```bash
# Discover source codebase (interactive stack selection)
/jikime:migrate-0-discover @./legacy-app/

# Quick discovery (overview only, skips interactive selection)
/jikime:migrate-0-discover @./legacy-app/ --quick
```

## Options

| Option | Description |
|--------|-------------|
| `@path` | Source code path to analyze (required) |
| `--quick` | Quick overview without deep analysis or interactive selection |

## Execution Flow

### Step 1: Analyze Source

Explore the source project to detect:
- Primary language and framework
- Framework version
- Build tools and package manager
- Database type and ORM/schema tool
- Source architecture pattern (monolith / separated / unknown)
- File count and complexity

**Architecture Detection** (uses architecture-detection module logic):
- Check for frontend/backend directory separation
- Analyze monorepo configuration (turbo.json, pnpm-workspace.yaml, etc.)
- Detect fullstack framework indicators (Next.js, Laravel, Django, Rails)
- Classify as `monolith`, `separated`, or `unknown`

### Step 1.5: Interactive Stack Selection

After source analysis, guide the user through target stack selection using **sequential AskUserQuestion** calls.

**Skip this step if `--quick` is specified** (set all target fields to "pending").

#### Dynamic Option Detection

Before asking questions, scan installed skills to populate framework options dynamically:

```
jikime-adk skill list --tag framework  → frontend framework options
jikime-adk skill list --agent backend  → backend framework options
jikime-adk skill list --tag database   → ORM/DB options
```

Use detected skills as option sources. Fall back to common defaults if no skills found.

#### Question Flow

```
Question 1: Architecture Strategy
  "What architecture strategy for the target project?"
  Options (max 4):
  - Fullstack: Single framework handles frontend + backend + DB (e.g., Next.js)
  - Separated: Independent frontend and backend projects

  → Sets: target_architecture

Question 2: Frontend Framework
  "Which frontend framework for the target?"
  Options (dynamic from installed skills, top 3 + Other):
  - Next.js (Recommended)
  - Nuxt
  - Angular
  - Other (manual input)

  → Sets: target_framework

Question 3: (Separated only) Backend Language/Framework
  "Which backend framework?"
  Options (dynamic from installed skills, top 3 + Other):
  - Java (Spring Boot)
  - Go (Fiber/Echo)
  - Python (FastAPI)
  - Other (manual input)

  → Sets: target_framework_backend, target_backend_language

Question 4: (Separated only) DB Access Layer
  "Which layer handles database access?"
  Options:
  - Backend only (Recommended)
  - Both frontend and backend

  → Sets: db_access_from

Question 5: DB Schema Extraction (skip if db_type is "none")
  "Extract existing DB schema for migration?"
  Options:
  - Yes, from environment variable (DATABASE_URL in .env)
  - Yes, from schema file (schema.prisma / SQL dump)
  - No, analyze from source code only

  → Sets: db_schema_source

Question 6: (Fullstack only) Target DB ORM
  "Which ORM for the target project?"
  Options (context-dependent):
  - Prisma (Recommended)
  - Drizzle
  - Supabase
  - Other (manual input)

  → Sets: target_db_orm

Question 7: UI Component Library
  "Which UI component library for the target?"
  Options (dynamic from installed skills, top 3 + Other):
  - shadcn/ui (Recommended) - Modern, accessible, customizable
  - Material UI (MUI) - Comprehensive, enterprise-ready
  - Chakra UI - Simple, modular, accessible
  - Keep legacy CSS (copy existing styles)
  - Other (manual input)

  → Sets: target_ui_library
```

**IMPORTANT**: This question is critical for modernizing the frontend.
- If user selects a modern UI library, migration will convert legacy components to modern equivalents
- If "Keep legacy CSS" is selected, existing styles will be preserved (not recommended for modernization)

#### Conditional Flow Summary

| Architecture | Questions Asked |
|-------------|----------------|
| **Fullstack** | Q1 → Q2 → Q5 → Q6 → Q7 (5 questions) |
| **Separated** | Q1 → Q2 → Q3 → Q4 → Q5 → Q7 (6 questions) |

#### Derived Values

Values automatically derived from user selections:

| Field | Fullstack | Separated |
|-------|-----------|-----------|
| `target_architecture` | `fullstack-monolith` | `frontend-backend` |
| `db_access_from` | `frontend` (via API Routes) | From Q4 (`backend` or `both`) |
| `target_framework_backend` | _(not set)_ | From Q3 |
| `target_backend_language` | _(not set)_ | From Q3 |
| `target_db_orm` | From Q6 | _(set in Plan phase based on backend)_ |
| `target_ui_library` | From Q7 | From Q7 |

### Step 2: Create `.migrate-config.yaml`

After discovery and interactive selection, **automatically create** the config file:

```yaml
# .migrate-config.yaml (created by Step 0)
version: "1.0"
project_name: legacy-app          # Derived from @path
source_path: ./legacy-app         # From @path argument
source_framework: laravel8        # Detected framework
db_type: mysql                    # Detected database type (postgresql, mysql, sqlite, mongodb, none)
db_orm: eloquent                  # Detected ORM/schema tool (prisma, drizzle, typeorm, sequelize, mongoose, eloquent, none)
source_architecture: monolith     # Detected architecture pattern (monolith, separated, unknown)
artifacts_dir: ./migrations/legacy-app  # Default artifacts location
output_dir: ./migrations/legacy-app/out # Default output location
created_at: "2026-01-23T10:00:00Z"

# Target stack (from interactive selection)
target_architecture: fullstack-monolith    # fullstack-monolith | frontend-backend
target_framework: nextjs16                 # Frontend framework
target_framework_backend: ""               # (separated only) Backend framework
target_backend_language: ""                # (separated only) Backend language
db_access_from: frontend                   # frontend | backend | both | none
target_db_orm: prisma                      # Target ORM (fullstack: from Q6, separated: set in Plan)
db_schema_source: env                      # env | file | none
target_ui_library: shadcn                  # UI library (shadcn, mui, chakra, legacy-css, other)
```

**If `--quick` is specified**: Set all target fields to `"pending"` and skip interactive selection.

### Step 3: Generate Report

```markdown
# Discovery Report: {project_name}

## Source Overview
- **Language**: PHP 7.4
- **Framework**: Laravel 8
- **Database**: MySQL 5.7
- **Frontend**: jQuery + Blade

## Database Overview
- **Database**: MySQL 5.7
- **ORM**: Eloquent (Laravel)
- **Models**: 15 data models detected
- **Migrations**: 23 migration files in `database/migrations/`
- **Additional Services**: Redis (session store, cache)

## Architecture Overview
- **Pattern**: Monolith (single codebase, frontend + backend coexist)
- **Confidence**: High
- **Indicators**: Single package.json with Laravel framework, Blade templates mixed with controllers

## Complexity Score: 7/10 (Medium-High)

## Target Stack (from interactive selection)
- **Architecture**: Separated (Frontend + Backend)
- **Frontend**: Next.js 16
- **Backend**: Java (Spring Boot)
- **DB Access**: Backend only
- **Target ORM**: (to be decided in Plan phase)
- **Schema Extraction**: From .env (DATABASE_URL)
- **UI Library**: shadcn/ui (modern components will replace legacy CSS)

## Config Created
`.migrate-config.yaml` has been initialized with full target stack configuration.

## Next Step
Run `/jikime:migrate-1-analyze` to perform deep analysis.
(Source path and target are already saved in .migrate-config.yaml)
```

## Config File Purpose

`.migrate-config.yaml` is the **single source of truth** for all subsequent steps:

| Field | Set by | Used by |
|-------|--------|---------|
| `source_path` | Step 0 | Step 1, 3 |
| `source_framework` | Step 0 | Step 1, 2, 3 |
| `target_framework` | Step 0 | Step 2, 3 |
| `target_architecture` | Step 0 | Step 2, 3 |
| `target_framework_backend` | Step 0 (separated only) | Step 2, 3 |
| `target_backend_language` | Step 0 (separated only) | Step 2, 3 |
| `db_access_from` | Step 0 | Step 2, 3 |
| `target_db_orm` | Step 0 (fullstack) or Step 2 (separated) | Step 3 |
| `db_schema_source` | Step 0 | Step 1, 3 |
| `target_ui_library` | Step 0 | Step 2, 3 |
| `artifacts_dir` | Step 0 (default) or Step 1 | Step 2, 3, 4 |
| `output_dir` | Step 0 (default) or Step 3 | Step 3, 4 |
| `db_type` | Step 0 | Step 1, 2, 3, 4 |
| `db_orm` | Step 0 | Step 1, 2, 3, 4 |
| `source_architecture` | Step 0 | Step 1, 2 |

**Users never need to re-enter these values** in subsequent steps.

## Agent Delegation

| Phase | Agent | Purpose |
|-------|-------|---------|
| Exploration | `Explore` | File structure and tech detection |
| Architecture | `Explore` | Pattern identification |

## Workflow (Data Flow)

```
/jikime:migrate-0-discover @./src/  ← current
        │
        ├─ Explores: Source project analysis
        ├─ AskUserQuestion: Interactive stack selection (Q1~Q6)
        ├─ Creates: .migrate-config.yaml
        │   (source_*, target_*, db_*, artifacts_dir)
        │
        ↓
/jikime:migrate-1-analyze
        │ (reads config → no path re-entry needed)
        ├─ Updates: .migrate-config.yaml (enriches with details)
        ├─ Creates: {artifacts_dir}/as_is_spec.md
        ↓
/jikime:migrate-2-plan
        │ (reads config + as_is_spec.md)
        ├─ Creates: {artifacts_dir}/migration_plan.md
        ↓
/jikime:migrate-3-execute
        │ (reads config + plan)
        ├─ Creates: {output_dir}/ (migrated project)
        ├─ Updates: {artifacts_dir}/progress.yaml
        ↓
/jikime:migrate-4-verify
        │ (reads config + progress)
        ├─ Creates: {artifacts_dir}/verification_report.md
```

## Next Step

After discovery, proceed to next step:
```bash
/jikime:migrate-1-analyze
```

---

## EXECUTION DIRECTIVE

Arguments: $ARGUMENTS

1. **Parse $ARGUMENTS**:
   - Extract `@path` (source code path, required)
   - Extract `--quick` (quick overview mode, optional)
   - IF no `@path` provided: Use AskUserQuestion to ask for source path

2. **Explore source project** using Explore agent:
   ```
   Task(subagent_type="Explore", prompt="
   Analyze the project at {source_path}:
   1. Primary language and framework (with version)
   2. Build tools and package manager
   3. Database type (postgresql, mysql, sqlite, mongodb, none)
   4. ORM/schema tool (prisma, drizzle, typeorm, sequelize, mongoose, eloquent, none)
   5. Architecture pattern:
      - Check frontend/backend directory separation
      - Monorepo config (turbo.json, pnpm-workspace.yaml)
      - Fullstack indicators (Next.js API Routes, Laravel, Django, Rails)
      - Classify as: monolith, separated, or unknown
   6. File count and project complexity
   ")
   ```
   - IF `--quick`: Limit to package.json + config file analysis only

3. **Present source analysis** to user:
   - Show detected source stack summary before asking questions
   - IF `--quick`: Skip to step 5 (set all target fields to "pending")

4. **Interactive Stack Selection** (Step 1.5):

   a. **Scan installed skills** for dynamic options:
      ```
      jikime-adk skill list --tag framework   → frontend options
      jikime-adk skill list --agent backend    → backend options
      ```

   b. **Q1: Architecture Strategy**
      - Use AskUserQuestion with 2 options: Fullstack, Separated
      - Store result as `target_architecture`

   c. **Q2: Frontend Framework**
      - Use AskUserQuestion with top 3 from skills + Other
      - Store result as `target_framework`

   d. **Q3: (Separated only) Backend Framework**
      - Use AskUserQuestion with top 3 from skills + Other
      - Store result as `target_framework_backend` and `target_backend_language`

   e. **Q4: (Separated only) DB Access Layer**
      - Use AskUserQuestion: "Backend only" (Recommended) vs "Both frontend and backend"
      - Store result as `db_access_from`

   f. **Q5: DB Schema Extraction** (skip if db_type is "none")
      - Use AskUserQuestion: env variable, schema file, or source code only
      - Store result as `db_schema_source`

   g. **Q6: (Fullstack only) Target DB ORM**
      - Use AskUserQuestion with context-dependent options
      - Store result as `target_db_orm`

   h. **Q7: UI Component Library**
      - Use AskUserQuestion with top options: shadcn/ui (Recommended), MUI, Chakra UI, Keep legacy CSS, Other
      - Store result as `target_ui_library`
      - This determines how legacy components will be transformed

   i. **Derive values**:
      - Fullstack: `db_access_from` = "frontend"
      - Separated without Q4: `db_access_from` = "backend" (default)

5. **Create `.migrate-config.yaml`**:
   - Derive `project_name` from source path
   - Set all detected values (source_framework, db_type, db_orm, source_architecture)
   - Set all interactive selection values (target_architecture, target_framework, target_framework_backend, target_backend_language, db_access_from, target_db_orm, db_schema_source, target_ui_library)
   - Set default `artifacts_dir` and `output_dir`

6. **Generate Discovery Report** to user in F.R.I.D.A.Y. format:
   - Source Overview (language, framework, database, frontend)
   - Database Overview (DB type, ORM, models, migrations)
   - Architecture Overview (pattern, confidence, indicators)
   - Complexity Score (1-10)
   - Target Stack (architecture, frontend, backend, DB access, ORM, schema extraction, UI library)
   - Config Created confirmation
   - Next Step: `/jikime:migrate-1-analyze`

Execute NOW. Do NOT just describe.

---

Version: 4.1.0
Changelog:
- v4.1.0: Added Q7 UI Component Library selection (shadcn, MUI, Chakra, legacy-css); Added target_ui_library to config schema; Updated conditional flow (Fullstack: 5 questions, Separated: 6 questions); UI library choice determines component modernization strategy
- v4.0.0: Replaced --target with interactive stack selection (Step 1.5); Added 6 conditional AskUserQuestion flow; Extended .migrate-config.yaml schema with target_architecture, target_framework_backend, target_backend_language, db_access_from, target_db_orm, db_schema_source; Added Target Stack to discovery report; Dynamic skill-based option detection
- v3.3.0: Added EXECUTION DIRECTIVE with $ARGUMENTS parsing and step-by-step execution flow
- v3.2.0: Added source architecture pattern detection (source_architecture field); Added Architecture Overview in discovery report
- v3.1.0: Added database type and ORM detection (db_type, db_orm fields); Added Database Overview in discovery report
- v3.0.0: Added .migrate-config.yaml creation; Added --target option; Defined data flow across steps
- v2.1.0: Initial structured discover command
