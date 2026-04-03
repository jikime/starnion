---
name: python3 planner-diary/scripts/planner_diary.py
display_name: 일기
description: "Write and read daily diary entries with mood tracking. One-liner summaries and mood for each day."
version: 1.0.0
emoji: "📔"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [일기, 오늘 일기, 컨디션, 기분, 하루, diary, mood, journal]
  when_to_use:
    - User wants to write a diary entry or one-liner summary
    - User wants to record today's mood/condition
    - User wants to read past diary entries
  not_for:
    - Reflection notes (use planner-reflection)
    - Task memos (use planner-tasks memo)
---

# Diary Skill
