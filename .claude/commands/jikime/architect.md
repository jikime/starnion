---
description: "Architecture review and design. System design, trade-off analysis, ADR creation."
context: planning
---

# Architect

**Context**: @.claude/contexts/planning.md (Auto-loaded)

System architecture design and review. Trade-off analysis, ADR creation.

## Usage

```bash
# Review current architecture
/jikime:architect

# Design new feature architecture
/jikime:architect Design payment system

# Create ADR
/jikime:architect --adr "Use PostgreSQL over MongoDB"

# Analyze trade-offs
/jikime:architect --tradeoff "Monolith vs Microservices"
```

## Options

| Option | Description |
|--------|-------------|
| `[description]` | Feature/system to design |
| `--adr` | Create Architecture Decision Record |
| `--tradeoff` | Trade-off analysis |
| `--review` | Review existing architecture |

[SOFT] Apply --ultrathink keyword for deep architectural analysis
WHY: Architecture decisions require careful evaluation of scalability, maintainability, and trade-offs across system components
IMPACT: Sequential thinking ensures comprehensive design review with proper ADR documentation and alternative consideration

## Review Process

### 1. Current State Analysis
- Existing architecture mapping
- Technical debt identification
- Scalability assessment

### 2. Requirements Analysis
- Functional requirements
- Non-functional requirements (performance, security, scalability)
- Integration points

### 3. Design Proposal
- Component structure
- Data model
- API contracts
- Integration patterns

### 4. Trade-off Analysis
- Pros and Cons
- Alternatives considered
- Final decision with rationale

## Architecture Principles

| Principle | Description |
|-----------|-------------|
| **Modularity** | High cohesion, low coupling |
| **Scalability** | Horizontal scaling capable |
| **Maintainability** | Easy to understand and test |
| **Security** | Defense in depth |

## ADR Template

```markdown
# ADR-001: [Decision Title]

## Context
[Background and problem description]

## Decision
[What was decided]

## Consequences

### Positive
- [Benefits]

### Negative
- [Drawbacks]

## Status
Proposed / Accepted / Rejected / Superseded

## Date
YYYY-MM-DD
```

## Output

```markdown
## Architecture Review

### Current State
- **Pattern:** Monolithic
- **Tech Stack:** Next.js, PostgreSQL, Redis
- **Scalability:** Vertical only

### Proposed Changes

#### Component Diagram
\`\`\`
┌─────────────┐     ┌──────────────┐
│  Frontend   │────▶│  API Gateway │
└─────────────┘     └──────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Auth Svc │ │ User Svc │ │Order Svc │
        └──────────┘ └──────────┘ └──────────┘
\`\`\`

### Trade-off Analysis

| Aspect | Monolith | Microservices |
|--------|----------|---------------|
| Complexity | Low | High |
| Scalability | Limited | High |
| Deployment | Simple | Complex |
| Team Independence | Low | High |

### Recommendation
Monolith-first approach with modular boundaries.
```

## Red Flags

| Pattern | Problem |
|---------|---------|
| Big Ball of Mud | No clear structure |
| God Object | One class does everything |
| Tight Coupling | Excessive dependencies |
| Premature Optimization | Optimizing too early |

## Design Checklist

- [ ] Architecture diagram created
- [ ] Component responsibilities defined
- [ ] Data flow documented
- [ ] Error handling strategy defined
- [ ] Test strategy planned

## Related Commands

- `/jikime:1-plan` - Implementation planning
- `/jikime:refactor` - Code restructuring
- `/jikime:docs` - Document architecture

---

Version: 1.0.0
