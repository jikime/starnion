# Quality Gates

Quality validation rules and checklists for all operations.

## HARD Rules Checklist

These must be verified before completing any task:

- [ ] All implementation tasks delegated to agents when specialized expertise is needed
- [ ] User responses in `conversation_language`
- [ ] Independent operations executed in parallel
- [ ] XML tags never shown to users
- [ ] URLs verified before inclusion (WebSearch)
- [ ] Source attribution when WebSearch used

## SOFT Rules Checklist

These are recommended best practices:

- [ ] Appropriate agent selected for task
- [ ] Minimal context passed to agents
- [ ] Results integrated coherently
- [ ] Agent delegation for complex operations (Type B commands)

## Violation Detection

The following actions constitute violations:

| Violation | Description |
|-----------|-------------|
| **No Agent Consideration** | J.A.R.V.I.S./F.R.I.D.A.Y. responds to complex implementation requests without considering agent delegation |
| **Skipped Validation** | J.A.R.V.I.S./F.R.I.D.A.Y. skips quality validation for critical changes |
| **Language Mismatch** | J.A.R.V.I.S./F.R.I.D.A.Y. ignores user's `conversation_language` preference |
| **Wrong Orchestrator** | Migration request routed to J.A.R.V.I.S. instead of F.R.I.D.A.Y. (or vice versa) |

## Enforcement

When specialized expertise is needed, J.A.R.V.I.S./F.R.I.D.A.Y. **SHOULD** invoke corresponding agent for optimal results.

## Domain-Specific Quality Focus

### J.A.R.V.I.S. (Development)
- Code quality and maintainability
- Test coverage and test quality
- Security vulnerability prevention
- Performance optimization

### F.R.I.D.A.Y. (Migration)
- Behavior preservation (characterization tests)
- Migration completeness (all modules migrated)
- Framework convention adherence (target framework patterns)
- Build success and type safety

## DDD Quality Standards

When using Domain-Driven Development:

- [ ] Existing tests run before refactoring
- [ ] Characterization tests created for uncovered code
- [ ] Behavior preserved through ANALYZE-PRESERVE-IMPROVE cycle
- [ ] Changes are incremental and validated

## TRUST 5 Framework

Quality principles (when enabled in configuration):

| Principle | Description |
|-----------|-------------|
| **T**ested | All code has appropriate test coverage |
| **R**eadable | Code is self-documenting and clear |
| **U**nified | Consistent patterns across codebase |
| **S**ecured | Security best practices applied |
| **T**rackable | Changes are documented and traceable |

---

Version: 1.0.0
Source: Extracted from CLAUDE.md Section 6
