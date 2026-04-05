---
name: python3 planner-tasks/scripts/planner_tasks.py
display_name: 업무 관리
description: "Manage daily planner tasks with ABC priorities. Add, search, update status, delete, forward to tomorrow, and manage task memos. Use when the user mentions tasks, to-dos, or daily planning."
version: 1.0.0
emoji: "📋"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords:
    - 업무
    - 할일
    - 할 일
    - 투두
    - 일정
    - 오늘 할일
    - 업무 추가
    - 업무 완료
    - 완료 처리
    - 내일로
    - 이월
    - 메모
    - task
    - todo
    - daily plan
  when_to_use:
    - User wants to add a new task to their daily planner
    - User wants to check today's tasks or a specific date's tasks
    - User wants to mark a task as done, in-progress, or cancelled
    - User wants to forward a task to tomorrow
    - User wants to add/remove a memo on a task
    - User says "오늘 업무 뭐 있어" or "보고서 완료 처리해줘"
  not_for:
    - Long-term goals with due dates (use planner-goals)
    - Weekly key goals (use planner-weekly)
    - Inbox/temporary items (use planner-inbox)
---

# Daily Task Management Skill

Manages tasks in the `planner_tasks` table (where `is_inbox = FALSE`).

## Usage Flow (for LLM)

1. **Date**: If user doesn't specify a date, use today (YYYY-MM-DD). Interpret "어제/내일/모레" as relative dates.
2. **Finding a task**: If user references a task by title keyword, first run `search` to find matching IDs.
3. **Execution**: Use the matched ID to run update/delete/forward/memo commands.
4. **Role matching**: If user mentions a role name, first run `planner-roles list` to get the role_id.

## Subcommands

### search — Find tasks by keyword
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID search --keyword "보고서" [--date 2026-04-03]
```

### add — Add a new task
`--priority` accepts `A`, `A1`, `B2`, `C3` format. The number sets the sort order (1-based).
`--weekly-goal-id` links the task to a weekly key plan (optional).
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID add --title "보고서 작성" --priority A1 [--role-id 1] [--date 2026-04-03] [--time-start 9] [--time-end 11] [--weekly-goal-id 42]
# Examples: --priority A (auto order), --priority A1 (first A task), --priority B2 (second B task)
# Link to weekly plan: --weekly-goal-id 42 (get ID from planner-weekly list)
```

### list — List tasks for a date
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID list [--date 2026-04-03]
```

### update — Update task fields
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID update --id 5 [--status done] [--title "새 제목"] [--priority B]
```

### delete — Delete a task
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID delete --id 5
```

### forward — Forward task to tomorrow
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID forward --id 5
```

### memo — Add/update memo on a task
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID memo --id 5 --text "핵심 KPI 3개 포함"
```

### memo-clear — Remove memo from a task
```bash
python3 planner-tasks/scripts/planner_tasks.py --user-id UID memo-clear --id 5
```
