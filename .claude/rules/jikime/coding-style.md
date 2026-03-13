# Coding Style Rules

Code quality and style guidelines for consistent, maintainable code.

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate:

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}
```

## File Organization

**MANY SMALL FILES > FEW LARGE FILES**

| Guideline | Target |
|-----------|--------|
| Lines per file | 200-400 typical, 800 max |
| Lines per function | < 50 lines |
| Nesting depth | < 4 levels |
| Cohesion | High (single responsibility) |
| Coupling | Low (minimal dependencies) |

**Organization Principle**: Organize by feature/domain, not by type.

```
# WRONG: By type
src/
├── components/
├── hooks/
├── services/
└── utils/

# CORRECT: By feature
src/
├── auth/
│   ├── components/
│   ├── hooks/
│   └── services/
├── users/
└── products/
```

## Error Handling

ALWAYS handle errors comprehensively:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

**Error Handling Checklist**:
- [ ] Errors are caught at appropriate boundaries
- [ ] Error messages are user-friendly
- [ ] Original error context is preserved for debugging
- [ ] Recovery strategies are implemented where possible

## Input Validation

ALWAYS validate user input at system boundaries:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (< 50 lines)
- [ ] Files are focused (< 800 lines)
- [ ] No deep nesting (> 4 levels)
- [ ] Proper error handling
- [ ] No console.log statements in production code
- [ ] No hardcoded values (use constants/config)
- [ ] No mutation (immutable patterns used)
- [ ] Single responsibility principle followed

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `userName`, `isActive` |
| Functions | camelCase, verb prefix | `getUserById`, `validateInput` |
| Classes | PascalCase | `UserService`, `AuthController` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| Files | kebab-case or camelCase | `user-service.ts`, `userService.ts` |

## Prohibited Patterns

| Pattern | Reason |
|---------|--------|
| `any` type (TypeScript) | Defeats type safety |
| Magic numbers | Use named constants |
| Deep nesting | Extract to functions |
| God objects/functions | Split by responsibility |
| Commented-out code | Delete it (use git history) |

---

Version: 1.0.0
Source: JikiME-ADK coding style rules
