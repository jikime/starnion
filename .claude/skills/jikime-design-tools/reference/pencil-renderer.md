# Pencil MCP Rendering Guide

## Important Notes

- `.pen` file contents are encrypted and can ONLY be accessed via Pencil MCP tools
- NEVER use Read or Grep tools to read `.pen` file contents
- ALWAYS use Pencil MCP tools (`batch_get`, `batch_design`) for `.pen` file operations

## Editor State and Document Management

### `get_editor_state()`
- Start with this tool to understand the current editor state
- Returns currently active `.pen` file, user's current selection, and context information

### `open_document(filePathOrNew)`
- Pass `"new"` to create new empty `.pen` file
- Pass `"/path/to/file.pen"` to open existing file

## Design Reading Tools

### `batch_get(patterns, nodeIds)`
- Retrieve nodes by searching patterns or reading specific node IDs
- Supports pattern matching for efficient searching

### `get_screenshot()`
- Render a visual preview of a node in a `.pen` file
- Use periodically to validate designs visually

### `snapshot_layout()`
- Examine computed layout rectangles
- Decide where to insert new nodes
- Understand spatial relationships

### `get_variables()`
- Extract current state of variables and themes
- Design tokens, color definitions, theme configuration

## Design Creation and Modification

### `batch_design(operations)` — Maximum 25 operations per call

| Operation | Syntax | Description |
|-----------|--------|-------------|
| Insert | `foo=I("parent", { ... })` | Create new node |
| Copy | `baz=C("nodeid", "parent", { ... })` | Copy existing node |
| Replace | `foo2=R("nodeid1/nodeid2", {...})` | Replace node content |
| Update | `U(foo+"/nodeid", {...})` | Update existing node |
| Delete | `D("dfFAeg2")` | Remove node |
| Move | `M("nodeid3", "parent", 2)` | Move node to new parent |
| Generate Image | `G("baz", "ai", "...")` | AI image generation |

### Example: Create a Nova-styled card

```
card=I("parent", {
  type: "frame",
  name: "Card",
  style: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    padding: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  }
})

heading=I(card, {
  type: "text",
  content: "Card Title",
  style: {
    fontFamily: "'Noto Sans', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    color: "#171717"
  }
})

body=I(card, {
  type: "text",
  content: "Card description text here.",
  style: {
    fontFamily: "'Noto Sans', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    color: "#525252"
  }
})
```

## Style Guide Integration

### `get_guidelines(topic)`
Available topics: `code`, `table`, `tailwind`, `landing-page`

### `get_style_guide_tags()`
Discover available style guide tags for filtering

### `get_style_guide(tags, name)`
Get style guide by tags or specific name for design inspiration

### `set_variables(variables)`
Add or update design variables (design tokens, theme values)

## Layout and Space Management

### `find_empty_space_on_canvas(direction, size)`
Find available space on canvas for placing new elements

### Bulk Operations

### `search_all_unique_properties()`
Search for unique property values across entire node tree

### `replace_all_matching_properties()`
Replace matching properties across node tree for bulk updates

## Default Style: shadcn/ui Nova

### Nova Style Tokens

```javascript
const novaColors = {
  background: "#FFFFFF",
  surface: "#FAFAFA",
  surfaceHover: "#F5F5F5",
  surfaceActive: "#EBEBEB",
  border: "#E5E5E5",
  borderHover: "#D4D4D4",
  textPrimary: "#171717",
  textSecondary: "#525252",
  textTertiary: "#A3A3A3",
  accent: "#3B82F6",
  accentHover: "#2563EB",
  accentLight: "#EFF6FF"
};

const novaSpacing = { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" };
const novaRadius = { sm: "4px", md: "6px", lg: "8px" };

const novaTypography = {
  fontFamily: "'Noto Sans', system-ui, sans-serif",
  fontSize: { xs: "12px", sm: "14px", md: "16px", lg: "18px", xl: "20px" },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }
};
```

## Workflow Patterns

### Starting a New Design

1. `get_editor_state()` — Initialize
2. `open_document("new")` or path — Create/Open
3. `get_style_guide_tags()` → `get_style_guide(tags)` — Get styles
4. `set_variables(novaColors)` — Set design tokens

### Creating a Component

1. `find_empty_space_on_canvas(direction, size)` — Find space
2. `batch_design([...])` — Create design
3. `get_screenshot()` — Visual validation
4. `batch_design([U(...)])` — Iterate

### Analyzing Existing Designs

1. `snapshot_layout()` — Get layout structure
2. `batch_get(patterns)` — Read design elements
3. `get_variables()` — Extract variables

## Best Practices

- Maximum 25 operations per `batch_design` call
- Group related operations together
- Use variable references for node IDs
- Build incrementally, validate with screenshots
- Always use `get_style_guide` before designing
- Apply Nova preset as default when no style specified
- Cache style guide information for session reuse

## Error Handling

| Issue | Solution |
|-------|----------|
| "Cannot read .pen file" | Use `batch_get`, never Read tool |
| "Node not found" | Check node ID with `batch_get` |
| "Invalid operation syntax" | Verify `batch_design` operation syntax |
| "Style not applied" | Check variable names match |
