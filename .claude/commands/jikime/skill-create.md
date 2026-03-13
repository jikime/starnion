---
description: "Create specialized Claude Code skills with Progressive Disclosure structure. Generates SKILL.md with examples.md and reference.md based on skill type."
argument-hint: '--type <lang|platform|domain|workflow|library|framework> --name <name> [--enhance-only]'
type: generator
allowed-tools: Task, AskUserQuestion, TodoWrite, Bash, Read, Write, Edit, Glob, Grep, mcp__context7__resolve-library-id, mcp__context7__query-docs
model: inherit
---

# Skill Create - Claude Code Skill Generator

Generate specialized Claude Code skills following the official Anthropic SKILL.md specification with Progressive Disclosure.

## Usage

```bash
/jikime:skill-create --type <type> --name <name> [--enhance-only]
```

| Argument | Required | Options | Description |
|----------|----------|---------|-------------|
| `--type` | Yes | `lang`, `platform`, `domain`, `workflow`, `library`, `framework` | Skill type |
| `--name` | Yes | Any valid name | Skill name (e.g., typescript, supabase, frontend) |
| `--enhance-only` | No | - | Enhance existing skill only (no new creation) |

### Examples

```bash
# Create language specialist skill
/jikime:skill-create --type lang --name rust

# Create platform integration skill
/jikime:skill-create --type platform --name firebase

# Create domain expertise skill
/jikime:skill-create --type domain --name security

# Create workflow skill
/jikime:skill-create --type workflow --name ci-cd

# Create library skill
/jikime:skill-create --type library --name prisma

# Create framework skill
/jikime:skill-create --type framework --name remix

# Enhance existing skill
/jikime:skill-create --type lang --name python --enhance-only
```

---

## Generated Structure by Type

### Type: `lang` (Language Specialist)

```
jikime-lang-{name}/
├── SKILL.md              # Main skill file
├── examples.md           # Production-ready code examples
└── reference.md          # Complete API reference
```

### Type: `platform` (Platform Integration)

```
jikime-platform-{name}/
├── SKILL.md              # Main skill file
├── setup.md              # Setup and configuration guide
└── reference.md          # API and integration reference
```

### Type: `domain` (Domain Expertise)

```
jikime-domain-{name}/
├── SKILL.md              # Main skill file
├── patterns.md           # Domain-specific patterns
└── examples.md           # Implementation examples
```

### Type: `workflow` (Workflow Patterns)

```
jikime-workflow-{name}/
├── SKILL.md              # Main skill file
├── steps.md              # Workflow steps and phases
└── examples.md           # Workflow examples
```

### Type: `library` (Library Specialist)

```
jikime-library-{name}/
├── SKILL.md              # Main skill file
├── examples.md           # Usage examples
└── reference.md          # API reference
```

### Type: `framework` (Framework Specialist)

```
jikime-framework-{name}/
├── SKILL.md              # Main skill file
├── patterns.md           # Framework patterns
└── upgrade.md            # Version upgrade guide
```

---

## Execution Workflow

### Phase 1: Context7 Research

Based on skill type, query Context7 for relevant documentation:

| Type | Context7 Query Focus |
|------|---------------------|
| `lang` | Language features, syntax, best practices |
| `platform` | Platform APIs, SDK, integration patterns |
| `domain` | Domain patterns, architecture, best practices |
| `workflow` | Process steps, automation, CI/CD patterns |
| `library` | Library API, usage patterns, examples |
| `framework` | Framework conventions, routing, components |

**Query Steps:**
1. Resolve library ID with `mcp__context7__resolve-library-id`
2. Query documentation with `mcp__context7__query-docs`
3. Gather: API patterns, best practices, common pitfalls, version info

### Phase 2: Skill Discovery

Search for existing skill:
- Pattern: `jikime-{type}-{name}` or `jikime-{name}`
- If exists AND `--enhance-only` → Prepare enhancement plan
- If exists AND no flag → Ask user: enhance or replace?
- If not exists → Generate new skill

### Phase 3: SKILL.md Template Generation

Generate SKILL.md with official frontmatter:

```yaml
---
name: jikime-{type}-{name}
description: "{Name} {type} specialist covering [key features]. Use when [trigger conditions]."
version: 1.0.0
tags: ["{type}", "{name}", ...]
triggers:
  keywords: ["{name}", ...]
  phases: ["run"]
  agents: [relevant agents]
  languages: [if applicable]
progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~5000
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Glob
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
---
```

### Phase 4: Supporting Files Generation

Generate type-specific supporting files:

**examples.md:**
- Production-ready code snippets
- Full project structure examples
- Testing examples
- Common use cases

**reference.md:**
- Complete API reference
- Configuration options
- Context7 library mappings
- Performance tips

**patterns.md (for domain/framework):**
- Design patterns
- Architecture decisions
- Anti-patterns to avoid

**setup.md (for platform):**
- Installation steps
- Configuration guide
- Environment setup

**steps.md (for workflow):**
- Phase definitions
- Step-by-step guide
- Checkpoints

**upgrade.md (for framework):**
- Version differences
- Migration steps
- Breaking changes

### Phase 5: Progressive Disclosure Integration

Ensure SKILL.md references supporting files:

```markdown
## Advanced Patterns

For comprehensive documentation, see:

- examples.md for production-ready code examples
- reference.md for complete API reference and Context7 mappings
```

---

## SKILL.md Content Structure

### Required Sections

```markdown
## Quick Reference (30 seconds)

[Brief description and auto-triggers]

Core Stack:
- [Key technology 1]
- [Key technology 2]

Quick Commands:
[Essential commands in natural language]

---

## Implementation Guide (5 minutes)

### [Feature 1]
[Code examples and explanations]

### [Feature 2]
[Code examples and explanations]

---

## Advanced Patterns

For comprehensive documentation:
- reference.md for complete API reference
- examples.md for production-ready code examples

### Context7 Integration

[Context7 library mappings and query patterns]

---

## Works Well With

- [Related skill 1]
- [Related skill 2]

---

## Quick Troubleshooting

[Common issues and solutions]

---

Last Updated: {date}
Status: Active (v1.0.0)
```

---

## Quality Checklist

Before completion, verify:

- [ ] Context7 documentation queried for latest info
- [ ] Frontmatter follows official spec
- [ ] Description includes trigger conditions ("Use when...")
- [ ] Progressive Disclosure configured correctly
- [ ] SKILL.md under 500 lines
- [ ] Supporting files properly linked
- [ ] Code examples are syntactically correct
- [ ] Context7 library mappings documented
- [ ] Related skills identified
- [ ] Troubleshooting section included
- [ ] Version and changelog present

---

## Skill Storage Locations

| Location | Path | Scope |
|----------|------|-------|
| Personal | `~/.claude/skills/<name>/SKILL.md` | All projects |
| Project | `.claude/skills/<name>/SKILL.md` | Current project only |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | When plugin active |

**Default**: Project-level at `.claude/skills/jikime-{type}-{name}/`

---

## EXECUTION DIRECTIVE

Arguments: $ARGUMENTS

1. **Parse arguments**:
   - Extract `--type`: lang | platform | domain | workflow | library | framework
   - Extract `--name`: skill name
   - Check `--enhance-only` flag

2. **Validate inputs**:
   - IF `--type` missing: Ask user to specify type
   - IF `--name` missing: Ask user to specify name
   - IF invalid type: Show valid options and ask again

3. **Context7 Research**:
   ```
   # Resolve library ID
   mcp__context7__resolve-library-id(libraryName: "{name}")

   # Query documentation based on type
   mcp__context7__query-docs(libraryId: "/...", query: "{type}-specific query")
   ```

4. **Check existing skill**:
   ```bash
   # Search for existing skill
   find .claude/skills ~/.claude/skills -name "jikime-*{name}*" -type d 2>/dev/null
   ```
   - IF found AND `--enhance-only`: Load and enhance
   - IF found AND no flag: AskUserQuestion (Enhance existing / Create new / Cancel)
   - IF not found AND `--enhance-only`: Error - skill not found
   - IF not found: Proceed with creation

5. **Create skill directory**:
   ```bash
   mkdir -p .claude/skills/jikime-{type}-{name}
   ```

6. **Generate SKILL.md**:
   - Use template based on type
   - Fill with Context7 research data
   - Include Progressive Disclosure config

7. **Generate supporting files** based on type:
   - lang: examples.md + reference.md
   - platform: setup.md + reference.md
   - domain: patterns.md + examples.md
   - workflow: steps.md + examples.md
   - library: examples.md + reference.md
   - framework: patterns.md + upgrade.md

8. **Verify quality checklist**

9. **Report completion** with skill summary

Execute NOW. Do NOT just describe.

---

## Related Commands

| Command | Description |
|---------|-------------|
| `/jikime:migration-skill` | Create migration-specific skills |
| `jikime-adk skill list` | List all available skills |
| `jikime-adk skill info <name>` | Get skill details |

---

Version: 1.0.0
Last Updated: 2026-01-26
