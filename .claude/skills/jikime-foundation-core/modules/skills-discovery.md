# Skills Discovery & Management

Rules for discovering, loading, and utilizing skills in Claude Code.

## Skill Discovery Commands

Use the `jikime-adk skill` CLI commands to discover and explore available skills:

```bash
# List all available skills
jikime-adk skill list

# Filter by tag, phase, agent, or language
jikime-adk skill list --tag framework
jikime-adk skill list --phase run
jikime-adk skill list --agent frontend
jikime-adk skill list --language typescript

# Search skills by keyword
jikime-adk skill search <keyword>
jikime-adk skill search "react components"
jikime-adk skill search nextjs --limit 5

# Find related skills
jikime-adk skill related <skill-name>
jikime-adk skill related jikime-lang-typescript --limit 5

# Get detailed skill information
jikime-adk skill info <skill-name>
jikime-adk skill info jikime-lang-typescript --body  # Include full markdown body
```

## When to Use Skill Discovery

| Scenario | Action |
|----------|--------|
| Starting new task with unfamiliar technology | `jikime-adk skill search <technology>` |
| Need framework-specific patterns | `jikime-adk skill list --tag framework` |
| Looking for language-specific guidance | `jikime-adk skill list --language <lang>` |
| Finding related skills to loaded skill | `jikime-adk skill related <skill-name>` |
| Understanding skill triggers and content | `jikime-adk skill info <skill-name> --body` |

## Skill Loading Rules

### Automatic Loading (Triggers)

Skills are automatically loaded when triggers match:

```yaml
triggers:
  keywords: ["react", "component"]     # User input contains these words
  phases: ["run"]                      # Current development phase
  agents: ["frontend"]          # Agent being used
  languages: ["typescript", "javascript"]  # Project language
```

### Manual Loading

Load skills explicitly using the Skill tool:

```
Skill("jikime-lang-typescript")
Skill("jikime-platform-vercel")
```

### Progressive Disclosure

Skills follow a 3-level loading system:

| Level | Content | Tokens | When Loaded |
|-------|---------|--------|-------------|
| **Level 1** | Metadata only | ~100 | Agent initialization |
| **Level 2** | Full body | ~5K | Trigger conditions match |
| **Level 3+** | Bundled files | Variable | On-demand by Claude |

## Skill Categories

### Language Skills (`jikime-lang-*`)

Programming language specialists:
- `jikime-lang-typescript` - TypeScript 5.9+ patterns
- `jikime-lang-python` - Python 3.13+ patterns
- `jikime-lang-go` - Go 1.23+ patterns
- etc.

### Platform Skills (`jikime-platform-*`)

Platform integration specialists:
- `jikime-platform-vercel` - Vercel deployment
- `jikime-platform-supabase` - Supabase backend
- etc.

### Domain Skills (`jikime-domain-*`)

Domain expertise:
- `jikime-domain-frontend` - Frontend development
- `jikime-domain-backend` - Backend development
- `jikime-domain-database` - Database patterns
- etc.

### Workflow Skills (`jikime-workflow-*`)

Development workflows:
- `jikime-workflow-spec` - SPEC document creation
- `jikime-workflow-ddd` - Domain-driven development
- `jikime-workflow-testing` - Testing workflows
- etc.

### Foundation Skills (`jikime-foundation-*`)

Core framework knowledge:
- `jikime-foundation-claude` - Claude Code patterns
- `jikime-foundation-core` - JikiME-ADK core concepts
- etc.

## Best Practices

### DO

- Use `jikime-adk skill search` before starting unfamiliar tasks
- Load language-specific skills when working with code
- Check `--body` output for detailed implementation patterns
- Use `related` command to discover complementary skills

### DON'T

- Load all skills at once (token inefficient)
- Ignore skill triggers in SKILL.md frontmatter
- Skip skill discovery for complex implementations
- Manually implement patterns covered by existing skills

## Integration with Agents

Agents can specify required skills in their frontmatter:

```yaml
---
name: frontend
skills: jikime-domain-frontend, jikime-lang-typescript
---
```

These skills are loaded at Level 1 during agent initialization.

## Checklist

Before implementing complex features:

- [ ] Searched for relevant skills with `jikime-adk skill search`
- [ ] Checked language-specific skill with `--language` filter
- [ ] Reviewed skill content with `--body` flag if needed
- [ ] Loaded necessary skills for the task

---

Version: 1.0.0
Source: JikiME-ADK Skill System v2.0
