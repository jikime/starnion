---
name: python3 planner-roles/scripts/planner_roles.py
display_name: 역할 관리
description: "Manage life roles in Franklin Planner. Add, update, delete roles with colors, big rocks, and missions."
version: 1.0.0
emoji: "🎭"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [역할, 역할 추가, 역할 관리, 미션, 사명, role, big rock]
  when_to_use:
    - User wants to manage their life roles
    - User needs role_id for other planner skills
  not_for:
    - Mission statement (use planner-mission)
---

# Role Management Skill
