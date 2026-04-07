---
name: python3 planner-reflection/scripts/planner_reflection.py
display_name: 노트
description: "Record notes in the Planner's '노트' section. Use when user says '노트에 기록해줘', '메모해줘', or wants to save any general note, thought, or reflection."
version: 1.0.0
emoji: "💭"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [노트, 노트에 기록, 메모, 성찰, 회고, 반성, 생각, reflection, note, memo]
  when_to_use:
    - User says "노트에 기록해줘", "메모해줘", or wants to save any note
    - User wants to write a reflection, thought, or insight
    - User wants to review past notes
  not_for:
    - 오늘의 한마디 or mood recording (use planner-diary)
    - Task memos (use planner-tasks memo)
---

# 노트 Skill

웹 플래너의 **"노트"** 섹션(`planner_reflection_notes`)에 기록합니다.
하루에 여러 개의 노트를 추가할 수 있습니다.

## Commands

### add — 노트 추가
```
python3 planner-reflection/scripts/planner_reflection.py --user-id UID add \
  --text "기록할 내용"
```
- `--text` (필수): 노트 내용
- `--date` (선택): 날짜 (기본값: 오늘)

### list — 노트 목록 조회
```
python3 planner-reflection/scripts/planner_reflection.py --user-id UID list --date 2026-04-07
```
