---
name: jikime-tool-mcp-builder
description: MCP (Model Context Protocol) server development specialist with 4-phase workflow - Research, Implementation, Review, and Evaluation. Supports Python (FastMCP) and Node/TypeScript (MCP SDK).
version: 1.0.0
category: tool

# Progressive Disclosure Configuration
progressive_disclosure:
  enabled: true
  level1_tokens: ~120
  level2_tokens: ~6000

# Trigger Conditions for Level 2 Loading
triggers:
  keywords: ["MCP", "mcp server", "model context protocol", "FastMCP", "mcp tool", "mcp resource"]
  phases: ["run", "plan"]
  agents: ["backend", "architect", "fullstack"]
  languages: ["python", "typescript", "javascript"]
---

# MCP Server Builder

Build production-ready MCP servers with best practices for tool design, error handling, and evaluation.

## Quick Reference

### 4-Phase Development Workflow

```
Phase 1: Research    → Understand API, plan tools, design schema
Phase 2: Implement   → Build server with proper patterns
Phase 3: Review      → Validate against quality checklist
Phase 4: Evaluate    → Create evaluation test suite
```

### Supported SDKs

| Language | SDK | Entry Point |
|----------|-----|-------------|
| Python | FastMCP | `mcp.run()` |
| TypeScript | @modelcontextprotocol/sdk | `server.connect()` |

### Server Naming Convention

```
{service}-mcp-server
```
Examples: `github-mcp-server`, `slack-mcp-server`, `jira-mcp-server`

---

## Implementation Guide

### Phase 1: Deep Research

Before writing code, understand the target API thoroughly:

```
1. Read official API documentation
2. Identify key endpoints and data models
3. Plan tool structure (max 10-15 tools per server)
4. Design input/output schemas
5. Consider authentication requirements
```

**Tool Planning Template:**
```markdown
| Tool Name | HTTP Method | Description | Read-Only |
|-----------|-------------|-------------|-----------|
| search_users | GET | Search users by query | Yes |
| create_issue | POST | Create new issue | No |
```

### Phase 2: Implementation

#### Python (FastMCP)

```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

mcp = FastMCP("my-service-mcp-server")

class SearchInput(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=100)

@mcp.tool()
async def search_users(input: SearchInput) -> str:
    """Search for users by name or email.

    Args:
        query: Search string (2-200 chars)
        limit: Max results (1-100, default: 20)

    Returns:
        Markdown formatted user list or error message
    """
    try:
        results = await api_client.search(input.query, input.limit)
        return format_results(results)
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    mcp.run()
```

#### TypeScript (MCP SDK)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-service-mcp-server",
  version: "1.0.0"
});

const SearchSchema = z.object({
  query: z.string().min(2).max(200),
  limit: z.number().int().min(1).max(100).default(20)
}).strict();

server.registerTool(
  "search_users",
  {
    title: "Search Users",
    description: "Search for users by name or email",
    inputSchema: SearchSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false
    }
  },
  async (params) => {
    const results = await searchUsers(params);
    return { content: [{ type: "text", text: results }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Description Best Practices

Write comprehensive descriptions that help LLMs use tools correctly:

```
Tool: search_issues

Search for issues in the project tracker by various criteria.

This tool searches across all issues including bugs, features, and tasks.
It does NOT create or modify issues, only searches existing ones.

Args:
  - query (string): Search text (min 2 chars)
  - status (enum): Filter by status - 'open', 'closed', 'all' (default: 'open')
  - assignee (string, optional): Filter by assignee username

Returns:
  Markdown formatted list with issue titles, IDs, and status.
  Returns "No issues found" if search returns empty.

Examples:
  - "Find all bugs assigned to john" → query="bug", assignee="john"
  - "Search for auth issues" → query="auth"

Error Handling:
  - Returns "Error: Rate limited" on 429 status
  - Returns "Error: Invalid query" on validation failure
```

### Response Formatting

Support both human-readable and machine-readable formats:

```python
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

@mcp.tool()
async def list_projects(
    response_format: ResponseFormat = ResponseFormat.MARKDOWN
) -> str:
    projects = await get_projects()

    if response_format == ResponseFormat.MARKDOWN:
        lines = ["# Projects", ""]
        for p in projects:
            lines.append(f"## {p['name']} ({p['id']})")
            lines.append(f"- **Status**: {p['status']}")
        return "\n".join(lines)
    else:
        return json.dumps({"projects": projects}, indent=2)
```

### Error Handling Pattern

```python
import httpx

async def make_api_request(endpoint: str, method: str = "GET"):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(method, f"{API_URL}/{endpoint}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return "Error: Resource not found"
        elif e.response.status_code == 429:
            return "Error: Rate limited. Please wait."
        else:
            return f"Error: API returned {e.response.status_code}"
    except httpx.TimeoutException:
        return "Error: Request timed out"
```

### Pagination Pattern

```python
class PaginatedInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

@mcp.tool()
async def list_items(input: PaginatedInput) -> str:
    data = await fetch_items(input.limit, input.offset)

    response = {
        "items": data["items"],
        "total": data["total"],
        "offset": input.offset,
        "has_more": data["total"] > input.offset + len(data["items"])
    }

    if response["has_more"]:
        response["next_offset"] = input.offset + len(data["items"])

    return json.dumps(response, indent=2)
```

### Character Limit Pattern

```python
CHARACTER_LIMIT = 25000

def truncate_response(content: str, items: list) -> str:
    if len(content) > CHARACTER_LIMIT:
        # Reduce items and add truncation message
        truncated = items[:len(items)//2]
        content = format_items(truncated)
        content += f"\n\n*Truncated: Showing {len(truncated)} of {len(items)} items*"
    return content
```

### Phase 3: Review Checklist

Before deployment, verify:

**Tool Design**
- [ ] Tool names use snake_case
- [ ] Descriptions include Args, Returns, Examples
- [ ] Input validation with proper constraints
- [ ] Error messages are actionable
- [ ] Pagination for list operations

**Code Quality**
- [ ] Pydantic v2 for Python / Zod for TypeScript
- [ ] async/await for all I/O operations
- [ ] No hardcoded secrets (use env vars)
- [ ] Response format options (markdown/json)
- [ ] CHARACTER_LIMIT constant applied

**Annotations (TypeScript)**
- [ ] readOnlyHint for read operations
- [ ] destructiveHint for delete operations
- [ ] idempotentHint for repeatable operations

### Phase 4: Evaluation

Create 10 evaluation questions to test LLM usability:

```xml
<evaluation>
  <qa_pair>
    <question>Find all projects created in Q1 2024. What is the name of the project with the most tasks?</question>
    <answer>Website Redesign</answer>
  </qa_pair>
  <qa_pair>
    <question>Search for issues labeled "bug" that were closed in March 2024. How many were there?</question>
    <answer>47</answer>
  </qa_pair>
</evaluation>
```

**Evaluation Guidelines:**
- Questions must be READ-ONLY (no side effects)
- Answers must be stable (won't change over time)
- Require multiple tool calls to answer
- Test pagination, filtering, and edge cases

---

## Advanced Patterns

### Resource Registration

Expose data as URI-based resources:

```python
@mcp.resource("file://documents/{name}")
async def get_document(name: str) -> str:
    content = await load_document(name)
    return content
```

### Context Injection (FastMCP)

Access request context in tool handlers:

```python
from mcp.server.fastmcp import Context

@mcp.tool()
async def my_tool(ctx: Context) -> str:
    # Access logging
    await ctx.info("Processing request...")

    # Report progress
    await ctx.report_progress(50, 100)

    return "Done"
```

### Lifespan Management

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def app_lifespan(server):
    # Startup
    await initialize_connections()
    yield
    # Shutdown
    await cleanup_connections()

mcp = FastMCP("server", lifespan=app_lifespan)
```

---

## Works Well With

| Skill | Integration |
|-------|-------------|
| `jikime-lang-python` | Python implementation patterns |
| `jikime-lang-typescript` | TypeScript implementation patterns |
| `jikime-platform-supabase` | Database-backed MCP servers |
| `jikime-workflow-testing` | Test-driven MCP development |

---

## Tool Reference

### Python FastMCP CLI

```bash
# Install
pip install mcp[cli] pydantic httpx

# Run server
python server.py

# Install to Claude Desktop (macOS)
mcp install server.py
```

### TypeScript MCP SDK CLI

```bash
# Install
npm install @modelcontextprotocol/sdk zod axios

# Build
npm run build

# Run
node dist/index.js
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "my-service": {
      "command": "python",
      "args": ["/path/to/server.py"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

---

## Module Reference

For detailed implementation guides, see:

- `modules/python_mcp_server.md` - Complete Python/FastMCP guide
- `modules/node_mcp_server.md` - Complete TypeScript/Node guide
- `modules/mcp_best_practices.md` - Design patterns and conventions
- `modules/evaluation.md` - Evaluation test suite guide

---

Version: 1.0.0
Source: Anthropic MCP SDK + FastMCP best practices
