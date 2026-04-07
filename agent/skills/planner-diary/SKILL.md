---
name: python3 planner-diary/scripts/planner_diary.py
display_name: 오늘의 한마디
description: "Record the daily one-liner summary (오늘의 한마디) and mood shown in the Planner. NOT for general note-taking."
version: 1.0.0
emoji: "📔"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords: [오늘의 한마디, 한마디, 컨디션, 기분, 하루, diary, mood, journal]
  when_to_use:
    - User wants to record today's one-liner summary (오늘의 한마디)
    - User wants to record today's mood/condition
    - User wants to read past diary/mood entries
  not_for:
    - General notes or writing → use planner-reflection (노트 섹션)
    - Task memos (use planner-tasks memo)
---

# 오늘의 한마디 Skill

웹 플래너의 **"오늘의 한마디"** 섹션과 기분(mood)을 기록합니다.

## Commands

### write — 오늘의 한마디 + 기분 기록
```
python3 planner-diary/scripts/planner_diary.py --user-id UID write \
  --text "한마디 요약" \
  --mood good \
  --note "부가 내용 (선택)"
```
- `--text` (필수): **오늘의 한마디** — 웹 UI "오늘의 한마디" 섹션에 표시됨
- `--mood` (선택): great/good/neutral/tired/rough (기본값: neutral)
- `--note` (선택): 일기 부가 내용 — **웹 UI "노트" 섹션(planner-reflection)과 다름**

> ⚠️ `--note`는 diary 내부의 보조 메모 필드입니다. 사용자가 "노트에 기록해줘"라고 하면
> **planner-reflection** 스킬을 사용하세요.

### read — 조회
```
python3 planner-diary/scripts/planner_diary.py --user-id UID read --date 2026-04-07
```

### mood — 기분만 기록
```
python3 planner-diary/scripts/planner_diary.py --user-id UID mood --mood great
```
