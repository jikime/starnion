---
name: python3 dday/scripts/dday.py
display_name: 디데이
description: "Set and track countdowns to important dates — deadlines, anniversaries, exams, events. Use when the user wants to know how many days until a date, register a countdown, or manage date-based reminders. NOT for: goals/progress tracking (use goals skill), calendar scheduling."
version: 1.0.0
emoji: "📅"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords:
    - 디데이
    - D-Day
    - 남은 날
    - 며칠 남았
    - 기념일
    - 시험
    - 마감
    - 발표
    - 결혼기념일
    - 생일
    - 여행
    - 출시
    - countdown
    - days until
    - anniversary
    - deadline
    - event countdown
  when_to_use:
    - User asks how many days are left until a specific date
    - User wants to register a countdown for an event or deadline
    - User asks about upcoming anniversaries or special dates
    - User says "며칠 남았" or "디데이 등록해줘"
  not_for:
    - Goal progress tracking (use goals skill)
    - Calendar scheduling or event booking
---

# D-Day Tracking Skill

Set countdowns to important dates (events, deadlines, anniversaries).

## When to Use

✅ **USE this skill when:**

- User wants to register a countdown to a specific date (event, deadline, anniversary, exam…)
- User asks how many days remain until a date
- User wants to list, view, or delete their countdowns
- Any request about tracking the passage of time toward a target date

## When NOT to Use

❌ **DON'T use this skill when:**

- Progress tracking or achievements → use goals skill
- Simple reminders without a date countdown → use diary skill
- Financial deadlines → use finance skill

## Commands

Always pass `--user-id {user_id}` (extract from `[Context: user_id=...]`).

### Set a D-Day

```bash
python3 dday/scripts/dday.py --user-id {user_id} set \
  --title "프롬라인 부산 워크샵" \
  --target-date "2026-03-23" \
  --icon "🏢"
```

```bash
# With description and recurring
python3 dday/scripts/dday.py --user-id {user_id} set \
  --title "생일" \
  --target-date "2026-06-15" \
  --icon "🎂" \
  --description "케이크 준비" \
  --recurring
```

### List D-Days

```bash
# Active only (default)
python3 dday/scripts/dday.py --user-id {user_id} list

# Include past D-Days
python3 dday/scripts/dday.py --user-id {user_id} list --include-past
```

### Delete a D-Day

```bash
python3 dday/scripts/dday.py --user-id {user_id} delete --id {id}
```

## Options

| Flag | Required | Description |
|------|----------|-------------|
| `--title` | ✅ | D-Day name |
| `--target-date` | ✅ | Date in YYYY-MM-DD |
| `--icon` | ❌ | Emoji icon (default: 📅) |
| `--description` | ❌ | Optional memo |
| `--recurring` | ❌ | Repeat every year |
| `--include-past` | ❌ | Include past entries in list |

## Date Parsing

When the user says a relative or short date, convert to YYYY-MM-DD:
- "3월 23일" → current year → `2026-03-23`
- "내일" → tomorrow's date
- "다음주 금요일" → compute the date

## Examples

**"3월 23일 프롬라인 부산 워크샵 디데이로 설정"**
```bash
python3 dday/scripts/dday.py --user-id abc123 set \
  --title "프롬라인 부산 워크샵" \
  --target-date "2026-03-23" \
  --icon "🏢"
```

**"디데이 목록 보여줘"**
```bash
python3 dday/scripts/dday.py --user-id abc123 list
```

**"생일 디데이 삭제해줘" (ID: 5)**
```bash
python3 dday/scripts/dday.py --user-id abc123 delete --id 5
```
