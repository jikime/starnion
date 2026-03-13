---
description: "Generate comprehensive codebase architecture maps with AST analysis and dependency visualization"
argument-hint: "[all|frontend|backend|database|integrations] [--ast|--deps|--refresh|--json]"
type: utility
allowed-tools: Task, TodoWrite, Bash, Read, Write, Edit, Glob, Grep
model: inherit
---

# JikiME-ADK Utility: Codemap Generator

Generate architectural documentation from codebase analysis. Uses AST parsing and dependency analysis to create accurate, up-to-date architecture maps.

Target: $ARGUMENTS

---

## Core Philosophy

```
Code is the source of truth:
├─ Generate from actual code (not manual writing)
├─ AST analysis for accurate structure
├─ Dependency graphs for relationships
├─ Auto-detect frameworks and patterns
└─ Keep synchronized with codebase changes
```

---

## Usage

```bash
# Generate all codemaps
/jikime:codemap all

# Generate specific area
/jikime:codemap frontend
/jikime:codemap backend
/jikime:codemap database
/jikime:codemap integrations

# With AST analysis (TypeScript/JavaScript)
/jikime:codemap all --ast

# With dependency graph
/jikime:codemap all --deps

# Force refresh (ignore cache)
/jikime:codemap all --refresh

# JSON output for tooling
/jikime:codemap all --json
```

---

## Options

| Option | Description |
|--------|-------------|
| `all` | Generate all codemap areas |
| `frontend` | Frontend architecture only |
| `backend` | Backend/API architecture only |
| `database` | Database schema and models |
| `integrations` | External service integrations |
| `--ast` | Enable AST analysis (ts-morph) |
| `--deps` | Generate dependency graph (madge) |
| `--refresh` | Force regeneration |
| `--json` | Output as JSON for automation |

---

## Output Structure

```
docs/
├── CODEMAPS/
│   ├── INDEX.md              # Architecture overview
│   ├── frontend.md           # Frontend structure
│   ├── backend.md            # Backend/API structure
│   ├── database.md           # Database schema
│   ├── integrations.md       # External services
│   └── assets/
│       ├── dependency-graph.svg
│       └── architecture-diagram.svg
```

---

## Analysis Tools

### 1. AST Analysis (--ast)

Use ts-morph for TypeScript/JavaScript projects:

```bash
# Check if ts-morph is available
npm list ts-morph || npx tsx --version

# Analyze exports and imports
# Custom script generates structured output
```

**Extracts**:
- All exported functions, classes, types
- Import/export relationships
- Module dependencies
- Route definitions (Next.js, Express, etc.)

### 2. Dependency Graph (--deps)

Use madge for dependency visualization:

```bash
# Install if not present
npm list madge || npm install -D madge

# Generate SVG graph
npx madge --image docs/CODEMAPS/assets/dependency-graph.svg src/

# Generate circular dependency report
npx madge --circular src/
```

### 3. Framework Detection

Auto-detect project type:

| Indicator | Framework | Codemap Focus |
|-----------|-----------|---------------|
| `next.config.*` | Next.js | App Router, API Routes, Pages |
| `vite.config.*` | Vite | Components, Modules |
| `angular.json` | Angular | Modules, Services, Components |
| `nuxt.config.*` | Nuxt | Pages, Plugins, Modules |
| `package.json` + express | Express | Routes, Middleware |
| `go.mod` | Go | Packages, Handlers |
| `Cargo.toml` | Rust | Crates, Modules |
| `pyproject.toml` | Python | Packages, Modules |

---

## Codemap Templates

### INDEX.md (Architecture Overview)

```markdown
# Architecture Overview

**Last Updated:** YYYY-MM-DD
**Framework:** [Detected Framework]
**Language:** [Primary Language]

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Pages   │  │ Comps   │  │ Hooks   │         │
│  └────┬────┘  └────┬────┘  └────┬────┘         │
└───────┼────────────┼────────────┼───────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────┐
│                   Backend                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ API     │  │ Services│  │ Models  │         │
│  └────┬────┘  └────┬────┘  └────┬────┘         │
└───────┼────────────┼────────────┼───────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────┐
│              External Services                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Database│  │ Auth    │  │ Storage │         │
│  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────┘
```

## Key Entry Points

| Entry Point | Purpose | Location |
|-------------|---------|----------|
| ... | ... | ... |

## Directory Structure

```
src/
├── app/          # [description]
├── components/   # [description]
├── lib/          # [description]
└── ...
```

## Related Codemaps

- [Frontend](./frontend.md)
- [Backend](./backend.md)
- [Database](./database.md)
- [Integrations](./integrations.md)
```

### frontend.md

```markdown
# Frontend Architecture

**Last Updated:** YYYY-MM-DD
**Framework:** [React/Vue/Angular/etc.]
**Entry Point:** [main entry file]

## Component Hierarchy

```
App
├── Layout
│   ├── Header
│   ├── Sidebar
│   └── Footer
├── Pages
│   ├── HomePage
│   ├── DashboardPage
│   └── ...
└── Shared
    ├── Button
    ├── Input
    └── ...
```

## Key Components

| Component | Purpose | Props | Location |
|-----------|---------|-------|----------|
| ... | ... | ... | ... |

## State Management

- **Solution**: [Redux/Zustand/Context/etc.]
- **Global State**: [description]
- **Local State**: [description]

## Routing

| Route | Component | Auth Required |
|-------|-----------|---------------|
| / | HomePage | No |
| /dashboard | DashboardPage | Yes |
| ... | ... | ... |

## Data Flow

[Description of how data flows through frontend]
```

### backend.md

```markdown
# Backend Architecture

**Last Updated:** YYYY-MM-DD
**Runtime:** [Node.js/Go/Python/etc.]
**Framework:** [Express/Fastify/Gin/etc.]

## API Endpoints

| Method | Route | Handler | Auth | Description |
|--------|-------|---------|------|-------------|
| GET | /api/users | getUsers | Yes | List users |
| POST | /api/users | createUser | Yes | Create user |
| ... | ... | ... | ... | ... |

## Service Layer

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| UserService | User operations | Database, Cache |
| AuthService | Authentication | JWT, Database |
| ... | ... | ... |

## Middleware Stack

```
Request
  ↓
[CORS] → [Auth] → [Validation] → [Handler] → [Response]
```

## Error Handling

- **Strategy**: [Centralized/Distributed]
- **Error Format**: [Standard format]
```

---

## Generation Process

### Phase 1: Discovery

```
1. Detect project type and framework
2. Identify entry points (pages, routes, main files)
3. Scan directory structure
4. Find configuration files
```

### Phase 2: Analysis

```
1. If --ast: Run AST analysis on source files
2. If --deps: Generate dependency graph
3. Extract exports, imports, relationships
4. Identify patterns (MVC, Clean Architecture, etc.)
```

### Phase 3: Generation

```
1. Generate INDEX.md with overview
2. Generate area-specific codemaps
3. Create ASCII diagrams
4. Generate tables with module info
5. Add timestamps and metadata
```

### Phase 4: Validation

```
1. Verify all file paths exist
2. Check for broken references
3. Validate link targets
4. Report coverage statistics
```

---

## Output Format

### J.A.R.V.I.S. Format

```markdown
## J.A.R.V.I.S.: Codemap Generation Complete

### Generated Files
| File | Lines | Modules Documented |
|------|-------|-------------------|
| docs/CODEMAPS/INDEX.md | 120 | 5 entry points |
| docs/CODEMAPS/frontend.md | 85 | 12 components |
| docs/CODEMAPS/backend.md | 95 | 8 endpoints |

### Coverage
- Files analyzed: 47
- Modules documented: 25
- Dependencies mapped: 32
- Circular dependencies: 0

### Predictive Suggestions
- Consider documenting workers/ directory
- API rate limiting not documented
```

### F.R.I.D.A.Y. Format

```markdown
## F.R.I.D.A.Y.: Migration Codemap

### Source vs Target Comparison
| Area | Source Modules | Target Modules | Delta |
|------|----------------|----------------|-------|
| Frontend | 15 | 12 | -3 (consolidated) |
| Backend | 8 | 8 | 0 |
| Database | 5 | 5 | 0 |

### Migration Documentation Status
- as_is_spec.md: COMPLETE
- to_be_spec.md: COMPLETE
- CODEMAPS: GENERATED
```

---

## Integration

### With /jikime:docs

```bash
# Generate codemaps then sync docs
/jikime:codemap all
/jikime:docs sync
```

### With /jikime:3-sync

Codemap generation is part of the sync workflow:
```
/jikime:3-sync SPEC-XXX
  → Generates codemaps automatically
  → Updates README references
```

---

## EXECUTION DIRECTIVE

1. Detect project framework and language
2. Parse $ARGUMENTS for area and options
3. If `--ast`: Check for ts-morph, run AST analysis
4. If `--deps`: Check for madge, generate dependency graph
5. Scan codebase for:
   - Entry points (pages, routes, main)
   - Component structure
   - API endpoints
   - Database models
   - External integrations
6. Generate codemap files in docs/CODEMAPS/
7. Create ASCII diagrams for architecture
8. Validate all paths and links
9. Report generation summary

Execute NOW. Generate actual codemaps from the codebase.

---

## Related Commands

- `/jikime:docs` - Documentation sync
- `/jikime:cleanup` - Dead code removal
- `/jikime:3-sync` - Full sync workflow
- `/jikime:learn` - Codebase exploration

---

Version: 1.0.0
Type: Utility Command (Type B)
Integration: AST analysis, Dependency graphs, J.A.R.V.I.S./F.R.I.D.A.Y.
