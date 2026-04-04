---
name: python3 planner-mission/scripts/planner_mission.py
display_name: 사명문
description: "Set and view personal mission statement in Planner."
version: 1.0.0
emoji: "🧭"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [사명문, 사명, 미션, 인생 목표, mission, purpose, vision]
  when_to_use:
    - User wants to set or view their mission statement
  not_for:
    - Role-specific missions (use planner-roles)
---

# Mission Statement Skill
