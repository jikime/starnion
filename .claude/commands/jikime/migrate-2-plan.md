---
description: "[Step 2/4] Migration plan creation. Phase definition, effort estimation, risk identification. Proceeds after approval."
argument-hint: '[--modules auth,users,orders] [--incremental]'
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Glob, Grep
model: inherit
---

# Migration Step 2: Plan

**Planning Phase**: Creates migration plan based on analysis results from previous phases (Discover, Analyze).

## CRITICAL: Input Sources

**DO NOT analyze source code directly.** Only use outputs from previous phases.

### Required Inputs (from Phase 1: Analyze)

1. **`.migrate-config.yaml`** - Project settings and artifacts path
2. **`as_is_spec.md`** - Full analysis results (components, routing, state, dependencies, etc.)

### Input Loading Flow

```
Step 1: Read `.migrate-config.yaml` from project root
        → Extract `artifacts_dir` path

Step 2: Read `{artifacts_dir}/as_is_spec.md`
        → This contains ALL analysis from Phase 1

Step 3: Create plan ONLY from as_is_spec.md content
        → DO NOT read source code files
        → DO NOT re-analyze the codebase
```

### Error Handling

If `.migrate-config.yaml` or `as_is_spec.md` is not found:
- Inform user that Phase 1 (Analyze) must be completed first
- Suggest running `/jikime:migrate-1-analyze` before this command
- DO NOT attempt to analyze source code as a fallback

[SOFT] Apply --ultrathink keyword for deep migration planning analysis
WHY: Migration planning requires careful analysis of module dependencies, transformation complexity, and behavioral preservation strategy
IMPACT: Sequential thinking ensures optimal migration sequencing and risk-aware planning with DDD approach

## Dynamic Skill Discovery (MUST Execute)

Before creating the plan, you MUST **dynamically discover and load** relevant skills based on analysis results.
Do NOT assume a specific framework. Always read the target from analysis data and find skills accordingly.

### Skill Discovery Flow

```
Step 1: Read target_framework from .migrate-config.yaml
        → e.g., "nextjs16", "fastapi", "go-fiber"

Step 2: Search for migration skill
        → jikime-adk skill search "{target_framework}"
        → jikime-adk skill search "migrate {target_framework}"

Step 3: Search for target language/framework skill
        → jikime-adk skill search "{target_language}"
        → e.g., "typescript", "python", "go"

Step 4: Search for database/ORM skills (from .migrate-config.yaml)
        → jikime-adk skill search "{db_orm}"
        → jikime-adk skill search "{db_type}"
        → e.g., "prisma", "drizzle", "postgresql"

Step 5: Search for library/platform skills (from as_is_spec.md)
        → Detected libraries → jikime-adk skill search "{library}"
        → e.g., "supabase", "auth"

Step 5.5: Search for UI library skills (from .migrate-config.yaml)
        → jikime-adk skill search "{target_ui_library}"
        → e.g., "shadcn", "mui", "chakra"
        → CRITICAL: UI library skill defines component transformation patterns

Step 6: Search for backend framework skills (if frontend-backend architecture)
        → jikime-adk skill search "{target_framework_backend}"
        → e.g., "fastapi", "nestjs", "express", "go-fiber"

Step 7: Load discovered skills
        → Skill("{found-migration-skill}")
        → Skill("{found-framework-skill}")
        → Skill("{found-library-skills}")
```

### Discovery Examples

| target_framework | Discovered Skills |
|------------------|-------------------|
| nextjs16 | jikime-migration-to-nextjs, jikime-framework-nextjs@16, jikime-library-shadcn |
| fastapi | jikime-lang-python (+ related) |
| go-fiber | jikime-lang-go (+ related) |
| flutter | jikime-lang-flutter (+ related) |

| db_orm / db_type | Discovered Skills |
|------------------|-------------------|
| prisma | jikime-domain-database (+ related) |
| drizzle | jikime-domain-database (+ related) |
| postgresql | jikime-domain-database (+ related) |

| target_ui_library | Discovered Skills |
|-------------------|-------------------|
| shadcn | jikime-library-shadcn (component patterns, installation) |
| mui | jikime-library-mui (Material UI patterns) |
| chakra | jikime-library-chakra (Chakra UI patterns) |
| legacy-css | _(no skill - copy existing CSS)_ |

### What to Extract from Loaded Skills

Rules that MUST be extracted from loaded skills and reflected in the Plan:

1. **Project structure** - Recommended directory structure for target framework
2. **Project initialization** - Project creation commands, required packages
3. **File/directory naming** - Target's file naming conventions (kebab-case, snake_case, etc.)
4. **Component/module mapping** - Source → target pattern transformation rules
5. **State management** - Target's recommended state management approach
6. **Routing** - Target's routing structure and rules
7. **UI library** - Target's UI component handling approach

### What to Extract from UI Library Skills (CRITICAL)

When `target_ui_library` is set (not "legacy-css"), extract from UI library skill:

1. **Installation commands** - `npx shadcn@latest init`, component add commands
2. **Component mapping** - Legacy HTML/CSS → modern component equivalents
3. **Styling approach** - Tailwind CSS classes, CSS variables, theming
4. **Accessibility patterns** - ARIA attributes, keyboard navigation
5. **Form patterns** - Form components, validation integration
6. **Layout components** - Container, grid, flex patterns

**Example Component Mapping (shadcn)**:
| Legacy Pattern | shadcn Equivalent |
|----------------|-------------------|
| `<button class="btn btn-primary">` | `<Button variant="default">` |
| `<input type="text" class="form-control">` | `<Input />` |
| `<select class="form-select">` | `<Select>` with `<SelectItem>` |
| `<div class="modal">` | `<Dialog>` with `<DialogContent>` |
| `<div class="card">` | `<Card>` with `<CardHeader>`, `<CardContent>` |
| `<ul class="nav nav-tabs">` | `<Tabs>` with `<TabsList>`, `<TabsTrigger>` |

### Fallback (Skill Not Found)

When no relevant skill is found:
- Query target framework official docs via Context7 MCP
- `mcp__context7__resolve-library-id` → `mcp__context7__query-docs`
- Reflect discovered patterns in the Plan

## What This Command Does

1. **Load Skills** - Load migration-related skill rules
2. **Load Analysis Results** - Load analysis data from as_is_spec.md
3. **Phase Definition** - Create phased plan based on skill rules + analysis results
4. **Effort Estimation** - Estimate effort based on component complexity
5. **Risk Assessment** - Leverage risk factors from as_is_spec.md
6. **Wait for Approval** - Proceed after user approval

## Usage

```bash
# Create plan from analysis results (reads .migrate-config.yaml automatically)
/jikime:migrate-2-plan

# Plan specific modules only
/jikime:migrate-2-plan --modules auth,users,orders

# Plan for incremental migration
/jikime:migrate-2-plan --incremental
```

## Options

| Option | Description |
|--------|-------------|
| `--modules` | Specific modules to migrate (from as_is_spec.md) |
| `--incremental` | Plan for incremental migration |

## Execution Flow

### Step 0: Load Config & Discover Skills

```
Read(".migrate-config.yaml")
→ Extract: source_path, artifacts_dir, target_framework

jikime-adk skill search "{target_framework}"
jikime-adk skill search "{detected_language}"
jikime-adk skill search "{db_orm}"
jikime-adk skill search "{db_type}"
jikime-adk skill search "{detected_libraries}"
→ Load all discovered relevant skills
```

### Step 1: Load Previous Phase Results

```
Read("{artifacts_dir}/as_is_spec.md")
→ Contains: components, routing, state, dependencies, risks
```

### Step 1.5: Verify Target Stack Configuration

Read target stack fields from `.migrate-config.yaml`:

```
Step 1: Read target_architecture, target_framework, target_framework_backend from config
Step 2: Verify required fields are present and not "pending":
        - target_architecture (required)
        - target_framework (required)
        - target_framework_backend (required if target_architecture is "frontend-backend")
Step 3: If any required field is "pending" or missing:
        → Inform user: "Target stack not configured. Run /jikime:migrate-0-discover first."
        → DO NOT ask architecture questions here
Step 4: If frontend-backend → discover backend framework skill
        → jikime-adk skill search "{target_framework_backend}"
        → Load discovered backend skill
```

**Backward compatible**: If `target_architecture` is not set, default to `fullstack-monolith`.

### Step 2: Create Migration Plan (Skills + Analysis)

Using `as_is_spec.md` data + **loaded skill conventions**, create:

1. **Project setup** - Follow skill initialization rules
   - Project creation commands, required packages
2. **Directory structure** - Apply skill's recommended structure
3. **File/directory naming** - Apply skill's naming conventions
4. **Component/module mapping** - Based on skill's mapping tables
   - Source pattern → Target equivalent
5. **State migration** - Skill's state management decision tree
6. **Routing migration** - Target's routing rules
7. **Effort estimates** - Based on component complexity scores
8. **Risk assessment** - Leverage risk factors from as_is_spec.md

### Step 3: Write Plan & Wait for Approval

Write plan to `{artifacts_dir}/migration_plan.md` and present to user.

Plan must include:
- Target project structure (from discovered skills)
- Component migration order (from dependency graph in as_is_spec.md)
- File naming convention examples (from skill rules)
- Project initialization commands (from skill modules)
- Package/dependency list (from skill conventions)

## Output

```markdown
# Migration Plan: {source_framework} → {target_framework}

## Input Sources
- Analysis: {artifacts_dir}/as_is_spec.md
- Components: {count} total
- Risks identified: {count}

## Target Architecture: {target_architecture}

### Architecture Overview
- **Pattern**: {fullstack-monolith | frontend-backend | frontend-only}
- **Frontend**: {target_framework}
- **Backend**: {target_framework_backend | "Same as frontend (API Routes)" | "Existing (no migration)"}
- **DB Access**: {db_access_from}

### Output Structure
{Architecture-specific directory structure from SKILL.md}

## Loaded Skills & Conventions
- Migration: {discovered_migration_skill}
- Framework: {discovered_framework_skill}
- Libraries: {discovered_library_skills}

## Target Conventions (from Skills)
- Project structure: {skill-defined directory layout}
- File naming: {skill-defined naming convention}
- State management: {skill-defined state approach}
- Routing: {skill-defined routing pattern}
- UI library: {target_ui_library} (from skill: {ui_library_skill})

## UI Component Transformation Strategy

### UI Library: {target_ui_library}

**Approach**: {modernize | preserve-legacy}

IF target_ui_library != "legacy-css":
  - **Installation**: `npx shadcn@latest init` (or equivalent for chosen library)
  - **Component Migration**: Legacy HTML/CSS → modern component library
  - **Styling**: Tailwind CSS / CSS-in-JS (depending on library)
  - **Theme**: Extract colors, fonts, spacing from legacy CSS → design tokens

### Component Transformation Table
| Source Component | Target Component | Notes |
|------------------|------------------|-------|
| {legacy_button} | `<Button variant="...">` | From UI library skill |
| {legacy_input} | `<Input>` | With validation integration |
| {legacy_modal} | `<Dialog>` | Accessible, keyboard-friendly |
| {legacy_card} | `<Card>` | With CardHeader, CardContent |

### Legacy CSS Handling
IF target_ui_library == "legacy-css":
  - Copy existing CSS to `globals.css` or `styles/legacy.css`
  - Minimal transformation (class names preserved)
  - NOT RECOMMENDED for modernization goals

IF target_ui_library != "legacy-css":
  - Extract design tokens (colors, spacing, typography)
  - Map to Tailwind/CSS variables
  - DO NOT copy legacy CSS wholesale
  - Transform component by component using UI library

## Project Initialization
{Commands from skill's project-initialization guide}

## Database Migration Strategy
- **Current**: {db_type} + {db_orm}
- **Target**: {target_db_orm} (e.g., Prisma / Drizzle)
- **Models to migrate**: {db_model_count}

### Schema Migration Plan
| Source Model | Target Model | Fields | Relationships | Notes |
|-------------|-------------|--------|---------------|-------|
| {model_1} | {target_model_1} | {count} | {relationships} | {notes} |
| ... | ... | ... | ... | ... |

### Data Migration Strategy
- Schema conversion approach (manual / automated)
- Seed data handling
- Connection configuration for target environment

### Execution Sub-Phases (by architecture)

#### fullstack-monolith (default):
- Phase 1: Foundation (project scaffolding, DB setup)
- Phase 2: Core Features (module-by-module DDD cycle)
- Phase 3: UI & Frontend
- Phase 4: Testing & Verification

#### frontend-backend:
- Phase 1: Foundation (shared types, API contract definition)
- Phase 1.5: Database Setup (in backend)
- Phase 2-B: Backend (API + business logic + data access)
- Phase 2-F: Frontend (components + routing + state + API client)
- Phase 3: Integration (API contract verification, E2E)
- Phase 4: Testing & Verification

#### frontend-only:
- Phase 1: Foundation (project scaffolding, API client setup)
- Phase 2: Core Features (component migration)
- Phase 3: UI & Frontend
- Phase 4: Testing & Verification

## Phase 1: Foundation ({days} days)
- Project scaffolding (skill conventions)
- Core configuration setup
- {framework-specific foundation tasks}

## Phase 1.5: Database Setup (skip if frontend-only)
- Target ORM installation and configuration
- Schema definition (from source models)
- Database connection configuration
- Seed data migration

## Phase 2: Core Features ({days} days)
- {component_group_1} migration
- {component_group_2} migration
- API/data layer migration

## Phase 3: UI & Frontend ({days} days)
- Component migration (by complexity order from as_is_spec.md)
- Styling migration
- Asset pipeline

## Phase 4: Testing & Verification ({days} days)
- Characterization tests
- Integration tests
- Performance validation

## Total Estimated: {total} days

## Risks (from Analysis)
- HIGH: {risk from as_is_spec.md}
- MEDIUM: {risk from as_is_spec.md}

**WAITING FOR CONFIRMATION**: Proceed? (yes/no/modify)
```

## Important

**No code will be written until approval is received.**

Response options:
- `yes` - Proceed as planned
- `modify: [changes]` - Modify the plan
- `no` - Cancel

## Agent Delegation

| Phase | Agent | Purpose |
|-------|-------|---------|
| Planning | `manager-strategy` | Migration strategy from analysis data |
| Architecture | `frontend` | Component migration order |

## Workflow (Data Flow)

```
/jikime:migrate-0-discover
        ↓ (Discovery Report)
/jikime:migrate-1-analyze
        ↓ (as_is_spec.md + .migrate-config.yaml)
/jikime:migrate-2-plan  ← current
        │
        ├─ .migrate-config.yaml → Verify target stack (architecture, framework, backend)
        ├─ jikime-adk skill search → Discover relevant skills
        ├─ Skill() load → Extract rules/structure/naming
        ├─ as_is_spec.md → Reference analysis data
        │
        ↓ (migration_plan.md - includes skill conventions)
/jikime:migrate-3-execute
        ↓
/jikime:migrate-4-verify
```

## Constraints

- **DO NOT** read or analyze source code files directly
- **DO NOT** use Glob/Grep on the source project directory
- **ONLY** read from `{artifacts_dir}/` for analysis data
- All planning decisions must reference data from `as_is_spec.md`

## Next Step

After approval, proceed to next step:
```bash
/jikime:migrate-3-execute
```

---

## EXECUTION DIRECTIVE

Arguments: $ARGUMENTS

1. **Parse $ARGUMENTS**:
   - Extract `--modules` (specific modules to migrate, comma-separated)
   - Extract `--incremental` (incremental migration flag)

2. **Load configuration**:
   - Read `.migrate-config.yaml`
   - Extract: `source_path`, `artifacts_dir`, `target_framework`, `source_architecture`, `db_type`, `db_orm`
   - IF file not found: Inform user to run `/jikime:migrate-1-analyze` first

3. **Load previous phase results**:
   - Read `{artifacts_dir}/as_is_spec.md`
   - IF file not found: Inform user to run `/jikime:migrate-1-analyze` first
   - DO NOT read or analyze source code files directly

4. **Discover and load skills**:
   - `jikime-adk skill search "{target_framework}"` → load migration skill
   - `jikime-adk skill search "{target_language}"` → load language skill
   - `jikime-adk skill search "{db_orm}"` / `"{db_type}"` → load DB skills
   - `jikime-adk skill search "{target_ui_library}"` → load UI library skill (CRITICAL for modernization)
   - Extract project structure, naming, routing, state management, UI component patterns

5. **Verify Target Stack Configuration** (Step 1.5):
   - Read `target_architecture`, `target_framework`, `target_framework_backend` from config
   - IF any required field is "pending" or missing: Inform user to run `/jikime:migrate-0-discover` first, then STOP
   - IF `target_architecture` not set: default to `fullstack-monolith`
   - IF `frontend-backend`: discover backend framework skill via `jikime-adk skill search`

6. **Create migration plan**:
   - Apply loaded skill conventions (structure, naming, routing, state)
   - **UI Transformation Strategy**: Include component mapping from UI library skill
   - Define architecture-specific execution sub-phases
   - Include database migration strategy (if applicable)
   - Estimate effort per phase
   - List risks from as_is_spec.md

7. **Write plan**:
   - Write to `{artifacts_dir}/migration_plan.md`

8. **Present plan to user** in F.R.I.D.A.Y. format:
   - Display full plan summary
   - **WAIT FOR CONFIRMATION**: Proceed? (yes/no/modify)

Execute NOW. Do NOT just describe.

---

Version: 3.1.0
Changelog:
- v3.1.0: Added UI library skill discovery (Step 5.5); Added UI Component Transformation Strategy section with component mapping table; Added legacy CSS handling guidelines; UI library skill now CRITICAL for modernization
- v3.0.0: Replaced Step 1.5 Architecture Pattern Selection with config verification; Architecture/stack selection moved to migrate-0-discover; Added target stack field validation; Backward compatible defaults
- v2.6.0: Added EXECUTION DIRECTIVE with $ARGUMENTS parsing and step-by-step execution flow
- v2.5.0: Added Step 1.5 Architecture Pattern Selection; Added Target Architecture section to plan output; Architecture-specific execution sub-phases; Backend framework skill discovery
- v2.4.0: Added Database Migration Strategy section; Added Phase 1.5 Database Setup; Added db_orm/db_type skill discovery
- v2.3.0: Added dynamic skill discovery based on target_framework; Framework-agnostic plan generation
- v2.2.0: Added explicit input loading from Phase 1 outputs; Prohibited source code re-analysis
- v2.1.0: Initial structured plan command
