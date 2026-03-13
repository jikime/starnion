# Workflow: Team Plan - Agent Teams SPEC Creation

Purpose: Create comprehensive SPEC documents through parallel team-based research and analysis.
Orchestrator: J.A.R.V.I.S. (Development) or F.R.I.D.A.Y. (Migration)
Flow: TeamCreate → Parallel Research → Synthesis → SPEC Document → Shutdown

## Prerequisites

- `workflow.team.enabled: true` in `.jikime/config/workflow.yaml`
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in environment
- Triggered by: `/jikime:1-plan --team` OR auto-detected complexity >= threshold

## Phase 0: Team Setup

### 0.1 Read Configuration

```yaml
Read:
  - .jikime/config/workflow.yaml  # Team settings
  - .jikime/config/quality.yaml   # Development mode (DDD/TDD/Hybrid)
```

### 0.2 Create Team

```
TeamCreate(team_name: "jikime-plan-{feature-slug}")
```

### 0.3 Create Shared Task List

```
TaskCreate: "Explore codebase architecture and dependencies"
  → Assignee: researcher
  → Status: pending

TaskCreate: "Analyze requirements, user stories, and edge cases"
  → Assignee: analyst
  → Status: pending

TaskCreate: "Design technical approach and evaluate alternatives"
  → Assignee: architect
  → Blocked by: researcher (needs codebase findings)

TaskCreate: "Synthesize findings into SPEC document"
  → Assignee: team-lead (J.A.R.V.I.S./F.R.I.D.A.Y.)
  → Blocked by: researcher, analyst, architect
```

## Phase 1: Spawn Research Team

Launch all three teammates in a **single response** for parallel execution.
All spawns MUST use Task() with `team_name` and `name` parameters.

```
Task(
  subagent_type: "team-researcher",
  team_name: "jikime-plan-{feature-slug}",
  name: "researcher",
  prompt: """
    You are a codebase researcher on team jikime-plan-{feature-slug}.

    TASK: Explore the codebase for {feature_description}.

    DELIVERABLES:
    1. Map architecture (directory structure, key modules)
    2. Identify relevant files and their relationships
    3. Document existing patterns and conventions
    4. List dependencies and integration points
    5. Note potential risks or complexity areas

    WHEN DONE:
    - Mark your task as completed via TaskUpdate
    - Send findings to team-lead via SendMessage:
      SendMessage(
        recipient: "team-lead",
        type: "research_complete",
        content: { summary: "...", key_files: [...], patterns: [...] }
      )
    - Also share findings with architect:
      SendMessage(recipient: "architect", type: "codebase_findings", ...)
  """
)

Task(
  subagent_type: "team-analyst",
  team_name: "jikime-plan-{feature-slug}",
  name: "analyst",
  prompt: """
    You are a requirements analyst on team jikime-plan-{feature-slug}.

    TASK: Analyze requirements for {feature_description}.

    DELIVERABLES:
    1. Extract functional requirements (EARS format)
    2. Identify edge cases and error scenarios
    3. Define acceptance criteria
    4. Assess risks and constraints
    5. List open questions needing clarification

    WHEN DONE:
    - Mark your task as completed via TaskUpdate
    - Send analysis to team-lead via SendMessage:
      SendMessage(
        recipient: "team-lead",
        type: "analysis_complete",
        content: { requirements: [...], edge_cases: [...], criteria: [...] }
      )
  """
)

Task(
  subagent_type: "team-architect",
  team_name: "jikime-plan-{feature-slug}",
  name: "architect",
  prompt: """
    You are a technical architect on team jikime-plan-{feature-slug}.

    TASK: Design the technical approach for {feature_description}.

    WAIT FOR: Researcher findings (check TaskList or wait for SendMessage)

    DELIVERABLES:
    1. Propose 2-3 implementation alternatives
    2. Evaluate each against criteria (performance, maintainability, risk)
    3. Recommend approach with justification
    4. Define file impact analysis (create, modify, delete)
    5. Establish file ownership boundaries for implementation team
    6. Determine testing strategy (TDD vs DDD per file type)

    WHEN DONE:
    - Mark your task as completed via TaskUpdate
    - Send design to team-lead via SendMessage:
      SendMessage(
        recipient: "team-lead",
        type: "design_complete",
        content: {
          approach: "...",
          file_ownership: {...},
          implementation_order: [...]
        }
      )
  """
)
```

## Phase 2: Monitor & Coordinate

J.A.R.V.I.S./F.R.I.D.A.Y. monitors progress:

### 2.1 Receive Messages

Messages from teammates are delivered automatically. Process:
- `research_complete` → Forward findings to architect if needed
- `analysis_complete` → Note requirements for SPEC
- `design_complete` → Prepare for synthesis
- `question` → Use AskUserQuestion to clarify, then reply

### 2.2 Resolve Blockers

If teammate reports blocker:
1. Assess blocker severity
2. Coordinate with other teammates or user
3. SendMessage resolution to blocked teammate

### 2.3 Track Progress

```
TaskList()  → Check task statuses
            → Identify blocked or stalled tasks
            → Intervene if needed
```

## Phase 3: Synthesis

After all research tasks complete (3 TaskUpdate completions received):

### 3.1 Collect Findings

Aggregate from all teammates:
- Researcher: Architecture map, patterns, risks
- Analyst: Requirements, acceptance criteria, edge cases
- Architect: Technical design, file ownership, implementation order

### 3.2 Generate SPEC Document

Delegate to manager-spec subagent (NOT a teammate):

```
Task(
  subagent_type: "manager-spec",
  prompt: """
    Create SPEC document from the following team findings:

    ## Codebase Research
    {researcher_findings}

    ## Requirements Analysis
    {analyst_findings}

    ## Technical Design
    {architect_findings}

    OUTPUT: Complete SPEC at .jikime/specs/SPEC-XXX/spec.md
  """
)
```

SPEC output location: `.jikime/specs/SPEC-XXX/spec.md`

## Phase 4: User Approval

```
AskUserQuestion:
  question: "SPEC document created. How would you like to proceed?"
  header: "SPEC Ready"
  options:
    - label: "Approve and proceed to implementation"
      description: "Move to /jikime:2-run phase"
    - label: "Request modifications"
      description: "Specify changes needed"
    - label: "Cancel workflow"
      description: "Discard SPEC and stop"
```

## Phase 5: Cleanup

### 5.1 Shutdown Teammates

Send shutdown to all teammates:

```
SendMessage(
  type: "shutdown_request",
  recipient: "researcher",
  content: "Plan phase complete. Shutting down."
)
SendMessage(
  type: "shutdown_request",
  recipient: "analyst",
  content: "Plan phase complete. Shutting down."
)
SendMessage(
  type: "shutdown_request",
  recipient: "architect",
  content: "Plan phase complete. Shutting down."
)
```

### 5.2 Delete Team

After all teammates shut down:

```
TeamDelete(team_name: "jikime-plan-{feature-slug}")
```

### 5.3 Clear Context

Execute `/clear` to free context for next phase.

## Fallback

If team creation fails or AGENT_TEAMS not enabled:
1. Log warning: "Team mode unavailable, falling back to sub-agent mode"
2. Use single manager-spec subagent for SPEC creation
3. Follow standard plan workflow (non-team)

---

Version: 1.0.0
Phase: Plan
Orchestrator: J.A.R.V.I.S. / F.R.I.D.A.Y.
