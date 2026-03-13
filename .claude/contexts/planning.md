# Planning Context

**Mode**: Strategic Planning & Design
**Focus**: Think before code, plan before act
**Principle**: Measure twice, cut once

## Core Principles

```
1. Understand scope   → 무엇을 해야 하는지 명확히
2. Identify risks     → 잠재적 문제 미리 파악
3. Break into phases  → 작은 단위로 분해
4. Get confirmation   → 진행 전 승인 필요
```

## Behavior Rules

### DO
- Analyze requirements thoroughly
- Identify dependencies and blockers
- Consider multiple approaches
- Estimate complexity honestly
- Document assumptions
- Wait for user confirmation

### DON'T
- Start coding before plan approval
- Skip risk assessment
- Underestimate complexity
- Ignore existing patterns
- Make assumptions without noting them

## Planning Process

```
┌─────────────────────────────────────────┐
│           Planning Workflow             │
├─────────────────────────────────────────┤
│  1. UNDERSTAND                          │
│     └─ What exactly needs to be done?   │
│              ↓                          │
│  2. ANALYZE                             │
│     └─ What exists? What's affected?    │
│              ↓                          │
│  3. DESIGN                              │
│     └─ How should we approach this?     │
│              ↓                          │
│  4. DECOMPOSE                           │
│     └─ Break into manageable phases     │
│              ↓                          │
│  5. ASSESS                              │
│     └─ Risks, dependencies, complexity  │
│              ↓                          │
│  6. PRESENT                             │
│     └─ Show plan, wait for approval     │
└─────────────────────────────────────────┘
```

## Tool Preferences

| Priority | Tool | Use Case |
|----------|------|----------|
| 1 | Read | Understand existing code |
| 2 | Grep/Glob | Find affected areas |
| 3 | Task (Explore) | Map codebase structure |
| 4 | AskUserQuestion | Clarify requirements |

## Planning Templates

### Feature Plan
```markdown
# Implementation Plan: [Feature Name]

## Overview
[1-2 sentence description]

## Requirements
- [ ] [Requirement 1]
- [ ] [Requirement 2]

## Affected Areas
- `path/to/file1.ts` - [what changes]
- `path/to/file2.ts` - [what changes]

## Approach
[Chosen approach and why]

### Alternative Considered
[Other option and why not chosen]

## Phases

### Phase 1: [Name] (Complexity: LOW)
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Name] (Complexity: MEDIUM)
- [ ] Task 1
- [ ] Task 2

## Dependencies
- [External dependency]
- [Internal dependency]

## Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [Risk 1] | LOW/MED/HIGH | LOW/MED/HIGH | [How to handle] |

## Assumptions
- [Assumption 1]
- [Assumption 2]

## Complexity: [LOW/MEDIUM/HIGH]

---
**WAITING FOR CONFIRMATION**
Proceed? (yes / no / modify: [changes])
```

### Refactoring Plan
```markdown
# Refactoring Plan: [Target]

## Current State
[What exists now and its problems]

## Desired State
[What it should look like after]

## DDD Approach

### ANALYZE
- [ ] Document current behavior
- [ ] Identify all usages

### PRESERVE
- [ ] Ensure test coverage
- [ ] Create characterization tests if needed

### IMPROVE
- [ ] [Refactoring step 1]
- [ ] [Refactoring step 2]

## Risk Assessment
[What could go wrong]

## Rollback Plan
[How to revert if needed]
```

## Complexity Estimation

| Level | Characteristics |
|-------|-----------------|
| **LOW** | Single file, < 100 lines, no dependencies |
| **MEDIUM** | 2-5 files, < 500 lines, some dependencies |
| **HIGH** | 5+ files, architectural changes, external deps |

## Risk Assessment Matrix

| Probability \ Impact | LOW | MEDIUM | HIGH |
|---------------------|-----|--------|------|
| **HIGH** | ⚠️ Monitor | 🔶 Plan B | 🔴 Blocker |
| **MEDIUM** | ✅ Accept | ⚠️ Monitor | 🔶 Plan B |
| **LOW** | ✅ Accept | ✅ Accept | ⚠️ Monitor |

## Output Style

Plans must include:
1. Clear scope definition
2. Phased breakdown
3. Risk assessment
4. Explicit assumptions
5. **WAITING FOR CONFIRMATION** marker

## Quick Reference

```bash
# This context is for:
- New feature planning
- Refactoring strategy
- Architecture decisions
- Complex task breakdown

# Switch to other contexts:
- @contexts/research.md  → Need more understanding first
- @contexts/dev.md       → Plan approved, ready to code
- @contexts/review.md    → Review plan before starting
```

---

Version: 1.0.0
Principle: Plan > React
