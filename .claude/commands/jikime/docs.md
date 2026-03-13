---
description: "Update documentation. Sync README, API docs, and code comments with current implementation."
---

# Docs

Synchronize documentation with code changes.

## Usage

```bash
# Update all documentation
/jikime:docs

# Update specific doc type
/jikime:docs --type api
/jikime:docs --type readme
/jikime:docs --type changelog

# Generate missing docs
/jikime:docs --generate

# Update for specific changes
/jikime:docs @src/api/
```

## Options

| Option | Description |
|--------|-------------|
| `@path` | Update docs for specific code |
| `--type` | Doc type: api, readme, changelog, jsdoc |
| `--generate` | Generate missing documentation |
| `--dry-run` | Show changes without applying |

## Documentation Types

- **README**: Project overview, setup, usage
- **API**: Endpoint documentation, schemas
- **Changelog**: Version history, breaking changes
- **JSDoc/TSDoc**: Code comments, type docs

## Output

```markdown
## Documentation Update

### Files Modified
1. README.md
   - Updated installation section
   - Added new configuration options

2. docs/api.md
   - Added /users/{id} endpoint
   - Updated response schemas

3. CHANGELOG.md
   - Added v2.0.0 section
   - Listed breaking changes

### Code Comments Added
- src/services/order.ts: JSDoc added
- src/utils/format.ts: Parameter docs updated

### Verification
✅ All examples tested
✅ Links validated
```
