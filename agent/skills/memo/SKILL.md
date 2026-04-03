---
name: memo
display_name: 메모
description: "Save quick factual notes, work information, contact details, and reminders. Use for: 메모, 기억해줘, 저장해줘, 연락처, 전화번호, 적어줘, note saving, jot down, remember this. NOT for diary/emotions (use diary skill)."
version: 1.0.0
emoji: "📝"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 메모
    - 기록
    - 저장해줘
    - 외워줘
    - 기억해줘
    - 연락처
    - 전화번호
    - 주소
    - 정보 저장
    - 적어줘
    - note
    - memo
    - save this
    - remember this
    - jot down
    - contact info
  when_to_use:
    - User wants to save factual information or quick notes
    - User provides contact details, addresses, or work information to save
    - User says "기억해줘", "저장해줘", or "적어줘"
    - User wants to retrieve previously saved notes or memos
  not_for:
    - Personal diary entries or emotional logs (use diary skill)
    - Large documents or files (use documents skill)
---

# Quick Memo & Notes

Use `python3 memo/scripts/memo.py` to save **factual notes, work info, reminders, and quick memos**.

Always pass `--user-id {user_id}`.

## When to use Memo vs Diary

| User intent | Use | Reason |
|-------------|-----|--------|
| User wants to save a factual piece of information, note, contact, or reminder | **memo** | Quick factual note |
| User shares work-related info, schedules, or contact details | **memo** | Work/factual info |
| User expresses personal feelings, emotions, or daily reflections | **diary** | Personal diary entry |

**Rule**: Factual information, work-related notes, reminders → `memo`. Personal feelings and daily diary → `diary`.

## Commands

### Save a memo

```bash
python3 memo/scripts/memo.py --user-id {user_id} save \
  --content "{content}" \
  --title "{title}" \
  --tag "{tag}"
```

- `--title`: Optional. Defaults to first 30 chars of content
- `--tag`: Optional. Category tag (기본값: `개인`). Examples: `업무`, `개인`, `일정`, `연락처`

### List recent memos

```bash
python3 memo/scripts/memo.py --user-id {user_id} list --limit 10
python3 memo/scripts/memo.py --user-id {user_id} list --tag 업무
```

### Search memos

```bash
python3 memo/scripts/memo.py --user-id {user_id} search --query "{keyword}"
```

### Delete a memo

```bash
python3 memo/scripts/memo.py --user-id {user_id} delete --id {id}
```

## Examples

**User:** "가온소프트랩은 매주 금요일 9시~5시 근무야, 메모해줘"
```bash
python3 memo/scripts/memo.py --user-id abc123 save \
  --content "가온소프트랩은 매주 금요일 오전 9시 출근, 오후 5시 퇴근" \
  --title "가온소프트랩 금요일 근무" \
  --tag "업무"
```

**User:** "홍길동 전화번호 010-1234-5678 저장해줘"
```bash
python3 memo/scripts/memo.py --user-id abc123 save \
  --content "홍길동 010-1234-5678" \
  --title "홍길동 연락처" \
  --tag "연락처"
```

**User:** "내 메모 보여줘"
```bash
python3 memo/scripts/memo.py --user-id abc123 list --limit 10
```

**User:** "업무 메모만 보여줘"
```bash
python3 memo/scripts/memo.py --user-id abc123 list --tag 업무
```

**User:** "가온소프트랩 관련 메모 찾아줘"
```bash
python3 memo/scripts/memo.py --user-id abc123 search --query "가온소프트랩"
```
