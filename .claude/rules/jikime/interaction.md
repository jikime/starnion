# User Interaction Rules

Rules for user interaction and AskUserQuestion usage.

## Critical Constraint

> Subagents invoked via Task() operate in isolated, stateless contexts and cannot interact with users directly.

**Only J.A.R.V.I.S. or F.R.I.D.A.Y. can use AskUserQuestion** - subagents cannot.

## Correct Workflow Pattern

```
Step 1: J.A.R.V.I.S./F.R.I.D.A.Y. uses AskUserQuestion to collect user preferences
        ↓
Step 2: J.A.R.V.I.S./F.R.I.D.A.Y. invokes Task() with user choices in the prompt
        ↓
Step 3: Subagent executes based on provided parameters (no user interaction)
        ↓
Step 4: Subagent returns structured response with results
        ↓
Step 5: J.A.R.V.I.S./F.R.I.D.A.Y. uses AskUserQuestion for next decision based on agent response
```

## AskUserQuestion Constraints

| Constraint | Rule |
|------------|------|
| **Options per question** | Maximum 4 |
| **Emoji usage** | NO emoji in question text, headers, or option labels |
| **Language** | Questions must be in user's `conversation_language` |

## Clarification Rules

- When user intent is unclear, use AskUserQuestion to clarify **before** proceeding
- Collect all necessary user preferences **before** delegating to agents
- Never assume user preferences without asking

## Prohibited Patterns

**DO NOT** (Subagent trying to ask user):
```python
# Inside subagent Task()
AskUserQuestion(...)  # WILL FAIL - subagents cannot interact with users
```

**DO** (J.A.R.V.I.S./F.R.I.D.A.Y. handling user interaction):
```
J.A.R.V.I.S.: AskUserQuestion("Which approach do you prefer?", options=[...])
User: "Option A"
J.A.R.V.I.S.: Task("backend", "Implement using approach A as user requested")
```

## Checklist

- [ ] Only J.A.R.V.I.S./F.R.I.D.A.Y. uses AskUserQuestion
- [ ] Questions have max 4 options
- [ ] No emoji in questions
- [ ] Questions in user's conversation_language
- [ ] All preferences collected before delegation

---

Version: 1.0.0
Source: Extracted from CLAUDE.md Section 7
