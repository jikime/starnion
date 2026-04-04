---
name: python3 planner-goals/scripts/planner_goals.py
display_name: 목표 관리
description: "Manage D-Day goals in Planner. Track long-term goals with due dates and role assignments."
version: 1.0.0
emoji: "🎯"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [목표, 목표 추가, 목표 관리, D-Day, 디데이, goal, target, deadline]
  when_to_use:
    - User wants to set or track long-term goals with deadlines
    - User asks about D-Day countdowns for goals
  not_for:
    - Daily tasks (use planner-tasks)
    - Weekly big rocks (use planner-weekly)
---

# Goal Management Skill

## Usage Flow
1. If role not specified, use `planner-roles list` to find role_id
2. `search` to find goals by keyword
3. CRUD with matched ID
