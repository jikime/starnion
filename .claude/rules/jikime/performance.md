# Performance Optimization

Guidelines for efficient Claude Code usage and code performance.

## Model Selection Strategy

| Model | Use For | Characteristics |
|-------|---------|-----------------|
| **Haiku** | Simple generation, formatting, worker agents | 90% of Sonnet capability, 3x cost savings |
| **Sonnet** | Main development, complex coding, orchestration | Best balance of capability and cost |
| **Opus** | Architecture decisions, deep reasoning, ultrathink | Maximum reasoning depth, higher cost |

## Context Window Management

| Zone | Context | Safe Tasks |
|------|---------|------------|
| Safe (0-60%) | Low | Any task |
| Caution (60-80%) | Medium | Single-file edits, docs, simple fixes |
| Critical (80-100%) | High | Avoid refactoring, multi-file changes |

**Strategies**: Start complex tasks with fresh context, use /clear at 70%+, break large tasks into smaller sessions.

## Tool Efficiency

### Parallel Execution

- **DO**: Execute independent operations in parallel (multiple reads, unrelated searches)
- **DON'T**: Parallelize dependent operations (read then edit same file)

### Tool Selection

| Task | Preferred | Avoid |
|------|-----------|-------|
| Find files | Glob | Bash find |
| Search content | Grep | Bash grep |
| Read files | Read | Bash cat |
| Edit files | Edit | Bash sed |
| Create files | Write | Bash echo |

## Code Performance

### Algorithm Complexity Targets

- O(n) or better for common operations
- O(n log n) acceptable for sorting
- Avoid O(n²) in hot paths
- Never O(2^n) without explicit approval

**Common Fix**: Replace nested loops with Map/Set lookups (O(n²) → O(n)).

### Database Performance

1. Index frequently queried columns
2. Avoid N+1 queries (use includes/joins)
3. Paginate large result sets
4. Use connection pooling
5. Cache frequently accessed data

## Build Troubleshooting

### Incremental Fix Approach

1. Run build, capture errors → Fix ONE error at a time → Re-run → Repeat

### Common Build Issues

| Error Type | Likely Cause | Fix |
|------------|--------------|-----|
| Type error | Missing/wrong types | Check imports, add types |
| Module not found | Wrong path | Verify import path |
| Syntax error | Typo, missing bracket | Check recent changes |
| Circular dep | Import cycle | Restructure modules |

## Performance Checklist

Before committing:

- [ ] No unnecessary re-renders
- [ ] No N+1 queries
- [ ] Expensive operations memoized
- [ ] Large lists virtualized
- [ ] Images optimized
- [ ] Bundle size reasonable

---

Version: 2.0.0
Source: JikiME-ADK performance guidelines (condensed - removed code examples and UltraThink duplicate)
