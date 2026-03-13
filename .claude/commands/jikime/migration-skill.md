# Migration Skill Generator

Generate or enhance migration skills following the official Claude Code Skills specification.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--from` | Yes | Source framework (cra, vue, angular, svelte, jquery, php) |
| `--to` | Yes | Target framework (nextjs, nuxt, react, vue) |
| `--enhance-only` | No | Only enhance existing skill, don't create new |

## Examples

```bash
# Create CRA to Next.js migration patterns
/jikime:migration-skill --from cra --to nextjs

# Create Vue to Nuxt migration patterns
/jikime:migration-skill --from vue --to nuxt

# Enhance existing skill with latest docs
/jikime:migration-skill --from angular --to react --enhance-only
```

---

## Official Skills Specification Reference

Based on https://code.claude.com/docs/ko/skills

Claude Code 기술은 [Agent Skills](https://agentskills.io) 개방형 표준을 따르며, Claude Code는 호출 제어, 서브에이전트 실행, 동적 컨텍스트 주입 등의 추가 기능으로 표준을 확장합니다.

### Compatibility Note

`.claude/commands/`의 파일과 `.claude/skills/<name>/SKILL.md`의 기술 모두 동일한 방식으로 작동합니다. 기존 `.claude/commands/` 파일은 계속 작동하며, 같은 이름의 명령어보다 기술이 우선합니다.

### Frontmatter Fields (All Optional)

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Skill display name (becomes `/slash-command`) | `migrate-jquery` |
| `description` | What skill does and when to use (for auto-load) | `jQuery to React migration...` |
| `argument-hint` | Autocomplete hint | `[source-path]` |
| `disable-model-invocation` | Prevent Claude auto-invoke (user-only) | `true` |
| `user-invocable` | Hide from `/` menu (Claude-only background) | `false` |
| `allowed-tools` | Tools allowed without permission prompt | `Read, Grep, Glob` |
| `model` | Model to use when skill activated | `opus` |
| `context` | Run in subagent context | `fork` |
| `agent` | Subagent type when `context: fork` | `Explore`, `Plan` |
| `hooks` | Skill-scoped hooks | See Hooks docs |

### String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed when invoking skill. If not in content, auto-appended as `ARGUMENTS: <value>` |
| `${CLAUDE_SESSION_ID}` | Current session ID |

### Skill Content Types

| Type | Description | Recommended Settings |
|------|-------------|---------------------|
| **Reference** | Rules, patterns, style guides, domain knowledge (runs inline) | Default settings |
| **Task** | Step-by-step instructions for specific workflows (deploy, commit) | `disable-model-invocation: true` |

### Extended Thinking

Include `"ultrathink"` anywhere in skill content to enable extended thinking mode for deep analysis.

### Dynamic Context Injection

Execute shell commands before sending to Claude:

```markdown
## Current package.json
!`cat package.json`

## Git status
!`git status --short`
```

### Subagent Execution

Run skill in isolated context:

```yaml
---
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---
```

Available agents: `Explore`, `Plan`, `general-purpose`, or custom agents in `.claude/agents/`

### Size Guidelines

- **SKILL.md**: Keep under 500 lines. Move detailed reference to separate files.
- **Character Budget**: Skill descriptions are limited by `SLASH_COMMAND_TOOL_CHAR_BUDGET` (default: 15,000 chars). Set env var to increase if many skills are excluded.

---

## Execution Workflow

### Phase 1: Context7 Research

Query latest migration documentation:

```markdown
1. Resolve library ID for target framework
2. Query: "{from} to {to} migration guide"
3. Query: "official codemod CLI tools"
4. Query: "incremental migration strategies"
5. Query: "common pitfalls and solutions"
```

### Phase 2: Skill Discovery

Check existing skill structure:

```markdown
1. Search for existing skill:
   - jikime-migration-to-{to}
   - jikime-migrate-{from}-to-{to}

2. If exists → Prepare enhancement plan
3. If not exists → Use template for creation
```

### Phase 3: Skill Structure Generation

Create complete skill directory:

```
jikime-migration-{from}-to-{to}/
├── SKILL.md                    # Main skill (required)
├── modules/
│   ├── {from}-patterns.md      # Detailed conversion patterns
│   ├── migration-scenarios.md  # Common migration scenarios
│   └── troubleshooting.md      # Common issues and solutions
├── examples/
│   ├── before-after.md         # Code comparison examples
│   └── sample-migration.md     # Complete migration example
└── scripts/
    └── analyze.sh              # Optional analysis script
```

### Phase 4: SKILL.md Template

Generate SKILL.md with official frontmatter:

```yaml
---
name: migrate-{from}-to-{to}
description: |
  {From} to {To} migration specialist. Converts legacy {from} applications
  to modern {to} with best practices. Use when migrating {from} projects
  or asking about {from} to {to} conversion patterns.
argument-hint: [source-path]
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Edit, Write
context: fork
agent: Explore
---

# {From} → {To} Migration

## Quick Reference

| {From} Pattern | {To} Equivalent |
|----------------|-----------------|
| ... | ... |

## Dynamic Context (auto-loaded)

### Current Dependencies
!`cat package.json 2>/dev/null | grep -A 20 '"dependencies"' || echo "No package.json"`

### Source Framework Detection
!`ls -la src/ 2>/dev/null | head -20 || echo "No src directory"`

## Migration Process

1. **Analyze**: Identify {from} patterns and dependencies
2. **Plan**: Map {from} patterns to {to} equivalents
3. **Execute**: Transform code incrementally
4. **Verify**: Test behavior preservation

## Module Reference

For detailed patterns, load:
- [Conversion Patterns](modules/{from}-patterns.md)
- [Migration Scenarios](modules/migration-scenarios.md)
- [Troubleshooting](modules/troubleshooting.md)

## Examples

See [examples/](examples/) for complete migration examples.
```

### Phase 5: Pattern Module Template

Generate `modules/{from}-patterns.md`:

```markdown
# {From} → {To} Migration Patterns

## Official Migration Tools

### Codemod (if available)
\`\`\`bash
npx @{to}/codemod {from}-to-{to}
\`\`\`

## Incremental Migration Strategy

### Phase 1: Coexistence
- Set up {to} alongside {from}
- Both frameworks run simultaneously

### Phase 2: Gradual Migration
- Start with isolated components
- Work up to container components

### Phase 3: Completion
- Remove {from} dependency
- Clean up hybrid patterns

## Pattern Mapping

### [Category 1]
**{From}**:
\`\`\`{from-lang}
// {from} code
\`\`\`

**{To}**:
\`\`\`{to-lang}
// {to} equivalent
\`\`\`

### [Category 2]
...

## Common Pitfalls

1. **Pitfall 1**: Description and solution
2. **Pitfall 2**: Description and solution

---

Version: 1.0.0
Source: Context7 + Official Documentation
```

---

## Framework Support Matrix

### Source Frameworks

| Framework | Alias | Detection Pattern |
|-----------|-------|-------------------|
| Create React App | `cra` | `react-scripts` in package.json |
| Vue.js 2/3 | `vue` | `vue` in package.json |
| Angular | `angular` | `@angular/core` in package.json |
| Svelte | `svelte` | `svelte` in package.json |
| jQuery | `jquery` | `jquery` in package.json or `$()` patterns |
| PHP/Laravel | `php` | `composer.json` exists |

### Target Frameworks

| Framework | Alias | Default Version |
|-----------|-------|-----------------|
| Next.js | `nextjs` | 16 (App Router) |
| Nuxt | `nuxt` | 3 |
| React | `react` | 19 |
| Vue | `vue` | 3.5 |

---

## Context7 Query Templates

### Migration Guide Query

```
libraryId: /websites/{to}_dev (or appropriate)
query: "{from} to {to} migration guide official"
```

### Pattern Query

```
query: "{from} {pattern} equivalent in {to}"
Patterns: routing, state, data fetching, lifecycle, components
```

### Best Practices Query

```
query: "{to} performance best practices migration"
```

---

## Advanced Features

### Dynamic Context Injection

Include in SKILL.md for real-time project analysis:

```markdown
## Project Analysis (auto-loaded)

### Dependencies
!`cat package.json 2>/dev/null | jq '.dependencies' || echo "{}"`

### Source Structure
!`find src -name "*.{from-ext}" 2>/dev/null | head -20`

### Framework Version
!`cat package.json 2>/dev/null | jq '.dependencies.{from}' || echo "unknown"`
```

### Subagent Execution

For complex migrations, use forked context:

```yaml
---
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob, Bash(npm:*, npx:*)
---
```

### Access Control

For skills with side effects:

```yaml
---
disable-model-invocation: true  # User must invoke manually
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm:*, git:*)
---
```

---

## Troubleshooting Template

Include troubleshooting section in generated skills:

```markdown
## Troubleshooting

### Skill not triggering
- Check if description contains keywords users would naturally use
- Verify skill appears in `사용 가능한 기술은 무엇입니까?`
- Try rephrasing request to match description
- If user-invocable, try `/skill-name` directly

### Skill triggers too often
- Make description more specific
- Add `disable-model-invocation: true` for manual-only

### Claude doesn't see all skills
- Check `/context` for excluded skills warnings
- Increase `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable
```

---

## Visual Output Pattern (Optional)

For skills that generate visual reports (HTML dashboards, diagrams):

```
skill-name/
├── SKILL.md
└── scripts/
    └── visualize.py    # Generates HTML output
```

Example SKILL.md section:
```markdown
## Usage

Run visualization script:
\`\`\`bash
python ~/.claude/skills/skill-name/scripts/visualize.py .
\`\`\`

This generates `output.html` and opens in browser.
```

---

## Quality Checklist

Before completing skill generation:

- [ ] Context7 latest documentation retrieved
- [ ] Frontmatter follows official specification
- [ ] `description` clearly states when to use skill (for auto-load)
- [ ] All major migration patterns documented
- [ ] Dynamic context injection for project analysis
- [ ] Code examples are syntactically correct
- [ ] Incremental migration strategy included
- [ ] Official tools/codemods documented (if available)
- [ ] Troubleshooting section for common issues
- [ ] SKILL.md under 500 lines (detailed content in modules/)
- [ ] Version and changelog updated
- [ ] Supporting files linked from SKILL.md with clear descriptions

---

## Skill Locations Reference

| Location | Path | Applies To |
|----------|------|------------|
| Enterprise | Managed Settings | All org users |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All projects |
| Project | `.claude/skills/<name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where plugin active |

Project skills override personal skills with the same name.

---

Version: 2.1.0
Last Updated: 2026-01-25
Source: https://code.claude.com/docs/ko/skills (Official)
Standards: Agent Skills (https://agentskills.io)
