---
name: python3 planner-reflection/scripts/planner_reflection.py
display_name: 성찰 노트
description: "Add and review daily reflection notes. Record thoughts, learnings, and insights."
version: 1.0.0
emoji: "💭"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [성찰, 회고, 노트, 반성, 생각, reflection, review, note]
  when_to_use:
    - User wants to write a reflection or thought
    - User wants to review past reflection notes
  not_for:
    - Diary entries with mood (use planner-diary)
    - Task memos (use planner-tasks memo)
---

# Reflection Notes Skill
