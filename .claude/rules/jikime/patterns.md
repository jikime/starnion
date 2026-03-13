# Common Patterns

Reusable code patterns for consistent implementation.

## Pattern Selection Guide

| Scenario | Pattern | Key Concept |
|----------|---------|-------------|
| Data access | Repository | `interface Repository<T, ID>` with findAll/findById/create/update/delete |
| Business logic | Service | Constructor injection of repositories + business rules |
| Object creation | Factory | `static create(type): Instance` with switch dispatch |
| State management | Custom Hook | `useDebounce`, `useAsync` for reusable stateful logic |
| Complex components | Compound | Context.Provider + `Component.SubComponent` pattern |
| Input validation | Zod Schema | `z.object({...})` with `z.infer<typeof schema>` |
| API responses | Standard Response | `{ success, data?, error?, meta? }` envelope |
| Error hierarchy | Custom Errors | `AppError` → `ValidationError`, `NotFoundError` extends |

## API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string; details?: unknown }
  meta?: { total: number; page: number; limit: number; hasMore: boolean }
}
```

## Error Handling Pattern

```typescript
class AppError extends Error {
  constructor(public code: string, message: string, public statusCode = 500) {
    super(message)
  }
}
// Extend: ValidationError(400), NotFoundError(404), etc.
```

## Implementation Approach

When implementing new features:

1. Search for proven skeleton/boilerplate
2. Evaluate: security, extensibility, relevance, community support
3. Clone best match as foundation
4. Iterate within proven structure

---

Version: 2.0.0
Source: JikiME-ADK pattern library (condensed)
