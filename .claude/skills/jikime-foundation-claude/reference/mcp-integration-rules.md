# MCP Integration Rules

Rules for using MCP (Model Context Protocol) servers in JikiME-ADK workflows.

## Available MCP Servers

| Server | Purpose | Used By |
|--------|---------|---------|
| **context7** | Library documentation, code examples, best practices | All agents |
| **sequential-thinking** | Multi-step reasoning, complex analysis | All agents |
| **pencil** | Visual design creation and editing of `.pen` files | designer-ui, team-designer |

## MCP Tool Usage Rules

### General Rules

- [HARD] **ToolSearch First**: MCP tools are deferred; use ToolSearch before calling MCP tools
- [HARD] **Prefer MCP Tools**: When an MCP tool can accomplish a task, prefer it over manual alternatives
- [HARD] **Graceful Fallback**: If an MCP server is unavailable, fall back to native tools without error

### Pencil MCP Rules

- [HARD] `.pen` files are **encrypted** — NEVER use Read, Grep, or Glob to access their contents
- [HARD] ALWAYS use Pencil MCP tools (`batch_get`, `batch_design`) for `.pen` file operations
- [HARD] Call `get_editor_state()` before any other Pencil MCP operation
- [HARD] Validate designs with `get_screenshot()` after `batch_design` operations
- [HARD] Maximum 25 operations per `batch_design` call

### Context7 Rules

- Use `resolve-library-id` before `query-docs` to get correct library ID
- Cache documentation lookups within session for efficiency
- Fall back to WebSearch if library not found in Context7

### Sequential Thinking Rules

- Use for complex multi-step reasoning (architecture, debugging, trade-offs)
- Auto-activates with `--think`, `--think-hard`, `--ultrathink` flags
- Start with reasonable `totalThoughts` estimate

## Pencil MCP Tool Reference

### Design Operations
| Tool | Purpose |
|------|---------|
| `batch_design` | Create, modify, manipulate design elements (insert, copy, update, replace, move, delete, generate images) |
| `batch_get` | Read nodes by searching patterns or node IDs |
| `open_document` | Open existing `.pen` file or create new one (pass `"new"` for new file) |

### Analysis and Inspection
| Tool | Purpose |
|------|---------|
| `get_editor_state` | Get current editor context, active file, user selection. **Always call first.** |
| `get_screenshot` | Render visual preview of nodes. Use periodically to validate design. |
| `snapshot_layout` | Analyze computed layout rectangles for positioning |
| `find_empty_space_on_canvas` | Find empty areas on canvas for placing new elements |

### Styling and Theming
| Tool | Purpose |
|------|---------|
| `get_guidelines` | Get design rules for topics: `code`, `table`, `tailwind`, `landing-page` |
| `get_style_guide_tags` | Discover available style guide tags |
| `get_style_guide` | Get style guide by tags or name |
| `get_variables` | Extract current design variables and themes |
| `set_variables` | Add or update design variables (tokens, theme values) |

### Bulk Operations
| Tool | Purpose |
|------|---------|
| `search_all_unique_properties` | Search for unique property values across node tree |
| `replace_all_matching_properties` | Replace matching properties for bulk updates |

## Server Activation Patterns

| Trigger | Server | Auto-Activated |
|---------|--------|----------------|
| External library imports | context7 | Yes |
| Design file operations (`.pen`) | pencil | Yes (for designer agents) |
| Complex debugging, `--think` flags | sequential-thinking | Yes |

## Error Handling

| Issue | Recovery |
|-------|----------|
| MCP server unavailable | Fall back to native tools |
| Pencil not running | Inform user to start Pencil app |
| Context7 library not found | Try WebSearch as fallback |
| Sequential timeout | Use native Claude reasoning |

---

Version: 1.0.0
Source: JikiME-ADK MCP integration rules
