# Python MCP Server Implementation Guide

## Overview

Complete guide for implementing MCP servers using Python with FastMCP SDK.

---

## Quick Reference

### Key Imports

```python
from mcp.server.fastmcp import FastMCP, Context
from pydantic import BaseModel, Field
from enum import Enum
import httpx
```

### Server Initialization

```python
mcp = FastMCP("service-mcp-server")
```

### Tool Registration

```python
@mcp.tool()
async def tool_name(input: InputModel) -> str:
    """Tool description"""
    return result
```

---

## FastMCP SDK

FastMCP is the recommended Python SDK for MCP server development. It provides:

- Decorator-based tool registration
- Automatic Pydantic validation
- Async-first design
- Context injection for logging and progress

## Server Naming Convention

Python MCP servers must follow this naming pattern:

- **Format**: `{service}-mcp-server` (lowercase with hyphens)
- **Examples**: `github-mcp-server`, `slack-mcp-server`, `notion-mcp-server`

## Project Structure

```
{service}-mcp-server/
├── pyproject.toml       # Dependencies and metadata
├── README.md
├── server.py            # Main entry point
├── tools/               # Tool implementations by domain
│   ├── __init__.py
│   ├── search.py
│   └── manage.py
├── services/            # API clients and shared utilities
│   ├── __init__.py
│   └── api_client.py
├── schemas/             # Pydantic models
│   ├── __init__.py
│   └── models.py
└── constants.py         # Shared constants
```

## Tool Implementation

### Pydantic Input Validation (v2)

```python
from pydantic import BaseModel, Field
from typing import Optional

class SearchInput(BaseModel):
    """Input schema for search operation."""

    query: str = Field(
        ...,  # Required
        min_length=2,
        max_length=200,
        description="Search string to match against names/emails"
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum results to return"
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of results to skip for pagination"
    )
    response_format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' or 'json'"
    )

    model_config = {
        "extra": "forbid"  # Reject unknown fields
    }
```

### Response Format Enum

```python
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"
```

### Tool Registration with Docstring

```python
@mcp.tool()
async def search_users(input: SearchInput) -> str:
    """Search for users in the system by name, email, or team.

    This tool searches across all user profiles, supporting partial matches
    and various filters. It does NOT create or modify users.

    Args:
        query: Search string (2-200 characters)
        limit: Maximum results to return (1-100, default: 20)
        offset: Number of results to skip (default: 0)
        response_format: Output format - 'markdown' or 'json'

    Returns:
        For markdown: Formatted user list with headers and bullets
        For JSON: {"total": int, "users": [...], "has_more": bool}

    Examples:
        - "Find marketing team" → query="team:marketing"
        - "Search for John" → query="john"

    Errors:
        - "Error: Rate limited" on 429 status
        - "No users found" if empty results
    """
    try:
        data = await api_client.search_users(
            query=input.query,
            limit=input.limit,
            offset=input.offset
        )

        if not data["users"]:
            return f"No users found matching '{input.query}'"

        if input.response_format == ResponseFormat.MARKDOWN:
            return format_markdown(data)
        else:
            return json.dumps(data, indent=2)

    except httpx.HTTPStatusError as e:
        return handle_http_error(e)
```

## Context Injection

FastMCP provides a Context object for logging and progress reporting:

```python
from mcp.server.fastmcp import Context

@mcp.tool()
async def process_data(input: ProcessInput, ctx: Context) -> str:
    """Process data with progress reporting."""

    # Logging
    await ctx.debug("Starting processing...")
    await ctx.info(f"Processing {len(input.items)} items")
    await ctx.warning("Large dataset detected")
    await ctx.error("Failed to process item X")

    # Progress reporting
    total = len(input.items)
    for i, item in enumerate(input.items):
        await process_item(item)
        await ctx.report_progress(i + 1, total)

    return "Processing complete"
```

## Error Handling

```python
import httpx

async def make_api_request(
    endpoint: str,
    method: str = "GET",
    data: dict = None
) -> dict:
    """Make API request with proper error handling."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{API_BASE_URL}/{endpoint}",
                json=data
            )
            response.raise_for_status()
            return response.json()

    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 404:
            raise ValueError("Resource not found")
        elif status == 403:
            raise PermissionError("Access denied")
        elif status == 429:
            raise RuntimeError("Rate limit exceeded")
        else:
            raise RuntimeError(f"API error: {status}")

    except httpx.TimeoutException:
        raise RuntimeError("Request timed out")


def handle_http_error(error: httpx.HTTPStatusError) -> str:
    """Convert HTTP errors to user-friendly messages."""
    status = error.response.status_code
    messages = {
        400: "Error: Invalid request parameters",
        401: "Error: Authentication required",
        403: "Error: Permission denied",
        404: "Error: Resource not found",
        429: "Error: Rate limit exceeded. Please wait.",
        500: "Error: Server error. Try again later."
    }
    return messages.get(status, f"Error: Request failed ({status})")
```

## Pagination Implementation

```python
class PaginatedInput(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

@mcp.tool()
async def list_items(input: PaginatedInput) -> str:
    """List items with pagination support."""
    data = await api_client.get_items(
        limit=input.limit,
        offset=input.offset
    )

    items = data["items"]
    total = data["total"]

    response = {
        "items": items,
        "total": total,
        "count": len(items),
        "offset": input.offset,
        "has_more": total > input.offset + len(items)
    }

    if response["has_more"]:
        response["next_offset"] = input.offset + len(items)

    return json.dumps(response, indent=2)
```

## Character Limit and Truncation

```python
CHARACTER_LIMIT = 25000

def truncate_response(content: str, items: list) -> str:
    """Truncate response if it exceeds character limit."""
    if len(content) <= CHARACTER_LIMIT:
        return content

    # Reduce items by half and retry
    truncated_items = items[:len(items) // 2]
    truncated_content = format_items(truncated_items)

    message = (
        f"\n\n*Response truncated: Showing {len(truncated_items)} "
        f"of {len(items)} items. Use pagination for more.*"
    )

    return truncated_content + message
```

## Resource Registration

Expose data as URI-based resources:

```python
@mcp.resource("file://documents/{name}")
async def get_document(name: str) -> str:
    """Get document content by name."""
    content = await load_document(name)
    return content

@mcp.resource("config://settings")
async def get_settings() -> str:
    """Get current configuration settings."""
    return json.dumps(settings, indent=2)
```

## Lifespan Management

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def app_lifespan(server):
    """Manage server lifecycle."""
    # Startup
    print("Initializing server...")
    await initialize_db_pool()
    await warm_up_caches()

    yield  # Server runs here

    # Shutdown
    print("Shutting down...")
    await close_db_pool()
    await flush_caches()

mcp = FastMCP(
    "my-service-mcp-server",
    lifespan=app_lifespan
)
```

## Complete Example

```python
#!/usr/bin/env python3
"""MCP Server for Example Service."""

from mcp.server.fastmcp import FastMCP, Context
from pydantic import BaseModel, Field
from enum import Enum
import httpx
import json
import os

# Constants
API_BASE_URL = os.getenv("API_URL", "https://api.example.com/v1")
API_KEY = os.getenv("API_KEY")
CHARACTER_LIMIT = 25000

# Enums
class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

# Input Schemas
class SearchInput(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=100)
    response_format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)
    model_config = {"extra": "forbid"}

# Initialize server
mcp = FastMCP("example-mcp-server")

# Tools
@mcp.tool()
async def search_items(input: SearchInput, ctx: Context) -> str:
    """Search for items by query string.

    Args:
        query: Search text (2-200 chars)
        limit: Max results (1-100)
        response_format: 'markdown' or 'json'

    Returns:
        Formatted search results
    """
    await ctx.info(f"Searching for: {input.query}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE_URL}/search",
                params={"q": input.query, "limit": input.limit},
                headers={"Authorization": f"Bearer {API_KEY}"}
            )
            response.raise_for_status()
            data = response.json()

        if not data["items"]:
            return f"No items found matching '{input.query}'"

        if input.response_format == ResponseFormat.MARKDOWN:
            lines = [f"# Search Results: '{input.query}'", ""]
            for item in data["items"]:
                lines.append(f"## {item['name']}")
                lines.append(f"- ID: {item['id']}")
                lines.append("")
            return "\n".join(lines)
        else:
            return json.dumps(data, indent=2)

    except httpx.HTTPStatusError as e:
        return f"Error: API returned {e.response.status_code}"

# Entry point
if __name__ == "__main__":
    mcp.run()
```

## Quality Checklist

### Tool Design
- [ ] Tool names use snake_case
- [ ] Docstrings include Args, Returns, Examples
- [ ] Input validation with Pydantic v2
- [ ] Error messages are actionable
- [ ] Pagination for list operations

### Code Quality
- [ ] All I/O operations are async
- [ ] No hardcoded secrets
- [ ] CHARACTER_LIMIT applied
- [ ] Response format options
- [ ] Proper error handling

### Testing
- [ ] Each tool has unit tests
- [ ] Integration tests with mock API
- [ ] Evaluation test suite created

---

Version: 1.0.0
