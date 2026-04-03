---
name: python3 diary/scripts/diary.py
display_name: 일기
description: Save personal diary entries and daily emotional logs — personal feelings, daily reflections, mood tracking. NOT for factual notes or reminders (use memo skill).
version: 1.0.0
emoji: "📔"
category: personal
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - python3 diary/scripts/diary.py
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 일기
    - 오늘 하루
    - 오늘 있었던
    - 감정
    - 기분
    - 일상
    - 힘들었어
    - 좋았어
    - 속상했어
    - 기록해줘
    - diary
    - journal
    - mood
    - feelings
    - daily log
    - reflection
  when_to_use:
    - User wants to write a diary entry about their day
    - User shares emotional experiences or daily reflections
    - User asks to log how they felt or what happened today
    - User says "오늘 일기 써줘" or "오늘 하루 기록해줘"
  not_for:
    - Factual notes or reminders (use memo skill)
    - Work tasks or to-do items
---

# Personal Diary & Daily Log

Use `python3 diary/scripts/diary.py` to save and retrieve **personal diary entries and emotional daily logs**.

Always pass `--user-id {user_id}` (extract from `[Context: user_id=...]` at the top of the message).

## When to use Diary vs Memo

| User intent | Use | Reason |
|-------------|-----|--------|
| User shares personal feelings, emotions, or daily reflections | **diary** | Personal diary / emotional log |
| User wants to save factual information, work notes, or reminders | **memo** | Quick factual note → use memo skill |

**Rule**: Personal feelings, daily reflections, mood → `diary`. Factual information, work notes, reminders → `memo` skill.

## Command Selection Guide

**IMPORTANT**: Choose the right subcommand based on user intent:

| User intent | Subcommand | When to use |
|-------------|------------|-------------|
| User wants to write a full diary entry with mood | `save` | Structured diary entry with mood and title |
| User wants to see recent diary entries | `list` | List recent entries |
| User wants to read a specific date's entry | `get` | Retrieve entry by date |

## Commands

### Quick memo / daily log (lightweight) — use for "메모해줘", "기록해줘"
```bash
python3 diary/scripts/diary.py --user-id {user_id} log \
  --content "{content}"
```

Optionally add sentiment:
```bash
python3 diary/scripts/diary.py --user-id {user_id} log \
  --content "{content}" \
  --sentiment {sentiment}
```

**Sentiment values:** 좋음, 나쁨, 보통, 행복, 피곤, 스트레스, 불안, 우울 (optional)

### Save a diary entry (structured) — use for "일기 써줘"
```bash
python3 diary/scripts/diary.py --user-id {user_id} save \
  --content "{content}" \
  --title "{title}" \
  --mood {mood} \
  --tags "{tag1},{tag2}" \
  --date 2025-01-15
```

**Mood values:** 매우좋음, 좋음, 보통, 나쁨, 매우나쁨
(Also accepts: 행복, 기쁨, 피곤, 슬픔, 우울, 스트레스, etc.)

### List recent entries
```bash
python3 diary/scripts/diary.py --user-id {user_id} list --limit 5
```

### Get a specific date entry
```bash
python3 diary/scripts/diary.py --user-id {user_id} get --date 2026-03-19
```

## Examples

User: "주식 얘기인데.. 메모해줘" / "기록해줘" / "적어줘" / "노트해줘"
```bash
python3 diary/scripts/diary.py --user-id abc123 log \
  --content "주식은 내가 팔때 오르고 살때 내린다. 종목 공부가 필요하다."
```

User: "오늘 스트레스 받았어 기록해줘"
```bash
python3 diary/scripts/diary.py --user-id abc123 log \
  --content "오늘 업무 스트레스가 심했다." \
  --sentiment 스트레스
```

User: "오늘 일기 써줘. 오늘 운동하고 기분이 좋았어."
```bash
python3 diary/scripts/diary.py --user-id abc123 save \
  --content "오늘 운동을 했다. 오랜만에 땀을 흘렸더니 기분이 상쾌하다." \
  --title "운동한 날" \
  --mood 좋음 \
  --tags "운동,건강"
```

User: "내가 쓴 일기를 가져와" / "일기 보여줘" / "최근 일기" / "최근 메모 보여줘"
```bash
python3 diary/scripts/diary.py --user-id abc123 list --limit 5
```

User: "오늘 일기 읽어줘" / "3월 19일 일기"
```bash
python3 diary/scripts/diary.py --user-id abc123 get --date 2026-03-19
```
