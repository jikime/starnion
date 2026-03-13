# Node/TypeScript MCP Server Implementation Guide

## Overview

Complete guide for implementing MCP servers using Node.js/TypeScript with the official MCP SDK.

---

## Quick Reference

### Key Imports

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
```

### Server Initialization

```typescript
const server = new McpServer({
  name: "service-mcp-server",
  version: "1.0.0"
});
```

### Tool Registration

```typescript
server.registerTool("tool_name", config, handler);
```

---

## MCP TypeScript SDK

The official MCP TypeScript SDK provides:

- `McpServer` class for server initialization
- `registerTool` method for tool registration
- Zod schema integration for runtime validation
- Type-safe tool handler implementations

## Server Naming Convention

- **Format**: `{service}-mcp-server` (lowercase with hyphens)
- **Examples**: `github-mcp-server`, `jira-mcp-server`, `stripe-mcp-server`

## Project Structure

```
{service}-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Main entry point
│   ├── types.ts          # TypeScript interfaces
│   ├── tools/            # Tool implementations
│   ├── services/         # API clients
│   ├── schemas/          # Zod schemas
│   └── constants.ts      # Shared constants
└── dist/                 # Built JavaScript
```

## Tool Implementation

### Zod Schema for Input Validation

```typescript
import { z } from "zod";

const SearchInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against names/emails"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();  // Reject unknown fields

type SearchInput = z.infer<typeof SearchInputSchema>;
```

### Response Format Enum

```typescript
enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}
```

### Tool Registration with Full Config

```typescript
server.registerTool(
  "search_users",
  {
    title: "Search Users",
    description: `Search for users in the system by name, email, or team.

This tool searches across all user profiles, supporting partial matches.
It does NOT create or modify users, only searches.

Args:
  - query (string): Search text (2-200 chars)
  - limit (number): Max results (1-100, default: 20)
  - offset (number): Skip results for pagination (default: 0)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Markdown: Formatted user list with headers
  JSON: {"total": number, "users": [...], "has_more": boolean}

Examples:
  - "Find marketing team" → query="team:marketing"
  - "Search John" → query="john"

Errors:
  - "Error: Rate limited" on 429
  - "No users found" on empty results`,
    inputSchema: SearchInputSchema,
    annotations: {
      readOnlyHint: true,      // Doesn't modify data
      destructiveHint: false,  // Doesn't delete data
      idempotentHint: true,    // Same input = same output
      openWorldHint: true      // Returns real-time data
    }
  },
  async (params: SearchInput) => {
    try {
      const data = await searchUsers(params);

      if (!data.users.length) {
        return {
          content: [{
            type: "text",
            text: `No users found matching '${params.query}'`
          }]
        };
      }

      const result = params.response_format === ResponseFormat.MARKDOWN
        ? formatMarkdown(data)
        : JSON.stringify(data, null, 2);

      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: handleError(error)
        }]
      };
    }
  }
);
```

## Error Handling

```typescript
import axios, { AxiosError } from "axios";

function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      const status = axiosError.response.status;
      const messages: Record<number, string> = {
        400: "Error: Invalid request parameters",
        401: "Error: Authentication required",
        403: "Error: Permission denied",
        404: "Error: Resource not found",
        429: "Error: Rate limit exceeded. Please wait.",
        500: "Error: Server error. Try again later."
      };
      return messages[status] || `Error: Request failed (${status})`;
    } else if (axiosError.code === "ECONNABORTED") {
      return "Error: Request timed out";
    }
  }
  return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
}
```

## API Client Pattern

```typescript
const API_BASE_URL = process.env.API_URL || "https://api.example.com/v1";
const API_KEY = process.env.API_KEY;

async function makeApiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
  params?: Record<string, string | number>
): Promise<T> {
  const response = await axios({
    method,
    url: `${API_BASE_URL}/${endpoint}`,
    data,
    params,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    }
  });
  return response.data;
}
```

## Pagination Implementation

```typescript
const ListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

server.registerTool(
  "list_items",
  {
    title: "List Items",
    description: "List items with pagination",
    inputSchema: ListSchema,
    annotations: { readOnlyHint: true }
  },
  async (params) => {
    const data = await makeApiRequest<ItemsResponse>(
      "items",
      "GET",
      undefined,
      { limit: params.limit, offset: params.offset }
    );

    const response = {
      items: data.items,
      total: data.total,
      count: data.items.length,
      offset: params.offset,
      has_more: data.total > params.offset + data.items.length,
      next_offset: data.total > params.offset + data.items.length
        ? params.offset + data.items.length
        : undefined
    };

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
    };
  }
);
```

## Character Limit and Truncation

```typescript
const CHARACTER_LIMIT = 25000;

function truncateResponse<T>(
  formatter: (items: T[]) => string,
  items: T[]
): string {
  let result = formatter(items);

  if (result.length > CHARACTER_LIMIT) {
    const truncatedItems = items.slice(0, Math.max(1, items.length / 2));
    result = formatter(truncatedItems);
    result += `\n\n*Truncated: Showing ${truncatedItems.length} of ${items.length} items*`;
  }

  return result;
}
```

## Resource Registration

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";

server.registerResource(
  {
    uri: "file://documents/{name}",
    name: "Document Resource",
    description: "Access documents by name",
    mimeType: "text/plain"
  },
  async (uri: string) => {
    const match = uri.match(/^file:\/\/documents\/(.+)$/);
    if (!match) throw new Error("Invalid URI format");

    const content = await loadDocument(match[1]);

    return {
      contents: [{
        uri,
        mimeType: "text/plain",
        text: content
      }]
    };
  }
);
```

## Transport Options

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Stdio (default - for CLI tools)
const stdioTransport = new StdioServerTransport();
await server.connect(stdioTransport);

// SSE (for web)
const sseTransport = new SSEServerTransport("/message", response);
await server.connect(sseTransport);
```

## Package Configuration

### package.json

```json
{
  "name": "example-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "axios": "^1.7.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Complete Example

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

// Constants
const API_URL = process.env.API_URL || "https://api.example.com";
const CHARACTER_LIMIT = 25000;

enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Schemas
const SearchSchema = z.object({
  query: z.string().min(2).max(200),
  limit: z.number().int().min(1).max(100).default(20),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
}).strict();

// Server
const server = new McpServer({
  name: "example-mcp-server",
  version: "1.0.0"
});

// Tools
server.registerTool(
  "search_items",
  {
    title: "Search Items",
    description: "Search for items by query",
    inputSchema: SearchSchema,
    annotations: { readOnlyHint: true }
  },
  async (params) => {
    const { data } = await axios.get(`${API_URL}/search`, {
      params: { q: params.query, limit: params.limit }
    });

    const text = params.response_format === ResponseFormat.MARKDOWN
      ? data.items.map((i: any) => `- ${i.name}`).join("\n")
      : JSON.stringify(data, null, 2);

    return { content: [{ type: "text", text }] };
  }
);

// Main
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server running via stdio");
}

main().catch(console.error);
```

## Quality Checklist

### Tool Design
- [ ] Tool names use snake_case
- [ ] Full descriptions with Args, Returns, Examples
- [ ] Zod schemas with `.strict()` enforcement
- [ ] Proper annotations set

### TypeScript Quality
- [ ] Strict mode enabled
- [ ] No `any` types
- [ ] Explicit return types
- [ ] Error handling with type guards

### Build & Test
- [ ] `npm run build` succeeds
- [ ] `node dist/index.js` runs
- [ ] All imports resolve

---

Version: 1.0.0
