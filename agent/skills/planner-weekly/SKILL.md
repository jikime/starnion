---
name: python3 planner-weekly/scripts/planner_weekly.py
display_name: 주간 목표
description: "Manage weekly Big Rocks in Franklin Planner. Add, toggle, delete weekly goals per role."
version: 1.0.0
emoji: "🪨"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [주간, 이번주, 빅락, Big Rock, 주간 목표, 주간 계획, weekly]
  when_to_use:
    - User wants to set or review weekly goals (Big Rocks)
    - User says "이번주 목표" or "주간 계획"
  not_for:
    - Daily tasks (use planner-tasks)
    - Long-term D-Day goals (use planner-goals)
---

# Weekly Goals (Big Rocks) Skill

## Usage Flow
1. Week is calculated as Monday of current week if not specified
2. Use `planner-roles list` to get role_id if needed
