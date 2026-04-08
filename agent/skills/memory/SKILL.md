---
name: memory
display_name: 기억 검색
description: "Search past conversations and personal records using semantic search. Use for: 예전에 말했던, 기억나, 저번에, 과거 대화, 기억해줘, recall previous conversation, what did I say before"
version: 1.0.0
emoji: "🧠"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - starnion-memory
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 기억
    - 기억해
    - 과거
    - 예전에
    - 전에 말했던
    - 저번에
    - 기억나
    - 찾아줘
    - 대화 기록
    - 오늘의 한마디 찾아줘
    - recall
    - remember
    - past conversation
    - history
    - previous
    - what did I say
    - search memory
  when_to_use:
    - User asks about something they mentioned in a previous conversation
    - User says "예전에 말했던 거 기억나?" or "저번에 어떻게 했더라"
    - User wants to retrieve a past record or log
    - User asks "내가 언제 X 했더라?" referring to past records
  not_for:
    - Saving new memories (use planner-reflection for notes, planner-diary for 오늘의 한마디)
    - Real-time search of external information (use websearch skill)
---

# Memory Search (RAG)

Use `starnion-memory` to search past diary entries, daily logs, and conversations using semantic similarity.

Always pass `--user-id {user_id}`.

## Commands

### Semantic search
```bash
starnion-memory --user-id {user_id} search --query "{search query}" --limit 5
```

### List recent memories
```bash
starnion-memory --user-id {user_id} list --limit 10
```

## Security Validation (REQUIRED before storing)

Before running any `starnion-memory` write/store command, always validate the content first:

```bash
python3 {skills_dir}/memory/scripts/validate_memory.py --text "{content to store}"
```

- If output is `OK` → proceed with `starnion-memory` command
- If output starts with `BLOCKED:` → do NOT store, inform the user why

Validation checks: length ≤ 2200 chars, no invisible unicode, no prompt injection patterns, no exfiltration patterns.

## Examples

User: "저번에 운동 얘기했던 거 있어?"
```bash
starnion-memory --user-id abc123 search --query "운동 체력 건강" --limit 5
```

User: "내가 스트레스 받았던 적 있어?"
```bash
starnion-memory --user-id abc123 search --query "스트레스 힘들었던 날" --limit 5
```
