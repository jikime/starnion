---
name: Coding Agent
description: Delegates coding tasks to Claude Code SDK. Use for implementing features, code review, refactoring, and writing tests.
keywords: ["코딩", "coding", "claude code", "구현", "implement", "코드 작성", "리팩토링", "refactor", "테스트", "test", "코드 생성", "コーディング", "编程", "코드"]
---

# Coding Agent Skill

## Tool List

| Tool | Description |
|------|-------------|
| `run_coding_agent` | Execute coding tasks via Claude Code SDK (120s timeout) |

## run_coding_agent Usage

- **When to use**: Implementing new features/apps, refactoring, writing unit tests, generating READMEs, fixing bugs — any task that reads and writes files
- **When NOT to use**: Simple one-line edits (edit directly), read-only code review (use read tool)
- `task`: Describe the task in natural language — the more specific, the better the result
- `workdir`: Absolute path to the working directory (auto-creates a per-user temp dir if omitted)
- Timeout: 120 seconds / break complex tasks into smaller steps

### Usage Scenarios

```
"Create a todo CLI in Python"
→ run_coding_agent(task="Create a todo CLI in Python. Support add/list/done commands and save to a JSON file.")

"Add unit tests to this project"
→ run_coding_agent(task="Write pytest unit tests for the existing functions", workdir="/path/to/project")

"Write README"
→ run_coding_agent(task="Analyze the project and write README.md. Include installation, usage, and examples.", workdir="/path/to/project")

"Refactor auth module"
→ run_coding_agent(task="Refactor the auth module. Reduce duplication and improve readability.", workdir="/path/to/project")
```

## Response Style

- Relay the Claude Code SDK output directly to the user
- On error, explain the cause and suggest a fix
- For complex tasks, recommend splitting into sequential steps
- If `workdir` is omitted, inform the user of the auto-generated temp path

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a task was completed without actually calling the tool.
