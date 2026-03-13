# Core Rules - HARD Rules (Mandatory)

These rules are non-negotiable and must be followed at all times.

## Language Rules

- [HARD] **Language-Aware Responses**: All user-facing responses MUST be in user's `conversation_language`
- [HARD] **Internal Communication**: Agent-to-agent communication uses English
- [HARD] **Code Comments**: Follow `code_comments` setting (default: English)

## Execution Rules

- [HARD] **Parallel Execution**: Execute all independent tool calls in parallel when no dependencies exist
- [HARD] **No XML in User Responses**: Never display XML tags in user-facing responses (reserved for agent-to-agent data transfer)

## Output Format Rules

- [HARD] **Markdown Required**: Always use Markdown formatting for user-facing communication
- [HARD] **XML Reserved**: XML tags are reserved for internal agent data transfer only

## Web Search Rules

- [HARD] **URL Verification**: All URLs must be verified via WebFetch before inclusion
- [HARD] **Uncertainty Disclosure**: Unverified information must be marked as uncertain
- [HARD] **Source Attribution**: All web search results must include actual search sources

## MCP Rules

- [HARD] `.pen` files are **encrypted** — NEVER use Read, Grep, or Glob to access their contents
- [HARD] ALWAYS use Pencil MCP tools for `.pen` file operations
- [HARD] If MCP server unavailable, fall back to native tools without error

## Checklist

Before responding to user:

- [ ] Response is in user's `conversation_language`
- [ ] Independent operations are parallelized
- [ ] No XML tags visible in response
- [ ] Markdown formatting is applied
- [ ] URLs are verified before inclusion

## Violation Examples

**DO NOT**:
```
<response>This is wrong</response>  <!-- XML visible to user -->
```

**DO**:
```markdown
## Response
This is correct - using Markdown format
```

## Lessons Protocol

Capture and reuse learnings from user corrections and agent failures across sessions.

Rules:
- When user corrects agent behavior, capture the pattern in auto-memory
- Store lessons at `~/.claude/projects/{project-hash}/memory/lessons.md`
- Each lesson entry format: `[CATEGORY] Incorrect: <pattern> | Correct: <approach> | Added: <date>`
- Review relevant lessons before starting tasks in the same domain
- Lesson categories: `architecture`, `testing`, `naming`, `workflow`, `security`, `performance`
- Maximum 50 active lessons per project; archive older entries to `lessons-archive.md` in the same directory
- Lessons are additive: never overwrite a lesson, append corrections as updates
- To supersede a lesson, add `[SUPERSEDED by #{new_lesson_number}]` prefix to the old entry
- Session start: scan lessons for patterns matching current task domain

---

Version: 1.2.0
Source: Extracted from CLAUDE.md Section 1, 8 + consolidated HARD rules from web-search.md, mcp-integration.md + Boris Cherny Lessons Protocol
