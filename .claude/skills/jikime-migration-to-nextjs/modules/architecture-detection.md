# Architecture Detection Algorithm

Detection patterns for identifying source project architecture patterns in migration projects.

## Detection Priority

1. **Directory structure analysis** (primary: frontend/, backend/, client/, server/ separation)
2. **Package manifest analysis** (secondary: multiple package.json, workspaces, monorepo config)
3. **Framework characteristic analysis** (tertiary: fullstack vs SPA vs API-only indicators)
4. **Import/require pattern analysis** (quaternary: cross-boundary imports, API client usage)

## Architecture Pattern Definitions

### Monolith

Single codebase where frontend and backend code coexist without clear separation.

```yaml
monolith:
  directory_patterns:
    - Single root package.json with both frontend and backend deps
    - Server-side templates mixed with application logic
    - No frontend/ or backend/ top-level separation
  framework_indicators:
    - Laravel (Blade templates + Eloquent + Controllers)
    - Django (Templates + Models + Views)
    - Rails (ERB/Haml + ActiveRecord + Controllers)
    - Express + EJS/Pug/Handlebars
    - Next.js (App Router + API Routes + Server Components)
    - Nuxt.js (Pages + Server Routes)
  config_indicators:
    - Single package.json with both "react" and "express"
    - Single package.json with both UI framework and ORM
    - Server-side rendering framework (Next.js, Nuxt, SvelteKit)
  code_patterns:
    - Direct DB access from route handlers or page components
    - Template rendering with server-side data
    - Shared models/types between frontend and backend in same directory
```

### Separated

Frontend and backend are clearly separated into distinct projects or directories.

```yaml
separated:
  directory_patterns:
    - frontend/ and backend/ (or client/ and server/) directories
    - packages/ with separate frontend and backend packages
    - Separate root directories with individual package.json
  config_indicators:
    - Multiple package.json files (one per directory)
    - Monorepo config (turbo.json, pnpm-workspace.yaml, lerna.json, nx.json)
    - Docker Compose with separate frontend and backend services
    - Separate Dockerfile per service
  code_patterns:
    - Frontend uses API client (fetch, axios) to communicate with backend
    - No direct DB imports in frontend code
    - API contracts defined (OpenAPI spec, GraphQL schema, tRPC router)
    - CORS configuration in backend
  deployment_indicators:
    - Separate deployment configs per service
    - Different runtime requirements (Node.js frontend + Python backend)
```

### Unknown

Cannot reliably determine architecture pattern.

```yaml
unknown:
  conditions:
    - No clear frontend or backend indicators
    - Mixed signals (some separation but not consistent)
    - Very small project with minimal structure
  action: Ask user during Phase 2 (Plan)
```

## Detection Logic

```python
def detect_architecture(project_path):
    """Detect source project architecture pattern."""

    # 1. Check for explicit separation
    has_frontend_dir = any([
        exists(f"{project_path}/frontend"),
        exists(f"{project_path}/client"),
        exists(f"{project_path}/web"),
        exists(f"{project_path}/app"),  # only if backend dir also exists
    ])

    has_backend_dir = any([
        exists(f"{project_path}/backend"),
        exists(f"{project_path}/server"),
        exists(f"{project_path}/api"),
    ])

    if has_frontend_dir and has_backend_dir:
        return "separated", {
            "frontend_dir": detect_frontend_dir(project_path),
            "backend_dir": detect_backend_dir(project_path),
            "confidence": "high"
        }

    # 2. Check for monorepo configuration
    monorepo_configs = [
        "turbo.json", "pnpm-workspace.yaml",
        "lerna.json", "nx.json"
    ]
    for config in monorepo_configs:
        if exists(f"{project_path}/{config}"):
            packages = analyze_monorepo_packages(project_path, config)
            if has_frontend_and_backend_packages(packages):
                return "separated", {
                    "monorepo": True,
                    "packages": packages,
                    "confidence": "high"
                }

    # 3. Check for multiple package.json files
    package_jsons = glob(f"{project_path}/*/package.json")
    if len(package_jsons) > 1:
        pkg_analysis = analyze_package_roles(package_jsons)
        if pkg_analysis.has_frontend and pkg_analysis.has_backend:
            return "separated", {
                "multi_package": True,
                "confidence": "medium"
            }

    # 4. Check for monolith framework indicators
    root_pkg = load_json(f"{project_path}/package.json")
    deps = {**root_pkg.get("dependencies", {}), **root_pkg.get("devDependencies", {})}

    # Fullstack frameworks (inherently monolith)
    fullstack_indicators = [
        "next",           # Next.js
        "nuxt",           # Nuxt.js
        "@sveltejs/kit",  # SvelteKit
        "laravel/framework",  # Laravel (from composer.json)
    ]
    for indicator in fullstack_indicators:
        if indicator in deps:
            return "monolith", {
                "fullstack_framework": indicator,
                "confidence": "high"
            }

    # Mixed frontend + backend deps in single package.json
    frontend_deps = ["react", "vue", "svelte", "@angular/core"]
    backend_deps = ["express", "fastify", "koa", "hono", "nest"]
    has_frontend = any(d in deps for d in frontend_deps)
    has_backend = any(d in deps for d in backend_deps)

    if has_frontend and has_backend:
        return "monolith", {
            "mixed_deps": True,
            "confidence": "medium"
        }

    # 5. Check Docker Compose for service separation
    if exists(f"{project_path}/docker-compose.yml") or exists(f"{project_path}/docker-compose.yaml"):
        services = parse_docker_compose(project_path)
        if has_separate_frontend_backend_services(services):
            return "separated", {
                "docker_based": True,
                "confidence": "medium"
            }

    # 6. Check traditional server-side frameworks
    # Laravel
    if exists(f"{project_path}/composer.json"):
        composer = load_json(f"{project_path}/composer.json")
        if "laravel/framework" in composer.get("require", {}):
            return "monolith", {
                "fullstack_framework": "laravel",
                "confidence": "high"
            }

    # Django
    if exists(f"{project_path}/manage.py"):
        return "monolith", {
            "fullstack_framework": "django",
            "confidence": "high"
        }

    # Rails
    if exists(f"{project_path}/Gemfile"):
        gemfile = read(f"{project_path}/Gemfile")
        if "rails" in gemfile.lower():
            return "monolith", {
                "fullstack_framework": "rails",
                "confidence": "high"
            }

    # Frontend-only (SPA without backend)
    if has_frontend and not has_backend:
        return "monolith", {
            "frontend_only_source": True,
            "confidence": "medium",
            "note": "Frontend-only source, no backend detected"
        }

    return "unknown", {
        "confidence": "low",
        "note": "Could not determine architecture pattern"
    }
```

## Architecture-Specific Notes

### Monolith Sources

When source is monolith, the user has full flexibility to choose any target architecture:
- **fullstack-monolith**: Natural 1:1 migration (e.g., Laravel → Next.js)
- **frontend-backend**: Decompose during migration (e.g., Laravel → Next.js + FastAPI)
- **frontend-only**: Extract only the frontend (e.g., Laravel Blade → Next.js, keep Laravel API)

### Separated Sources

When source is already separated:
- **frontend-backend**: Natural 1:1 migration preserving separation
- **fullstack-monolith**: Consolidate into single project (less common)
- **frontend-only**: Migrate only the frontend part

### Unknown Sources

When architecture cannot be determined:
- Present findings to user in Phase 2
- Let user classify the source architecture
- Proceed based on user's classification

---

Version: 1.0.0
Source: jikime-migration-to-nextjs SKILL.md
