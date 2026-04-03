---
name: python3 goals/scripts/goals.py
display_name: 목표 관리
description: "Track personal goals and progress with percentages. Use when the user wants to create a goal, update how much they have achieved, or review their active/completed goals. NOT for: date countdowns (use dday skill), diary entries, one-off tasks."
version: 1.0.0
emoji: "🎯"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords:
    - 목표
    - 목표 설정
    - 목표 달성
    - 진행률
    - 진행 상황
    - 얼마나 달성
    - 완료율
    - 목표 추가
    - 목표 업데이트
    - goal
    - achievement
    - progress
    - target
    - milestone
    - percent complete
  when_to_use:
    - User wants to set a new goal or objective
    - User wants to update progress on an existing goal
    - User asks to review their active or completed goals
    - User says "목표 달성률이 어떻게 돼" or "목표 추가해줘"
  not_for:
    - Date countdowns or reminders (use dday skill)
    - Personal diary entries or reflections
---

# Goal Tracking Skill

Create and track personal goals with progress (0–100%).

## When to Use

✅ **USE this skill when:**

- User wants to create or register a personal goal (health, learning, finance, career, etc.)
- User wants to update how much progress they have made toward a goal (percentage)
- User wants to review their active or completed goals
- Any request about tracking achievement or progress toward a defined objective

## When NOT to Use

❌ **DON'T use this skill when:**

- Counting days to a date → use **dday skill**
- Daily diary entries → use diary skill
- Financial records → use finance skill

## Commands

Always pass `--user-id {user_id}` (extract from `[Context: user_id=...]`).

### Add a goal

```bash
python3 goals/scripts/goals.py --user-id {user_id} add \
  --title "올해 책 12권 읽기" \
  --category 학습 \
  --target-date 2026-12-31
```

```bash
# With description
python3 goals/scripts/goals.py --user-id {user_id} add \
  --title "몸무게 5kg 감량" \
  --category 건강 \
  --description "매일 30분 운동" \
  --target-date 2026-06-30
```

### List goals

```bash
# All goals
python3 goals/scripts/goals.py --user-id {user_id} list

# Filter by status
python3 goals/scripts/goals.py --user-id {user_id} list --status active
```

### Update progress (0–100)

```bash
python3 goals/scripts/goals.py --user-id {user_id} update \
  --id "책 읽기" \
  --progress 50
```

Progress 100 automatically sets status to "completed".

## Options

| Subcommand | Flag | Required | Description |
|------------|------|----------|-------------|
| `add` | `--title` | ✅ | Goal name |
| `add` | `--category` | ❌ | 건강·재정·학습·커리어·관계·취미·기타 |
| `add` | `--description` | ❌ | Optional memo |
| `add` | `--target-date` | ❌ | YYYY-MM-DD deadline |
| `list` | `--status` | ❌ | active · completed |
| `update` | `--id` | ✅ | Goal ID prefix or title keyword |
| `update` | `--progress` | ✅ | 0–100 integer |

## Examples

**"올해 안에 책 12권 읽기 목표 추가해줘"**
```bash
python3 goals/scripts/goals.py --user-id abc123 add \
  --title "올해 책 12권 읽기" \
  --category 학습 \
  --target-date 2026-12-31
```

**"내 목표 보여줘"**
```bash
python3 goals/scripts/goals.py --user-id abc123 list
```

**"책 읽기 목표 50% 달성했어"**
```bash
python3 goals/scripts/goals.py --user-id abc123 update --id "책 읽기" --progress 50
```
