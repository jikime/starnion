---
description: "Learn about the codebase. Explore architecture, patterns, and implementation details interactively."
context: research
---

# Learn

**Context**: @.claude/contexts/research.md (Auto-loaded)

Explore and learn about the codebase.

## Usage

```bash
# General overview
/jikime:learn

# Learn about specific topic
/jikime:learn authentication flow

# Learn about specific file
/jikime:learn @src/services/order.ts

# Interactive Q&A mode
/jikime:learn --interactive
```

## Options

| Option | Description |
|--------|-------------|
| `[topic]` | Specific topic to learn |
| `@path` | Learn about specific file/module |
| `--interactive` | Interactive Q&A mode |
| `--depth` | Detail level: overview, detailed, deep |

## Topics

- **Architecture**: Project structure, patterns
- **Features**: How features work, implementation
- **Conventions**: Coding style, naming, organization
- **Data Flow**: How data moves through system

## Interactive Mode

```
> How does authentication work?
[Explanation of auth flow]

> What happens when a token expires?
[Token refresh explanation]

> Show me the code
[Relevant code snippets]
```

## Output

```markdown
## Learning: Authentication Flow

### Overview
JWT-based authentication with refresh tokens...

### Key Concepts
1. **Access Token**: Short-lived, used for API calls
2. **Refresh Token**: Long-lived, stored in httpOnly cookie

### Code Flow
1. User submits credentials → POST /api/auth/login
2. Server validates → Returns tokens
3. Client stores access token → Memory
4. API calls include → Authorization header

### Related Files
- src/lib/auth.ts - Core auth logic
- src/app/api/auth/ - Auth endpoints
- src/middleware.ts - Token validation
```
