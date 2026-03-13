---
name: jikime-foundation-thinking
description: >
  Structured thinking toolkit combining Critical Evaluation, Diverge-Converge
  Brainstorming, and Deep Questioning frameworks for creative problem-solving
  and rigorous analysis. Use when generating ideas, evaluating proposals,
  questioning assumptions, or exploring solution spaces systematically.
  Do NOT use for architecture decisions (use jikime-foundation-philosopher instead)
  or code quality validation (use jikime-foundation-quality instead).
license: Apache-2.0
compatibility: Designed for Claude Code
allowed-tools: Read Grep Glob
user-invocable: false
metadata:
  version: "1.0.0"
  category: "foundation"
  status: "active"
  updated: "2026-03-09"
  modularized: "true"
  tags: "foundation, critical-thinking, brainstorming, ideation, evaluation, creative-thinking, diverge-converge"
  related-skills: "jikime-foundation-philosopher"

# JikiME Extension: Progressive Disclosure
progressive_disclosure:
  enabled: true
  level1_tokens: 100
  level2_tokens: 5000

# JikiME Extension: Triggers
triggers:
  keywords: ["brainstorm", "ideation", "creative", "evaluate", "critical thinking", "diverge", "converge", "generate ideas", "explore options", "question", "deep analysis", "problem exploration", "solution space", "scoring", "clustering", "prioritize"]
  agents:
    - "manager-strategy"
    - "manager-spec"
  phases:
    - "plan"
---

# JikiME Foundation Thinking

Structured thinking toolkit for creative problem-solving and rigorous analysis. Integrates three complementary frameworks that cover the full spectrum from idea generation to critical evaluation.

Core Philosophy: Generate broadly, evaluate rigorously, question deeply. Creativity and criticism are complementary forces.

## Quick Reference

What is the Thinking Toolkit?

Three integrated frameworks for structured thinking:
- **Critical Evaluation**: Rigorous 7-step analysis to assess proposals and detect flaws
- **Diverge-Converge**: Systematic brainstorming from 20-50 raw ideas to 3-5 validated solutions
- **Deep Questioning**: 6-layer progressive inquiry to uncover hidden requirements and risks

When to Use Each Framework:

- Evaluating a proposal or recommendation → Critical Evaluation
- Generating solutions for an open-ended problem → Diverge-Converge
- Exploring an unfamiliar domain or unclear requirement → Deep Questioning
- Complex decisions → Combine all three (Question first, Generate second, Evaluate third)

## Framework Integration Pattern

For complex decisions, apply in sequence:

```
1. Deep Questioning → Understand the real problem (Layers 1-6)
       ↓
2. Diverge-Converge → Generate and filter solutions (Phases 1-5)
       ↓
3. Critical Evaluation → Validate the selected solution (Steps 1-7)
```

For simpler tasks, use only the relevant framework.

## Module Reference

- `modules/critical-evaluation.md` — 7-step critical evaluation process with output template
- `modules/diverge-converge.md` — 5-phase brainstorming framework with scoring matrix
- `modules/deep-questioning.md` — 6-layer progressive inquiry with depth indicators
- `references/reference.md` — Quick-reference card and framework selection guide

---

Version: 1.0.0
Last Updated: 2026-03-09
Source: JikiME-ADK thinking toolkit (adapted from Boris Cherny best practices)
