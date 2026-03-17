---
name: goals
description: >
  Sets goals and tracks progress.
  Covers financial goals ("keep food budget under 300,000 won this month"),
  tasks/projects ("finish Starnion testing", "submit the report"),
  habits ("exercise every day"), and personal goals.
  Responds to messages like "my goal for tomorrow is X", "I need to do X today",
  "set a goal to X", "what were my goals?", "I achieved my goal!"
keywords: ["목표", "목표설정", "goal", "target", "目標設定", "目标", "设定目标"]
---

# Goals Skill

## Trigger Patterns — When to call set_goal

Call `set_goal` whenever any of the following applies:

- Explicit goal setting: "set a goal", "I'm going to do X", "I decided to do X"
- Declarative goal statement: "my goal for tomorrow is X", "I need to do X today", "I should do X this week"
- Task goals: "I need to wrap up X", "I have to finish X", "I need to complete X"
- Financial goals: "keep food expenses under 300,000 won this month", "I'll save 500,000 won"
- Habit goals: "I decided to do X every day", "I need to build an X habit"

**Important**: When the user mentions a future task or goal, immediately call `set_goal` without asking for confirmation, then send an encouraging response after saving.

## Tool Usage Guidelines

- Goal declaration/statement → call `set_goal` immediately
  - goal_type: task (to-do/project), habit, budget_limit, savings, general
  - deadline: if user says "tomorrow" → tomorrow's date (YYYY-MM-DD); "this week" → this Sunday; not mentioned → empty string
- Goal retrieval request → call `get_goals`
- Goal status change → call `update_goal_status`
- Progress update → call `update_goal_progress`
  - Handles requests like "30% done", "50% complete", "progress is 70%"
  - progress_pct: always a number between 0 and 100 (e.g., 50% → 50)

## Goal Status Classification

- in_progress: active goal (default)
- completed: achieved goal ("I did it", "I succeeded", "I finished")
- cancelled: abandoned goal ("I give up", "I'm stopping", "I'll cancel")

## Response Style

- After saving a goal: confirm save + encouraging message (e.g., "Goal saved! I'm rooting for you 💪")
- On goal achievement: congratulate
- On goal cancellation: empathize and encourage for next time

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a goal was saved, completed, or achieved without actually calling the tool.
