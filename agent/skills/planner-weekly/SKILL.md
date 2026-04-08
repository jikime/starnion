---
name: python3 planner-weekly/scripts/planner_weekly.py
display_name: 주간 목표
description: "Manage weekly key goals in Planner. Add, toggle, delete weekly goals per role. Use for: 주간 목표, 이번 주 목표, weekly goal, 주간 핵심목표, 주간 계획"
version: 1.0.0
emoji: "🎯"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [주간, 이번주, 핵심 목표, 주간 목표, 주간 계획, weekly, key goal]
  when_to_use:
    - User wants to set or review weekly key goals
    - User says "이번주 목표" or "주간 계획"
  not_for:
    - Daily tasks (use planner-tasks)
    - Long-term D-Day goals (use planner-goals)
---

# Weekly Key Goals Skill

## Usage Flow
1. Week is calculated as Monday of current week if not specified
2. Use `planner-roles list` to get role_id if needed
