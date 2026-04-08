---
name: python3 planner-inbox/scripts/planner_inbox.py
display_name: 임시보관
description: "Manage planner inbox items. Capture quick ideas, promote to daily tasks with priority. Use for: 임시보관, 인박스, inbox, 아이디어 저장, 나중에 처리, quick capture"
version: 1.0.0
emoji: "📥"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords:
    - 임시보관
    - 인박스
    - 캡처
    - 나중에
    - 메모해둬
    - inbox
    - capture
  when_to_use:
    - User wants to quickly capture an idea or task for later
    - User wants to see their inbox items
    - User wants to move an inbox item to daily tasks
  not_for:
    - Direct daily task management (use planner-tasks)
---

# Inbox Management Skill

## Usage Flow
1. `search` or `list` to find items
2. `promote` to move to daily tasks with priority
3. `add` to capture new items quickly
