---
description: "[Step 1/4] Detailed legacy project analysis. Component, routing, state management, and dependency analysis."
argument-hint: '[project-path] [--framework vue|react|angular|svelte|auto] [--target nextjs|fastapi|go] [--artifacts-output path] [--whitepaper] [--client name] [--lang ko|en|ja|zh]'
type: workflow
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Glob, Grep
model: inherit
---

# Migration Step 1: Analyze

Perform detailed analysis of the legacy project to prepare for migration.

## Config-First Approach

This command automatically reads from `.migrate-config.yaml` if it exists:
- `source_path` → project-path argument not required
- `target_framework` → --target option not required
- `artifacts_dir` → --artifacts-output option not required

**Explicit arguments override config values.**

## Purpose

This command performs deep analysis of the source project to understand:
- Framework type and version
- Component structure and hierarchy
- State management patterns
- Routing configuration
- Dependencies and their compatibility

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| project-path | No* | Path to the legacy project root |
| --framework | No | Force framework detection (vue\|react\|angular\|svelte\|auto) |
| --target | No* | Target framework (nextjs\|fastapi\|go\|flutter) |
| --artifacts-output | No | Migration artifacts output directory |
| --whitepaper | No | Generate full whitepaper package for client delivery |
| --whitepaper-output | No | Whitepaper output directory (default: `./whitepaper/`) |
| --client | No | Client company name (used in whitepaper cover) |
| --lang | No | Whitepaper language (ko\|en\|ja\|zh). Default: conversation_language |

*\* Automatically read from `.migrate-config.yaml` if present. Required if not.*

### Path Resolution Priority

```
1. Explicit argument:  /jikime:migrate-1-analyze "./my-app" --target nextjs
2. Config file:        .migrate-config.yaml → source_path, target_framework
3. Error:              Neither exists → ask user to run Step 0 first
```

## Execution Flow

### Phase 1: Framework Detection

Use **Explore** agent to scan project structure:

```
Task(subagent_type="Explore", prompt="
Analyze the project at {project-path} to detect:
1. Primary framework (Vue, React, Angular, Svelte)
2. Framework version
3. Build tool (Webpack, Vite, CRA, Angular CLI)
4. Package manager (npm, yarn, pnpm)

Check these files:
- package.json (dependencies)
- Configuration files (vue.config.js, vite.config.ts, angular.json, svelte.config.js)
- File patterns (*.vue, *.tsx, *.component.ts, *.svelte)
")
```

### Phase 2: Component Analysis

Delegate to **frontend**:

```
Task(subagent_type="frontend", prompt="
Analyze all components in {project-path}:
1. Create component inventory with file paths
2. Identify component hierarchy (parent-child relationships)
3. Detect component patterns:
   - Stateful vs stateless
   - Container vs presentational
   - HOCs and render props
   - Composition patterns
4. List props and events for each component
5. Identify shared/reusable components
")
```

### Phase 3: Infrastructure Analysis

Analyze project infrastructure:

1. **Routing**:
   - Route definitions
   - Dynamic routes
   - Nested routes
   - Route guards/middleware

2. **State Management**:
   - Global state (Vuex, Pinia, Redux, NgRx, Svelte stores)
   - Local component state
   - Server state (React Query, Apollo, etc.)

3. **API Integration**:
   - API client configuration
   - Authentication patterns
   - Data fetching strategies

4. **Styling**:
   - CSS approach (modules, scoped, global)
   - Preprocessors (SCSS, Less)
   - CSS-in-JS libraries
   - UI framework (Vuetify, MUI, etc.)

### Phase 3.5: Database Analysis

Analyze the database layer (skip if `db_type: none` in `.migrate-config.yaml`):

1. **DB Connection**:
   - Connection string patterns (environment variables)
   - Connection pooling configuration
   - Multiple database connections

2. **ORM/Schema Tool**:
   - Schema definitions and models
   - Migration files and history
   - Seed data

3. **Data Models**:
   - Entity/model inventory with fields and relationships
   - Indexes and constraints
   - Enums and custom types

4. **Data Access Patterns**:
   - Query patterns (ORM queries, raw SQL, query builders)
   - Transaction usage
   - Eager/lazy loading patterns
   - N+1 query risks

5. **External Data Services**:
   - Cache layer (Redis, Memcached)
   - Search engines (Elasticsearch, Algolia)
   - Message queues (RabbitMQ, SQS)

### Phase 3.6: Architecture Layer Analysis

Analyze the source project's architecture layers based on `source_architecture` from `.migrate-config.yaml`:

1. **Frontend Layer**:
   - Components, pages, layouts
   - Routing configuration
   - State management stores
   - Client-side utilities

2. **Backend Layer**:
   - API endpoints (REST, GraphQL)
   - Business logic services
   - Middleware (auth, logging, error handling)
   - Server-side utilities

3. **Data Layer**:
   - Database models and schemas
   - Query patterns (repository, active record, raw SQL)
   - Migration files
   - Seed data

4. **Shared Layer**:
   - TypeScript types/interfaces
   - Utility functions used by both frontend and backend
   - Constants and configuration

5. **Coupling Analysis**:
   - Frontend ↔ Backend: Tight (direct import) or Loose (API calls only)
   - Backend ↔ Data: Coupling pattern description
   - Cross-boundary imports identification

### Phase 4: Generate AS_IS_SPEC

Create comprehensive analysis document:

```markdown
# AS-IS Specification: {project-name}

## Project Overview
- Framework: {detected-framework} {version}
- Build Tool: {build-tool}
- Package Manager: {package-manager}

## Component Inventory
| Component | Path | Type | State | Dependencies |
|-----------|------|------|-------|--------------|
| Header | src/components/Header.vue | Stateful | Local | NavLink, Logo |
| ... | ... | ... | ... | ... |

## Routing Structure
```mermaid
graph TD
    A[/] --> B[/dashboard]
    A --> C[/settings]
    B --> D[/dashboard/analytics]
    ...
```

## State Management
- Pattern: {Vuex|Pinia|Redux|...}
- Stores: {list of stores/slices}
- Global State Shape: {structure}

## Dependencies Analysis
| Package | Version | Migration Notes |
|---------|---------|-----------------|
| vue-router | 4.x | Replace with Next.js App Router |
| ... | ... | ... |

## Database Layer
- **Database**: {db_type} {version}
- **ORM**: {db_orm} {version}
- **Connection**: {connection pattern}

### Data Models
| Model | Fields | Relationships | Migration Notes |
|-------|--------|---------------|-----------------|
| User | id, email, name, ... | hasMany(Post) | Prisma User model |
| Post | id, title, content, ... | belongsTo(User) | Prisma Post model |
| ... | ... | ... | ... |

### Migration Files
- Total: {N} migration files
- Latest: {latest_migration_date}

### Data Access Patterns
- Query Builder: {yes/no}
- Raw SQL: {yes/no}
- Transactions: {yes/no}
- Eager Loading: {patterns}

### External Data Services
| Service | Type | Usage |
|---------|------|-------|
| Redis | Cache | Session store, query cache |
| ... | ... | ... |

## Architecture Layers

### Layer Summary
| Layer | Components | Files | Complexity |
|-------|-----------|-------|------------|
| Frontend | {N} | {N} | {Low/Medium/High} |
| Backend | {N} | {N} | {Low/Medium/High} |
| Data | {N} | {N} | {Low/Medium/High} |
| Shared | {N} | {N} | {Low/Medium/High} |

### Frontend Layer
- Components: {N}
- Routes: {N}
- State stores: {N}

### Backend Layer
- API Endpoints: {N}
- Business Logic Services: {N}
- Middleware: {N}

### Data Layer
- Models: {N}
- Query Patterns: {pattern description}
- Migrations: {N} files

### Coupling Analysis
- Frontend ↔ Backend: {Tight (direct import) / Loose (API calls only)}
- Backend ↔ Data: {coupling description}
- Cross-boundary imports: {list or none}

## Special Patterns
- {Pattern 1}: {description and location}
- {Pattern 2}: {description and location}

## Risk Assessment
| Risk | Severity | Mitigation |
|------|----------|------------|
| {risk} | High/Medium/Low | {mitigation strategy} |
```

## Output

- **Directory**: `{--artifacts-output}` or `./migrations/{project-name}/` (default)
- **File**: `as_is_spec.md`
- **Format**: Markdown with Mermaid diagrams

---

## Configuration File Update

After analysis, this command **updates** `.migrate-config.yaml` (created by Step 0) with enriched information.

### Fields Updated by Step 1

```yaml
# .migrate-config.yaml (updated by Step 1)
version: "1.0"
project_name: my-vue-app
source_path: ./my-vue-app           # From Step 0 or explicit arg
source_framework: vue3              # Enriched: detected with version
target_framework: nextjs16          # From Step 0, --target, or user choice
artifacts_dir: ./migrations/my-vue-app
output_dir: ./migrations/my-vue-app/out
analyzed_at: "2026-01-23T11:00:00Z" # Added by Step 1
component_count: 45                  # Added by Step 1
complexity_score: 7                  # Added by Step 1
db_model_count: 15                   # Added by Step 1 (0 if no database)
```

### Update Logic

```python
# On analyze completion:
config = load(".migrate-config.yaml")  # Must exist (from Step 0)

# Enrich with analysis results
config["source_framework"] = detected_framework_with_version
config["target_framework"] = args.target or config["target_framework"]
config["artifacts_dir"] = args.artifacts_output or config["artifacts_dir"]
config["analyzed_at"] = datetime.now().isoformat()
config["component_count"] = len(components)
config["complexity_score"] = calculated_score

save(config)
```

### If No Config Exists

If `.migrate-config.yaml` doesn't exist (Step 0 was skipped):
- `project-path` argument becomes **required**
- Config is created with the provided path
- User is informed that Step 0 can be used for quicker setup next time

---

## Whitepaper Generation (--whitepaper)

When `--whitepaper` flag is provided, generate a comprehensive client-deliverable package.

### Language Selection (--lang)

The whitepaper can be generated in different languages:

| Language | Code | Description |
|----------|------|-------------|
| Korean | `ko` | Korean whitepaper |
| English | `en` | English whitepaper |
| Japanese | `ja` | 日本語ホワイトペーパー |
| Chinese | `zh` | 中文白皮书 |

**Default Behavior**:
- If `--lang` is not specified, uses user's `conversation_language` from `.jikime/config/language.yaml`
- Templates from `.claude/skills/jikime-migration-to-nextjs/templates/pre-migration/` are used as structure reference
- Content is generated in the specified language by the delegated agents

**Language Application**:
- All document titles and headings are translated
- Technical terms remain in English (React, Next.js, API, etc.)
- Mermaid diagrams use English labels for compatibility
- Client name and project name remain as provided

### Whitepaper Output Structure

**Output Directory**: `{--whitepaper-output}` or `./whitepaper/` (default)

```
{whitepaper-output}/               # Whitepaper package (default: ./whitepaper/)
    ├── 00_cover.md                # Cover page and TOC
    ├── 01_executive_summary.md    # Executive summary
    ├── 02_feasibility_report.md   # Feasibility report
    ├── 03_architecture_report.md  # Architecture report
    ├── 04_complexity_matrix.md    # Complexity matrix
    ├── 05_migration_roadmap.md    # Migration roadmap
    ├── 06_baseline_report.md      # Security/performance baseline
    └── assets/
        └── diagrams/              # Diagram assets
```

### Phase 5: Whitepaper Generation (if --whitepaper)

#### 5.1 Cover Page (00_cover.md)

```markdown
# Migration Assessment Whitepaper

## {project-name} → {target-framework} Migration

**Prepared for**: {--client or "Client Company"}
**Prepared by**: JikiME Migration Team
**Date**: {current-date}
**Version**: 1.0

---

## Table of Contents

1. Executive Summary
2. Feasibility Report
3. Architecture Report
4. Complexity Matrix
5. Migration Roadmap
6. Security & Performance Baseline

---

**Confidentiality Notice**: This document contains proprietary information...
```

#### 5.2 Executive Summary (01_executive_summary.md)

Delegate to **manager-docs** with business focus:

```
Task(subagent_type="manager-docs", prompt="
Create an executive summary for non-technical stakeholders:

Based on: {as_is_spec.md}

Include:
1. Project Overview (1 paragraph, no technical jargon)
2. Current System Summary (bullet points)
3. Why Migration is Needed (business benefits)
4. Expected Outcomes (measurable improvements)
5. Timeline Overview (high-level phases)
6. Investment Summary (effort estimation)
7. Key Risks & Mitigations (top 3)
8. Recommendation (clear Go/No-Go)

Tone: Professional, confident, accessible to C-level executives
Length: 2-3 pages maximum
")
```

#### 5.3 Feasibility Report (02_feasibility_report.md)

Delegate to **manager-strategy**:

```
Task(subagent_type="manager-strategy", prompt="
Create a migration feasibility report:

Based on: {as_is_spec.md}

Include:
1. Technical Feasibility Assessment
   - Framework compatibility score (1-10)
   - Dependency migration complexity
   - API compatibility analysis

2. Cost-Benefit Analysis
   - Estimated effort (person-days)
   - Expected ROI timeline
   - Maintenance cost comparison (before/after)

3. Risk Matrix
   | Risk | Probability | Impact | Score | Mitigation |
   |------|-------------|--------|-------|------------|

4. Alternative Analysis
   - Option A: Full Migration
   - Option B: Partial Migration
   - Option C: Refactoring Only
   - Option D: Maintain Status Quo

5. Go/No-Go Recommendation with justification
")
```

#### 5.4 Architecture Report (03_architecture_report.md)

Delegate to **frontend** and **manager-strategy**:

```
Task(subagent_type="frontend", prompt="
Create architecture comparison report:

Based on: {as_is_spec.md}
Target: {target-framework}

Include:
1. AS-IS Architecture Diagram (Mermaid)
   - Component hierarchy
   - Data flow
   - External integrations

2. TO-BE Architecture Diagram (Mermaid)
   - Proposed Next.js/target structure
   - App Router layout
   - Server/Client component split

3. Technology Stack Comparison Table
   | Category | Current | Target | Migration Effort |
   |----------|---------|--------|------------------|

4. Dependency Compatibility Matrix
   | Package | Current | Target Equivalent | Breaking Changes |
   |---------|---------|-------------------|------------------|

5. Architecture Improvement Points
   - Performance gains
   - Developer experience
   - Scalability improvements
")
```

#### 5.5 Complexity Matrix (04_complexity_matrix.md)

```
Task(subagent_type="frontend", prompt="
Create component complexity matrix:

Based on: {as_is_spec.md}

Include:
1. Complexity Scoring Criteria
   - Lines of Code (1-5)
   - Dependencies (1-5)
   - State Complexity (1-5)
   - UI Complexity (1-5)
   - Overall Score (weighted average)

2. Component Complexity Table
   | Component | LOC | Deps | State | UI | Score | Effort (hours) | Priority |
   |-----------|-----|------|-------|-----|-------|----------------|----------|

3. Dependency Graph (Mermaid)
   - Component dependencies visualization
   - Critical path identification

4. Work Breakdown Structure (WBS)
   - Phase 1: Foundation (which components)
   - Phase 2: Core Features
   - Phase 3: Advanced Features
   - Phase 4: Polish & Optimization

5. Effort Summary
   - Total estimated hours
   - Recommended team size
   - Parallel work opportunities
")
```

#### 5.6 Migration Roadmap (05_migration_roadmap.md)

```
Task(subagent_type="manager-strategy", prompt="
Create detailed migration roadmap:

Based on: {as_is_spec.md}, {complexity_matrix}

Include:
1. Phase Overview
   | Phase | Duration | Deliverables | Team Size |
   |-------|----------|--------------|-----------|

2. Detailed Timeline (Mermaid Gantt)
   ```mermaid
   gantt
       title Migration Roadmap
       dateFormat  YYYY-MM-DD
       section Phase 1
       ...
   ```

3. Milestone Definitions
   - M1: Project Setup Complete
   - M2: Core Components Migrated
   - M3: Feature Parity Achieved
   - M4: Testing Complete
   - M5: Production Ready

4. Quality Gates per Phase
   | Phase | Entry Criteria | Exit Criteria | Validation |
   |-------|----------------|---------------|------------|

5. Rollback Plan
   - Rollback triggers
   - Rollback procedure
   - Data preservation strategy

6. Resource Allocation
   - Team composition
   - Skill requirements
   - Training needs
")
```

#### 5.7 Baseline Report (06_baseline_report.md)

```
Task(subagent_type="security-auditor", prompt="
Create security and performance baseline report:

Based on: {as_is_spec.md}

Include:
1. Security Assessment
   - Current vulnerability scan results
   - Dependency security audit
   - Authentication/Authorization review
   - Data handling practices

2. Security Improvements (Post-Migration)
   | Area | Current State | Target State | Improvement |
   |------|---------------|--------------|-------------|

3. Performance Baseline
   - Current bundle size
   - Load time metrics (estimated)
   - Lighthouse score estimation
   - Core Web Vitals targets

4. Performance Targets (Post-Migration)
   | Metric | Current | Target | Improvement |
   |--------|---------|--------|-------------|
   | Bundle Size | X KB | Y KB | Z% |
   | LCP | X s | <2.5s | ... |
   | FID | X ms | <100ms | ... |

5. Monitoring Plan
   - Metrics to track
   - Alerting thresholds
   - Reporting frequency
")
```

### Whitepaper Example Usage

```bash
# Generate Korean whitepaper (default if conversation_language is ko)
/jikime:migrate-1-analyze "./my-vue-app" --whitepaper --client "ABC Corp" --target nextjs

# Generate English whitepaper explicitly
/jikime:migrate-1-analyze "./my-vue-app" --whitepaper --client "ABC Corp" --target nextjs --lang en

# Generate Japanese whitepaper
/jikime:migrate-1-analyze "./my-vue-app" --whitepaper --client "株式会社ABC" --target nextjs --lang ja

# Custom output directory
/jikime:migrate-1-analyze "./my-vue-app" --whitepaper --client "ABC Corp" --whitepaper-output ./docs/pre-migration

# Basic analysis without whitepaper
/jikime:migrate-1-analyze "./my-vue-app"
```

### Whitepaper Quality Checklist

- [ ] All 7 documents generated (cover + 6 reports)
- [ ] Client name appears on cover page
- [ ] All Mermaid diagrams render correctly
- [ ] Effort estimates are realistic and justified
- [ ] Risks have corresponding mitigations
- [ ] Executive summary is non-technical
- [ ] Roadmap includes clear milestones
- [ ] No placeholder text remains

---

## Quality Checklist

Before completing:

- [ ] Framework correctly identified with version
- [ ] All components cataloged
- [ ] Routing structure mapped
- [ ] State management analyzed
- [ ] Dependencies reviewed for compatibility
- [ ] Database layer analyzed (or confirmed as none)
- [ ] Architecture layers identified
- [ ] Risks identified

## Example Usage

```bash
# Auto-detect framework
/jikime:migrate-1-analyze "./my-vue-app"

# Force Vue detection
/jikime:migrate-1-analyze "./legacy-project" --framework vue

# Analyze with explicit path
/jikime:migrate-1-analyze "/Users/dev/projects/old-react-app"
```

## Error Handling

| Error | Action |
|-------|--------|
| Path not found | Ask user to verify path |
| No framework detected | Ask user to specify --framework |
| Multiple frameworks | Ask user to select primary |
| Permission denied | Request necessary permissions |

---

## EXECUTION DIRECTIVE

Arguments: $ARGUMENTS

1. **Parse $ARGUMENTS**:
   - Extract `project-path` (optional if config exists)
   - Extract `--framework` (vue|react|angular|svelte|auto)
   - Extract `--target` (nextjs|fastapi|go|flutter)
   - Extract `--artifacts-output` (custom artifacts path)
   - Extract `--whitepaper` (generate whitepaper flag)
   - Extract `--whitepaper-output` (custom whitepaper path)
   - Extract `--client` (client company name)
   - Extract `--lang` (whitepaper language: ko|en|ja|zh)

2. **Load configuration**:
   - Read `.migrate-config.yaml` if exists
   - Extract: `source_path`, `target_framework`, `artifacts_dir`, `db_type`, `db_orm`, `source_architecture`
   - Explicit arguments override config values
   - IF no config AND no `project-path` argument: Inform user to run `/jikime:migrate-0-discover` first

3. **Execute Phase 1: Framework Detection** using Explore agent:
   - Scan project structure for framework, version, build tools, package manager

4. **Execute Phase 2: Component Analysis** using frontend agent:
   - Component inventory, hierarchy, patterns, props/events

5. **Execute Phase 3: Infrastructure Analysis**:
   - Routing, State Management, API Integration, Styling

6. **Execute Phase 3.5: Database Analysis** (skip if `db_type: none`):
   - DB connection, ORM/schema, data models, data access patterns, external services

7. **Execute Phase 3.6: Architecture Layer Analysis**:
   - Frontend/Backend/Data/Shared layers, coupling analysis

8. **Generate `as_is_spec.md`**:
   - Write to `{artifacts_dir}/as_is_spec.md`
   - Include all analysis sections (components, routing, state, dependencies, database, architecture layers, risks)

9. **Update `.migrate-config.yaml`**:
   - Add `analyzed_at`, `component_count`, `complexity_score`, `db_model_count`

10. **IF `--whitepaper`**: Execute Phase 5 (Whitepaper Generation)
    - Generate all 7 whitepaper documents using delegated agents
    - Apply `--lang` language setting
    - Output to `{whitepaper-output}/`

11. **Report results** to user in F.R.I.D.A.Y. format:
    - Analysis summary, Next Step: `/jikime:migrate-2-plan`

Execute NOW. Do NOT just describe.

---

Version: 2.3.0
Changelog:
- v2.3.0: Added EXECUTION DIRECTIVE with $ARGUMENTS parsing and step-by-step execution flow
- v2.2.0: Added Phase 3.6 Architecture Layer Analysis; Added Architecture Layers section to AS_IS_SPEC; Added architecture layers quality check
- v2.1.0: Added Phase 3.5 Database Analysis; Added Database Layer section to AS_IS_SPEC; Added db_model_count to config
- v2.0.0: Config-first approach; project-path now optional (reads from .migrate-config.yaml); Removed /jikime:migrate reference
- v1.5.0: Added .migrate-config.yaml auto-generation for cross-command artifact path resolution
- v1.4.0: Added --artifacts-output option; Changed default artifacts path from .claude/skills/ to ./migrations/
- v1.3.0: Added --whitepaper-output option for custom whitepaper output directory
- v1.2.0: Added --lang option for multi-language whitepaper generation (ko|en|ja|zh)
- v1.1.0: Added --whitepaper option for client-deliverable package generation
