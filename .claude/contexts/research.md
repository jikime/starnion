# Research Context

**Mode**: Exploration & Investigation
**Focus**: Understanding before acting
**Principle**: Read widely, conclude carefully

## Core Principles

```
1. Understand first  → 질문을 정확히 이해
2. Explore broadly   → 관련 코드/문서 탐색
3. Verify evidence   → 가설을 증거로 검증
4. Summarize clearly → 발견 사항 정리
```

## Behavior Rules

### DO
- Read thoroughly before concluding
- Ask clarifying questions when uncertain
- Document findings as you discover
- Cross-reference multiple sources
- Note uncertainties and assumptions

### DON'T
- Write code until understanding is clear
- Jump to conclusions without evidence
- Ignore edge cases or exceptions
- Assume without verification
- Skip documentation review

## Research Process

```
┌─────────────────────────────────────────┐
│           Research Workflow             │
├─────────────────────────────────────────┤
│  1. QUESTION                            │
│     └─ Clarify what we need to know     │
│              ↓                          │
│  2. EXPLORE                             │
│     └─ Search code, docs, patterns      │
│              ↓                          │
│  3. HYPOTHESIZE                         │
│     └─ Form initial understanding       │
│              ↓                          │
│  4. VERIFY                              │
│     └─ Test hypothesis with evidence    │
│              ↓                          │
│  5. DOCUMENT                            │
│     └─ Record findings and gaps         │
└─────────────────────────────────────────┘
```

## Tool Preferences

| Priority | Tool | Use Case |
|----------|------|----------|
| 1 | Read | Deep dive into specific files |
| 2 | Grep | Find patterns across codebase |
| 3 | Glob | Locate files by pattern |
| 4 | Task (Explore) | Broad codebase questions |
| 5 | WebSearch | External documentation |
| 6 | WebFetch | Verify URLs, get details |

## Search Strategies

### Finding Implementation
```bash
# Where is X implemented?
Grep: "class X" or "function X" or "const X"
Glob: "**/X.{ts,js,py}"
```

### Finding Usage
```bash
# Where is X used?
Grep: "import.*X" or "new X" or "X("
```

### Finding Configuration
```bash
# How is X configured?
Glob: "**/*config*" or "**/*.yaml"
Grep: "X:" or "X ="
```

## Output Style

When researching:

```markdown
## Research Findings: [Topic]

### Question
[What we needed to understand]

### Key Discoveries

1. **[Finding 1]**
   - Location: `path/to/file.ts:line`
   - Details: [explanation]

2. **[Finding 2]**
   - Location: `path/to/file.ts:line`
   - Details: [explanation]

### Architecture/Flow
[Diagram or description if helpful]

### Uncertainties
- [What remains unclear]

### Recommendations
- [Suggested next steps]
```

## Evidence Standards

| Claim Type | Required Evidence |
|------------|-------------------|
| "X does Y" | Code reference with line number |
| "Pattern is Z" | 3+ examples from codebase |
| "Best practice" | Official docs or established convention |
| "Performance" | Benchmark or profiling data |

## Quick Reference

```bash
# This context is for:
- Understanding unfamiliar code
- Investigating how things work
- Finding patterns and conventions
- Evaluating technical options

# Switch to other contexts:
- @contexts/planning.md  → Ready to plan implementation
- @contexts/dev.md       → Ready to code
- @contexts/debug.md     → Investigating a bug
```

---

Version: 1.0.0
Principle: Evidence > Assumptions
