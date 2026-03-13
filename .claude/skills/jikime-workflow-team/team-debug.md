# Workflow: Team Debug - Competing Hypothesis Investigation

Purpose: Debug complex issues through parallel hypothesis investigation.
Orchestrator: J.A.R.V.I.S. (Development)
Flow: TeamCreate → Hypothesis Generation → Parallel Investigation → Evidence Synthesis → Resolution

## Prerequisites

- `workflow.team.enabled: true` in `.jikime/config/workflow.yaml`
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in environment
- Complex bug with unclear root cause
- Triggered by: `/jikime:build-fix --team` OR manual team debug request

## When to Use Team Debug

Use team-based debugging when:
- Multiple potential root causes exist
- Issue spans multiple system components
- Previous single-agent debugging failed
- Time-sensitive bug requiring parallel investigation

## Phase 0: Setup

### 0.1 Gather Bug Context

```
Read:
  - Error logs and stack traces
  - Recent changes (git log)
  - Related code files
  - Previous debugging attempts
```

### 0.2 Generate Hypotheses

J.A.R.V.I.S. analyzes symptoms and generates 2-4 competing hypotheses:

```
Example hypotheses for "API returns 500 error intermittently":

Hypothesis 1: Database connection pool exhaustion
  - Evidence needed: Connection pool metrics, query performance
  - Files to check: src/db/pool.ts, logs/db.log

Hypothesis 2: Race condition in auth middleware
  - Evidence needed: Request timing, concurrent request patterns
  - Files to check: src/middleware/auth.ts, tests/auth.test.ts

Hypothesis 3: Memory leak causing service degradation
  - Evidence needed: Memory usage over time, heap dumps
  - Files to check: Node process metrics, src/services/*
```

### 0.3 Create Team

```
TeamCreate(team_name: "jikime-debug-{bug-id}")
```

### 0.4 Create Investigation Tasks

```
for each hypothesis:
  TaskCreate:
    subject: "Investigate: {hypothesis.title}"
    description: |
      Evidence needed: {hypothesis.evidence}
      Files to check: {hypothesis.files}
      Success criteria: Confirm or refute hypothesis with evidence
    assignee: hypothesis-{N}
    status: pending
```

## Phase 1: Spawn Investigation Team

Launch investigators in parallel. Use `haiku` model for fast, cheap investigation.

```
Task(
  subagent_type: "debugger",
  team_name: "jikime-debug-{bug-id}",
  name: "hypothesis-1",
  model: "haiku",
  prompt: """
    You are investigating Hypothesis 1: Database connection pool exhaustion

    BUG SYMPTOMS:
    {bug_description}

    YOUR HYPOTHESIS:
    Database connections are being exhausted, causing intermittent 500 errors
    when no connections are available in the pool.

    INVESTIGATION STEPS:
    1. Check database connection pool configuration
    2. Look for connection leaks (connections not released)
    3. Analyze query patterns that might hold connections
    4. Check for proper error handling on DB operations
    5. Review connection pool metrics if available

    FILES TO CHECK:
    - src/db/pool.ts
    - src/db/connection.ts
    - src/repositories/*.ts
    - Database logs

    EVIDENCE COLLECTION:
    - Screenshot relevant code sections
    - Note specific line numbers
    - Record any suspicious patterns
    - Document connection lifecycle

    WHEN DONE:
    Send findings to team-lead via SendMessage:
    SendMessage(
      recipient: "team-lead",
      type: "hypothesis_result",
      content: {
        hypothesis: "Database connection pool exhaustion",
        verdict: "confirmed" | "refuted" | "inconclusive",
        confidence: 0-100,
        evidence: [
          { type: "code", file: "...", line: N, description: "..." },
          { type: "log", content: "...", description: "..." }
        ],
        root_cause: "..." | null,
        suggested_fix: "..." | null
      }
    )
    Mark task completed via TaskUpdate.
  """
)

Task(
  subagent_type: "debugger",
  team_name: "jikime-debug-{bug-id}",
  name: "hypothesis-2",
  model: "haiku",
  prompt: """
    You are investigating Hypothesis 2: Race condition in auth middleware

    BUG SYMPTOMS:
    {bug_description}

    YOUR HYPOTHESIS:
    Race condition in authentication middleware causes intermittent failures
    when multiple requests try to refresh tokens simultaneously.

    INVESTIGATION STEPS:
    1. Review auth middleware code for shared state
    2. Check token refresh logic for race conditions
    3. Look for missing locks or mutex on shared resources
    4. Analyze request timing patterns
    5. Check for proper async/await handling

    FILES TO CHECK:
    - src/middleware/auth.ts
    - src/services/token.service.ts
    - src/utils/cache.ts

    ...same evidence collection and SendMessage format...
  """
)

Task(
  subagent_type: "debugger",
  team_name: "jikime-debug-{bug-id}",
  name: "hypothesis-3",
  model: "haiku",
  prompt: """
    You are investigating Hypothesis 3: Memory leak causing degradation

    ...similar format...
  """
)
```

## Phase 2: Monitor Investigations

J.A.R.V.I.S. monitors all investigators:

### 2.1 Track Progress

```
TaskList() periodically:
  → Check which investigations are complete
  → Identify any stuck investigators
  → Set time limit per investigation (e.g., 5 minutes)
```

### 2.2 Handle Early Confirmation

If investigator finds definitive root cause:

```
IF hypothesis_result.verdict == "confirmed" AND confidence > 90:
  → Notify other investigators to wrap up
  → Proceed to Phase 3 early
```

### 2.3 Cross-Pollination

If investigator finds evidence relevant to another hypothesis:

```
SendMessage(
  recipient: "hypothesis-2",
  type: "evidence_share",
  content: {
    from_hypothesis: "hypothesis-1",
    evidence: "Found suspicious lock pattern in auth.ts:45"
  }
)
```

## Phase 3: Evidence Synthesis

After all investigations complete:

### 3.1 Collect Results

Gather all `hypothesis_result` messages:

```
results = [
  { hypothesis: "DB pool", verdict: "refuted", confidence: 85 },
  { hypothesis: "Race condition", verdict: "confirmed", confidence: 92 },
  { hypothesis: "Memory leak", verdict: "inconclusive", confidence: 40 }
]
```

### 3.2 Determine Root Cause

```
IF single confirmed hypothesis with high confidence:
  → Accept as root cause
  → Proceed to fix

ELIF multiple confirmed or all inconclusive:
  → Present findings to user
  → Request guidance on which to pursue

ELIF all refuted:
  → Report to user
  → Suggest generating new hypotheses
```

### 3.3 User Confirmation

```
AskUserQuestion:
  question: "Investigation complete. Root cause: {hypothesis}. Proceed with fix?"
  header: "Debug Results"
  options:
    - label: "Apply suggested fix"
      description: "{suggested_fix_summary}"
    - label: "Investigate further"
      description: "Generate additional hypotheses"
    - label: "Fix manually"
      description: "I'll handle the fix myself"
```

## Phase 4: Apply Fix (if approved)

### 4.1 Delegate Fix

If user approves automatic fix:

```
Task(
  subagent_type: "debugger",
  prompt: """
    Apply fix for: {root_cause}

    EVIDENCE:
    {evidence_summary}

    SUGGESTED FIX:
    {suggested_fix}

    INSTRUCTIONS:
    1. Create characterization test that reproduces the bug
    2. Verify test fails
    3. Apply minimal fix
    4. Verify test passes
    5. Run full test suite
    6. Report results
  """
)
```

### 4.2 Verify Fix

- Run tests
- Check for regressions
- Verify original bug is resolved

## Phase 5: Cleanup

### 5.1 Shutdown Investigators

```
for investigator in [hypothesis-1, hypothesis-2, hypothesis-3]:
  SendMessage(
    type: "shutdown_request",
    recipient: investigator,
    content: "Investigation complete. Shutting down."
  )
```

### 5.2 Delete Team

```
TeamDelete(team_name: "jikime-debug-{bug-id}")
```

### 5.3 Document Resolution

Create debug report:

```markdown
## Debug Report: {bug-id}

### Symptoms
{original_bug_description}

### Hypotheses Investigated
| Hypothesis | Verdict | Confidence |
|------------|---------|------------|
| DB Pool | Refuted | 85% |
| Race Condition | **Confirmed** | 92% |
| Memory Leak | Inconclusive | 40% |

### Root Cause
{root_cause_description}

### Evidence
{evidence_list}

### Fix Applied
{fix_description}

### Verification
- [x] Reproduction test created
- [x] Fix applied
- [x] Tests pass
- [x] No regressions
```

## Fallback

If team debug fails:
1. Fall back to single debugger subagent
2. Use sequential hypothesis investigation
3. Report findings without parallel speedup

---

Version: 1.0.0
Phase: Debug
Orchestrator: J.A.R.V.I.S.
Pattern: Competing Hypotheses
