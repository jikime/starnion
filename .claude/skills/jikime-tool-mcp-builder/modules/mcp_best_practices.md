# MCP Best Practices

## Overview

Design patterns, conventions, and best practices for building high-quality MCP servers.

---

## Server Naming

### Convention

```
{service}-mcp-server
```

- Use lowercase with hyphens
- Name should be general (not tied to specific features)
- Easy to infer from task description

### Examples

| Good | Bad |
|------|-----|
| `github-mcp-server` | `gh-issues-server` |
| `slack-mcp-server` | `slack-msg-sender` |
| `stripe-mcp-server` | `payment-api-v2` |

---

## Tool Naming

### Convention

- Use `snake_case`
- Include service prefix to avoid conflicts
- Use action-oriented names

### Naming Pattern

```
{service}_{action}_{resource}
```

### Examples

| Good | Bad |
|------|-----|
| `github_search_issues` | `search` |
| `slack_send_message` | `sendMessage` |
| `stripe_list_payments` | `get-payments` |

---

## Tool Design Principles

### 1. Complete Workflows, Not API Wrappers

Design tools that enable complete tasks, not just mirror API endpoints.

**Bad**: One tool per API endpoint
```
create_issue
update_issue
add_label
assign_user
```

**Good**: Workflow-oriented tools
```
create_issue          # Creates with labels, assignees in one call
search_issues         # Rich filtering and sorting
bulk_update_issues    # Batch operations
```

### 2. Human-Readable Identifiers

When possible, accept human-readable inputs instead of IDs.

```python
# Good: Accept username or ID
@mcp.tool()
async def get_user(identifier: str) -> str:
    """Get user by username or user ID."""
    if identifier.startswith("U"):
        return await get_user_by_id(identifier)
    return await get_user_by_username(identifier)
```

### 3. Comprehensive Descriptions

Tool descriptions should include:

1. **What it does** (first line)
2. **What it does NOT do** (clarify boundaries)
3. **Args** with types and constraints
4. **Returns** with format examples
5. **Examples** of when to use
6. **Errors** and their meanings

```python
"""Search for users in the organization directory.

This tool searches active users only. It does NOT:
- Search deactivated accounts
- Create or modify users
- Return sensitive data (passwords, SSN)

Args:
    query (str): Search text, 2-200 characters
    department (str, optional): Filter by department name
    limit (int): Max results, 1-100 (default: 20)

Returns:
    Markdown formatted list:
    ## Users Found: {count}
    - **Name** (username) - department

    Or JSON when response_format="json":
    {"users": [...], "total": int, "has_more": bool}

Examples:
    - "Find engineers" → query="engineer"
    - "Marketing team" → department="Marketing"

Errors:
    - "No users found" - empty results
    - "Error: Rate limited" - too many requests
"""
```

### 4. Explicit Input/Output Types

Always document the exact schema of inputs and outputs.

```python
"""
Returns:
    JSON schema:
    {
        "users": [
            {
                "id": "string",
                "name": "string",
                "email": "string",
                "department": "string | null"
            }
        ],
        "total": "integer",
        "has_more": "boolean",
        "next_offset": "integer | undefined"
    }
"""
```

---

## Response Formatting

### Dual Format Support

Always support both markdown (human) and JSON (machine) formats:

```python
class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

@mcp.tool()
async def list_items(
    response_format: ResponseFormat = ResponseFormat.MARKDOWN
) -> str:
    items = await get_items()

    if response_format == ResponseFormat.MARKDOWN:
        lines = ["# Items", ""]
        for item in items:
            lines.append(f"## {item['name']}")
            lines.append(f"- ID: {item['id']}")
        return "\n".join(lines)
    else:
        return json.dumps({"items": items}, indent=2)
```

### Markdown Best Practices

- Use headers for structure
- Use bullet points for lists
- Include IDs in parentheses: `**John Doe** (U123456)`
- Format dates human-readable
- Omit verbose metadata

### JSON Best Practices

- Include all fields
- Use consistent naming (camelCase or snake_case)
- Include pagination metadata
- Pretty print with indent=2

---

## Pagination

### Standard Pattern

```python
class PaginatedInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

@mcp.tool()
async def list_items(input: PaginatedInput) -> str:
    data = await fetch_items(input.limit, input.offset)

    return json.dumps({
        "items": data["items"],
        "total": data["total"],
        "count": len(data["items"]),
        "offset": input.offset,
        "has_more": data["total"] > input.offset + len(data["items"]),
        "next_offset": input.offset + len(data["items"]) if has_more else None
    })
```

### Pagination Guidance in Description

```
Args:
    limit: Results per page, 1-100 (default: 20)
    offset: Skip this many results (default: 0)

Returns:
    {"items": [...], "has_more": true, "next_offset": 20}

    Use next_offset for subsequent calls:
    First call: limit=20, offset=0
    Next call: limit=20, offset=20
```

---

## Character Limits

### The Problem

Large responses can overwhelm LLM context windows.

### Solution

```python
CHARACTER_LIMIT = 25000

def format_response(items: list) -> str:
    content = format_items(items)

    if len(content) > CHARACTER_LIMIT:
        # Truncate and add message
        half = len(items) // 2
        truncated = items[:half]
        content = format_items(truncated)
        content += f"\n\n*Showing {half} of {len(items)} items. Use pagination.*"

    return content
```

### Alternative: Filtering

Encourage users to filter instead of paginating through everything:

```
If results exceed 100 items, consider:
- Adding filters (status, date range, assignee)
- Using more specific search terms
- Requesting a smaller date range
```

---

## Error Handling

### User-Friendly Messages

```python
ERROR_MESSAGES = {
    400: "Error: Invalid request. Check your parameters.",
    401: "Error: Authentication failed. Check API key.",
    403: "Error: Access denied. You lack permission.",
    404: "Error: Not found. Check the ID is correct.",
    429: "Error: Rate limited. Wait a moment and retry.",
    500: "Error: Server error. Try again later."
}

def handle_error(status: int) -> str:
    return ERROR_MESSAGES.get(status, f"Error: Request failed ({status})")
```

### Actionable Guidance

Don't just report errors—guide the user:

```python
if status == 429:
    return "Error: Rate limited. Wait 60 seconds before retrying."

if status == 404:
    return f"Error: User '{username}' not found. Check spelling or try user ID."
```

---

## Tool Annotations

### TypeScript Annotations

```typescript
annotations: {
  readOnlyHint: true,      // Doesn't modify state
  destructiveHint: false,  // Doesn't delete data
  idempotentHint: true,    // Same input = same result
  openWorldHint: true      // Returns real-time data
}
```

### When to Use Each

| Annotation | True When |
|------------|-----------|
| `readOnlyHint` | GET operations, searches, reads |
| `destructiveHint` | DELETE operations, irreversible |
| `idempotentHint` | Safe to retry multiple times |
| `openWorldHint` | Data may change between calls |

---

## Security Best Practices

### 1. Environment Variables for Secrets

```python
API_KEY = os.getenv("SERVICE_API_KEY")
if not API_KEY:
    raise ValueError("SERVICE_API_KEY environment variable required")
```

### 2. Input Validation

```python
class UserInput(BaseModel):
    email: str = Field(..., pattern=r"^[\w.-]+@[\w.-]+\.\w+$")
    limit: int = Field(default=20, ge=1, le=100)

    model_config = {"extra": "forbid"}
```

### 3. No Sensitive Data in Responses

```python
def sanitize_user(user: dict) -> dict:
    """Remove sensitive fields before returning."""
    sensitive_fields = {"password", "ssn", "api_key", "token"}
    return {k: v for k, v in user.items() if k not in sensitive_fields}
```

### 4. Rate Limiting Awareness

```python
async def make_request_with_backoff(url: str, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait = 2 ** attempt
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError("Max retries exceeded")
```

---

## Transport Options

### Stdio (Default)

Best for: CLI tools, local development, subprocess integration

```python
if __name__ == "__main__":
    mcp.run()  # Uses stdio by default
```

### HTTP/SSE

Best for: Web services, remote access, multiple clients

```python
mcp.run(transport="sse", port=8080)
```

---

## Quality Checklist

### Design
- [ ] Tools enable complete workflows
- [ ] Names are action-oriented with service prefix
- [ ] Descriptions include all sections
- [ ] Human-readable identifiers supported

### Implementation
- [ ] Dual format support (markdown/JSON)
- [ ] Pagination for lists
- [ ] Character limit handling
- [ ] Proper error messages

### Security
- [ ] Secrets in environment variables
- [ ] Input validation
- [ ] No sensitive data in responses
- [ ] Rate limit handling

### Documentation
- [ ] README with setup instructions
- [ ] Claude Desktop config example
- [ ] Evaluation test suite

---

Version: 1.0.0
