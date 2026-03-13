# Sequential Thinking & UltraThink Guide

Detailed usage patterns for Sequential Thinking MCP tool and UltraThink mode.

## Tool Parameters

### Required
- `thought` (string): Current thinking step content
- `nextThoughtNeeded` (boolean): Whether another step is needed
- `thoughtNumber` (integer): Current thought number (starts from 1)
- `totalThoughts` (integer): Estimated total thoughts needed

### Optional
- `isRevision` (boolean): Revises previous thinking (default: false)
- `revisesThought` (integer): Which thought is being reconsidered
- `branchFromThought` (integer): Branching point for alternative reasoning
- `branchId` (string): Branch identifier
- `needsMoreThoughts` (boolean): Need more thoughts beyond estimate

## Usage Pattern

```
Step 1: thought: "Analyzing: [problem]" | thoughtNumber: 1 | nextThoughtNeeded: true
Step 2: thought: "Breaking down: [sub-problem]" | thoughtNumber: 2 | nextThoughtNeeded: true
Step 3: thought: "Revising thought 2: [correction]" | isRevision: true | revisesThought: 2
Step N: thought: "Conclusion: [answer]" | nextThoughtNeeded: false
```

## UltraThink Mode

Activated by `--ultrathink` flag. Combines Sequential Thinking with agent decomposition.

### Process
1. **Request Analysis**: Identify task, keywords, complexity
2. **Sequential Thinking**: Structured reasoning with thought steps
3. **Execution Planning**: Map subtasks → agents, identify parallel opportunities
4. **Execution**: Launch agents per plan, integrate results

### UltraThink Thought Pattern
```
Thought 1: "Analyzing user request: [content]"
Thought 2: "Breaking into subtasks: 1) [x] 2) [y] 3) [z]"
Thought 3: "Agent mapping: [x] → backend, [y] → frontend"
Thought 4: "Execution: [x,y] parallel, [z] depends on [x]"
Thought 5: "Final plan: Launch [agents] parallel, then [agent]"
```

### When to Use UltraThink
- Complex multi-domain tasks (backend + frontend + testing)
- Architecture decisions affecting multiple files
- Performance optimization requiring analysis
- Security review needs
- Refactoring with behavior preservation

### Legacy Thinking Process
For backward compatibility:
1. Prerequisite Check (AskUserQuestion)
2. First Principles (Five Whys, constraints vs preferences)
3. Alternative Generation (2-3 approaches)
4. Trade-off Analysis (Performance, Maintainability, Cost, Risk, Scalability)
5. Bias Check (contrary evidence review)

## Guidelines
1. Start with reasonable totalThoughts, adjust with needsMoreThoughts
2. Use isRevision for corrections
3. Maintain thoughtNumber sequence
4. Set nextThoughtNeeded: false only when complete
5. Use branching for alternative approaches

---

Version: 1.0.0
Source: Consolidated from CLAUDE.md Sections 11 + 11.1
