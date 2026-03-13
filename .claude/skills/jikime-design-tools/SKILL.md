---
name: jikime-design-tools
description: Design tool integration specialist covering Pencil MCP, Figma MCP, and design-to-code export
version: 1.0.0

progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~5000

triggers:
  keywords: ["figma", "pencil", "design to code", "design export", "pen frame", "react from design", "tailwind from design", "design context", "ui implementation", "design fetching", "figma mcp", "pencil mcp", "component from design", "layout from design", "batch_design", "get_screenshot", "style guide", "design tokens"]
  agents: ["designer-ui", "team-designer"]
  phases: ["run"]
---

# Design Tools Integration Skill

Unified design tool integration for Pencil MCP and Figma MCP workflows.

## Allowed Tools

Read, Write, Edit, Grep, Glob, Bash, WebFetch, WebSearch,
mcp__context7__resolve-library-id, mcp__context7__query-docs,
mcp__pencil__batch_design, mcp__pencil__batch_get,
mcp__pencil__get_screenshot, mcp__pencil__snapshot_layout,
mcp__pencil__get_editor_state, mcp__pencil__get_variables,
mcp__pencil__set_variables, mcp__pencil__get_guidelines,
mcp__pencil__get_style_guide, mcp__pencil__get_style_guide_tags,
mcp__pencil__open_document, mcp__pencil__find_empty_space_on_canvas,
mcp__pencil__search_all_unique_properties, mcp__pencil__replace_all_matching_properties

## Default Design Style: shadcn/ui Nova

When no specific style requested, use **shadcn/ui Nova** preset:

```bash
bunx --bun shadcn@latest create --preset "https://ui.shadcn.com/init?base=radix&style=nova&baseColor=neutral&theme=neutral&iconLibrary=hugeicons&font=noto-sans&menuAccent=bold&menuColor=default&radius=small&template=next&rtl=false" --template next
```

| Property | Value |
|----------|-------|
| Style | nova (Modern, clean design language) |
| Base Color | neutral (Notion-style grayscale palette) |
| Icon Library | hugeicons |
| Font | noto-sans |
| Radius | small (Subtle rounded corners) |
| Menu Accent | bold |

## Pencil MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `batch_design` | Create, modify, and manipulate design elements in batches (max 25 ops) |
| `batch_get` | Read design components and hierarchy by patterns or node IDs |
| `get_screenshot` | Render design previews as images |
| `snapshot_layout` | Analyze computed layout structure |
| `get_editor_state` | Get current editor context and active file |
| `get_variables` | Read design tokens and theme variables |
| `set_variables` | Update design tokens and theme variables |
| `get_guidelines` | Get design guidelines (code, table, tailwind, landing-page) |
| `get_style_guide` | Get style guide by name or tags |
| `get_style_guide_tags` | List all available style guide tags |
| `open_document` | Open existing .pen file or create new one |
| `find_empty_space_on_canvas` | Find available space for new elements |
| `search_all_unique_properties` | Search unique property values across node tree |
| `replace_all_matching_properties` | Bulk replace matching properties |

## Pencil MCP Workflow

### Starting a Design Session

1. **Check Editor State**: `get_editor_state()` to understand current context
2. **Open/Create Document**: `open_document("new")` or path to existing `.pen` file
3. **Get Design Guidelines**: `get_guidelines(topic: "tailwind")` for relevant rules
4. **Discover Styles**: `get_style_guide_tags()` then `get_style_guide(tags: [...])` for inspiration
5. **Set Design Tokens**: `set_variables({...})` for colors, spacing, typography

### Creating Designs

1. **Generate with batch_design** (max 25 operations per call):
   - `foo=I("parent", { ... })` — Insert new node
   - `baz=C("nodeid", "parent", { ... })` — Copy existing node
   - `foo2=R("nodeid1/nodeid2", {...})` — Replace node content
   - `U(foo+"/nodeid", {...})` — Update existing node
   - `D("dfFAeg2")` — Delete node
   - `M("nodeid3", "parent", 2)` — Move node to new parent
   - `G("baz", "ai", "...")` — Generate image with AI

2. **Visual Validation**: `get_screenshot()` after each round of changes
3. **Layout Analysis**: `snapshot_layout()` to verify positioning
4. **Iterate**: `batch_get(patterns)` to inspect, then `batch_design` to refine

## HARD RULES

- NEVER use Read or Grep tools to access `.pen` file contents (they are encrypted)
- ALWAYS use Pencil MCP tools for `.pen` file operations
- ALWAYS call `get_editor_state()` first before any design operations
- ALWAYS validate with `get_screenshot()` after design changes
- Maximum 25 operations per `batch_design` call

## Reference Documents

For detailed guides, see:
- `reference/pencil-renderer.md` — Pencil MCP rendering guide with operation syntax
- `reference/pencil-code.md` — Design-to-code export patterns
- `reference/comparison.md` — Figma vs Pencil decision guide
