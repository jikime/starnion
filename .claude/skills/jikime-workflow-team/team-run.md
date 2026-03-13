# Workflow: Team Run - Agent Teams Implementation

Purpose: Implement SPEC requirements through parallel team-based development.
Orchestrator: J.A.R.V.I.S. (Development)
Flow: TeamCreate → Task Decomposition → Parallel Implementation → Quality Gate → Shutdown

## Prerequisites

- `workflow.team.enabled: true` in `.jikime/config/workflow.yaml`
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in environment
- Completed SPEC document at `.jikime/specs/SPEC-XXX/spec.md`
- Triggered by: `/jikime:2-run SPEC-XXX --team` OR auto-detected complexity >= threshold

## Phase 0: Team Setup

### 0.1 Read Configuration

```yaml
Read:
  - .jikime/specs/SPEC-XXX/spec.md         # SPEC document
  - .jikime/config/workflow.yaml           # Team settings & file ownership
  - .jikime/config/quality.yaml            # Development mode & coverage targets
```

### 0.2 Create Team

```
TeamCreate(team_name: "jikime-run-{spec-id}")
```

### 0.3 Decompose Tasks with File Ownership

Parse SPEC and create tasks with clear file ownership boundaries:

```
# Backend tasks (team-backend-dev owns)
TaskCreate: "Implement user authentication API"
  → Owner: backend-dev
  → Files: src/api/auth.ts, src/services/auth.service.ts
  → Status: pending

TaskCreate: "Create database models and migrations"
  → Owner: backend-dev
  → Files: src/models/user.ts, prisma/migrations/*
  → Status: pending

# Frontend tasks (team-frontend-dev owns)
TaskCreate: "Implement login form component"
  → Owner: frontend-dev
  → Files: src/components/auth/LoginForm.tsx
  → Blocked by: "Implement user authentication API" (needs API contract)
  → Status: blocked

TaskCreate: "Create authentication context and hooks"
  → Owner: frontend-dev
  → Files: src/hooks/useAuth.ts, src/stores/auth.ts
  → Status: pending

# Testing tasks (team-tester owns)
TaskCreate: "Write authentication integration tests"
  → Owner: tester
  → Files: tests/api/auth.test.ts
  → Blocked by: All backend tasks
  → Status: blocked

TaskCreate: "Write login form component tests"
  → Owner: tester
  → Files: tests/components/LoginForm.test.tsx
  → Blocked by: "Implement login form component"
  → Status: blocked

# Quality gate (team-quality owns)
TaskCreate: "Validate TRUST 5 compliance"
  → Owner: quality
  → Blocked by: All implementation and test tasks
  → Status: blocked
```

## Phase 1: Spawn Implementation Team

Launch teammates with explicit file ownership. All spawns in **single response**.

```
Task(
  subagent_type: "team-backend-dev",
  team_name: "jikime-run-{spec-id}",
  name: "backend-dev",
  prompt: """
    You are a backend developer on team jikime-run-{spec-id}.

    SPEC: {spec_summary}
    METHODOLOGY: {ddd|tdd|hybrid} (from quality.yaml)

    YOUR FILE OWNERSHIP:
    - src/api/**
    - src/services/**
    - src/repositories/**
    - src/models/**
    - prisma/**

    WORKFLOW:
    1. Check TaskList for available tasks assigned to you
    2. Claim task and mark as in_progress via TaskUpdate
    3. Implement following {methodology}:
       - TDD: Write test first, then implement, then refactor
       - DDD: Analyze, preserve behavior with tests, then improve
    4. Run tests after each change
    5. When API is ready, notify frontend-dev via SendMessage:
       SendMessage(
         recipient: "frontend-dev",
         type: "api_ready",
         content: { endpoint: "POST /api/auth/login", schema: {...} }
       )
    6. Mark task completed via TaskUpdate
    7. Check TaskList for next available task

    CONFLICT RESOLUTION:
    - Only modify files in YOUR ownership
    - For shared files (src/types/**), coordinate via SendMessage
    - If blocked, report to team-lead immediately
  """
)

Task(
  subagent_type: "team-frontend-dev",
  team_name: "jikime-run-{spec-id}",
  name: "frontend-dev",
  prompt: """
    You are a frontend developer on team jikime-run-{spec-id}.

    SPEC: {spec_summary}
    METHODOLOGY: {ddd|tdd|hybrid} (from quality.yaml)

    YOUR FILE OWNERSHIP:
    - src/components/**
    - src/pages/**
    - src/app/**
    - src/hooks/**
    - src/stores/**

    WORKFLOW:
    1. Check TaskList for available tasks (watch for API dependencies)
    2. Wait for api_ready messages from backend-dev before API integration
    3. While waiting, implement UI components with mock data
    4. When ready for testing, notify tester via SendMessage:
       SendMessage(
         recipient: "tester",
         type: "component_ready",
         content: { component: "LoginForm", path: "..." }
       )
    5. Mark task completed via TaskUpdate
    6. Check TaskList for next available task

    CONFLICT RESOLUTION:
    - Only modify files in YOUR ownership
    - Coordinate type definitions with backend-dev via SendMessage
  """
)

Task(
  subagent_type: "team-tester",
  team_name: "jikime-run-{spec-id}",
  name: "tester",
  prompt: """
    You are a testing specialist on team jikime-run-{spec-id}.

    SPEC: {spec_summary}
    COVERAGE TARGET: 85%+ (from quality.yaml)

    YOUR FILE OWNERSHIP:
    - tests/**
    - __tests__/**
    - **/*.test.*
    - **/*.spec.*
    - cypress/**
    - playwright/**

    WORKFLOW:
    1. Check TaskList for testing tasks
    2. Wait for implementation tasks to complete (ready_for_testing messages)
    3. Write tests following testing pyramid:
       - Unit tests for functions/components
       - Integration tests for API flows
       - E2E tests for critical user journeys
    4. Report bugs to responsible teammate via SendMessage:
       SendMessage(
         recipient: "backend-dev",
         type: "bug_report",
         content: { test: "...", expected: "...", actual: "..." }
       )
    5. Send coverage report to quality via SendMessage
    6. Mark task completed via TaskUpdate

    DO NOT modify implementation files (src/*) - only test files
  """
)

Task(
  subagent_type: "team-quality",
  team_name: "jikime-run-{spec-id}",
  name: "quality",
  prompt: """
    You are a quality assurance specialist on team jikime-run-{spec-id}.

    TRUST 5 FRAMEWORK:
    - Tested: 85%+ coverage
    - Readable: Clear naming, proper structure
    - Unified: Consistent patterns
    - Secured: OWASP compliance
    - Trackable: Proper commits, documentation

    YOUR ROLE: Read-only analysis (permissionMode: plan)

    WORKFLOW:
    1. Wait for all implementation and testing tasks to complete
    2. Run quality assessment:
       - Code quality (complexity, duplication)
       - Test coverage analysis
       - Security scan
       - Documentation check
    3. Report issues to responsible teammates via SendMessage:
       SendMessage(
         recipient: "backend-dev",
         type: "quality_issue",
         content: { file: "...", issue: "...", severity: "high" }
       )
    4. Send final quality gate result to team-lead:
       SendMessage(
         recipient: "team-lead",
         type: "quality_gate",
         content: { passed: true/false, issues: [...], coverage: 87 }
       )
  """
)
```

## Phase 2: Monitor & Coordinate

J.A.R.V.I.S. monitors progress and resolves issues:

### 2.1 Message Handling

| Message Type | Action |
|--------------|--------|
| `api_ready` | Unblock dependent frontend tasks |
| `component_ready` | Notify tester, update TaskList |
| `bug_report` | Forward to owner, track resolution |
| `quality_issue` | Log issue, request fix |
| `quality_gate` | Evaluate pass/fail, proceed or iterate |

### 2.2 Blocker Resolution

If teammate reports blocker:
1. Analyze dependencies in TaskList
2. Coordinate between teammates
3. Escalate to user if external dependency

### 2.3 Progress Tracking

```
TaskList() every N minutes:
  → Track completion percentage
  → Identify stalled tasks
  → Intervene if task exceeds time limit
```

## Phase 3: Quality Gate

After all implementation and testing complete:

### 3.1 Receive Quality Report

Wait for `quality_gate` message from team-quality.

### 3.2 Evaluate Result

```
IF quality_gate.passed:
  → Proceed to Phase 4 (Cleanup)

ELSE:
  → Send fix requests to responsible teammates
  → Wait for fixes
  → Re-run quality assessment
  → Maximum 3 iterations before user escalation
```

### 3.3 User Confirmation (if issues remain)

```
AskUserQuestion:
  question: "Quality gate has {N} unresolved issues. How to proceed?"
  header: "Quality Gate"
  options:
    - label: "Proceed anyway"
      description: "Accept technical debt, document in SPEC"
    - label: "Fix issues"
      description: "Continue iteration until resolved"
    - label: "Cancel run phase"
      description: "Stop and review SPEC"
```

## Phase 4: Cleanup

### 4.1 Shutdown Teammates

```
for teammate in [backend-dev, frontend-dev, tester, quality]:
  SendMessage(
    type: "shutdown_request",
    recipient: teammate,
    content: "Run phase complete. Shutting down."
  )
```

### 4.2 Delete Team

```
TeamDelete(team_name: "jikime-run-{spec-id}")
```

### 4.3 Report Completion

```
Output to user:
  - Implementation summary
  - Test coverage report
  - Quality assessment results
  - Files modified
  - Next steps (sync phase)
```

## Hook Events

### TeammateIdle Hook

When teammate finishes task and goes idle:

```yaml
TeammateIdle:
  exit_code_2: "Keep working - assign more tasks from TaskList"
  exit_code_0: "Accept idle - no more tasks for this teammate"
```

### TaskCompleted Hook

When teammate marks task complete:

```yaml
TaskCompleted:
  exit_code_2: "Reject completion - task needs more work"
  exit_code_0: "Accept completion - task is done"
  validation:
    - Tests pass
    - Coverage target met
    - No lint errors
```

## Fallback

If team mode fails:
1. Log warning with failure reason
2. Fall back to sequential sub-agent execution
3. Use manager-ddd subagent for implementation
4. Continue from last completed task

---

Version: 1.0.0
Phase: Run
Orchestrator: J.A.R.V.I.S.
